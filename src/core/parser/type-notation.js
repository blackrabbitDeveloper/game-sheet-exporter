// 타입 표기 문자열 → TypeNode
//
// 사양: docs/notation.md
//
// 이 파일은 다른 모듈을 import 하지 않는다. 순수 문자열 처리만 한다.
// 정규식 하나로 처리하지 않고 재귀 하강으로 파싱하는 이유는 접미사가 여러 개 붙고
// 중첩 표기가 나중에 추가되기 때문이다.

const SCALARS = new Set(['int', 'long', 'float', 'double', 'bool', 'string', 'datetime']);

// 식별자는 유니코드 문자로 시작한다. 한글 시트명·필드명을 그대로 쓸 수 있어야 한다
// (docs/spec.md §6.4).
const IDENTIFIER_START = /\p{L}/u;
const IDENTIFIER_PART = /[\p{L}\p{N}_]/u;

// 공백 든 이름을 감싸는 따옴표 (notation.md §2.3). 셀 값 쪽에서 큰따옴표가 이미
// 배열 원소 인용(§5.3)이라 작은따옴표를 쓴다.
const QUOTE = "'";

export class TypeNotationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TypeNotationError';
    this.code = 'E005';
  }
}

/**
 * @param {string} notation 타입 표기 문자열 하나
 * @returns {object} TypeNode — scalar | nullable | array | loc | enum | ref
 * @throws {TypeNotationError} code 'E005'
 */
export function parseTypeNotation(notation) {
  if (typeof notation !== 'string') {
    throw new TypeNotationError(
      `타입 표기는 문자열이어야 합니다: ${describe(notation)}`,
    );
  }

  const state = { source: notation, index: 0 };
  skipSpace(state);
  if (state.index >= state.source.length) {
    throw fail(state, '타입 표기가 비어 있습니다');
  }

  const node = parseType(state);

  skipSpace(state);
  if (state.index < state.source.length) {
    throw fail(state, `표기 뒤에 해석할 수 없는 문자가 남았습니다: '${state.source.slice(state.index)}'`);
  }

  return node;
}

// type := base { suffix }
function parseType(state) {
  let node = parseBase(state);

  for (;;) {
    skipSpace(state);
    const char = state.source[state.index];

    if (char === '?') {
      state.index += 1;
      // int?? 를 허용하면 같은 타입의 표기가 둘로 갈린다 (notation.md §7).
      if (node.kind === 'nullable') {
        throw fail(state, "'?' 가 연달아 붙었습니다");
      }
      node = { kind: 'nullable', of: node };
      continue;
    }

    if (char === '[') {
      state.index += 1;
      skipSpace(state);
      if (state.source[state.index] !== ']') {
        throw fail(state, "'[' 가 ']' 로 닫히지 않았습니다");
      }
      state.index += 1;
      node = { kind: 'array', of: node };
      continue;
    }

    if (char === ']') {
      throw fail(state, "'[' 없이 ']' 가 나왔습니다");
    }

    return node;
  }
}

// base := scalar | 'enum' ':' ident | 'ref' ':' ident '.' ident | 'loc'
function parseBase(state) {
  skipSpace(state);
  const word = readWord(state);

  if (word === '') {
    throw fail(state, '타입 이름이 없습니다');
  }

  if (word === 'enum') {
    expect(state, ':', "enum 은 'enum:<이름>' 형태여야 합니다");
    return { kind: 'enum', name: readIdentifier(state, 'enum 이름') };
  }

  if (word === 'ref') {
    expect(state, ':', "ref 는 'ref:<시트>.<필드>' 형태여야 합니다");
    const sheet = readIdentifier(state, 'ref 의 시트명');
    expect(state, '.', "ref 는 'ref:<시트>.<필드>' 형태여야 합니다");
    const field = readIdentifier(state, 'ref 의 필드명');
    return { kind: 'ref', sheet, field };
  }

  if (word === 'loc') {
    return { kind: 'loc' };
  }

  if (SCALARS.has(word)) {
    return { kind: 'scalar', name: word };
  }

  throw fail(state, `알 수 없는 타입 '${word}' 입니다`);
}

// 토큰 사이의 공백만 무시한다. 인용하지 않은 식별자 안에는 공백을 넣을 수 없다 —
// 'enum:Item Type' 이 조용히 'ItemType' 이 되면 안 된다. 이름에 정말로 공백이
// 들어 있으면 인용한다 (notation.md §2.3).
function skipSpace(state) {
  while (state.index < state.source.length && /\s/.test(state.source[state.index])) {
    state.index += 1;
  }
}

/**
 * 식별자를 표기로 되돌린다 — 인용이 필요할 때만 인용한다 (notation.md §2.3).
 *
 * 진단 메시지가 보여주는 표기를 사용자가 시트에 그대로 옮겨 적을 수 있어야 한다.
 * value-parser 의 formatType 이 이걸 쓴다.
 *
 * @param {string} name 원본 시트명 또는 필드명
 * @returns {string}
 */
export function formatIdentifier(name) {
  if (isPlainIdentifier(name)) return name;
  return QUOTE + String(name).split(QUOTE).join(QUOTE + QUOTE) + QUOTE;
}

/**
 * 인용 없이 쓸 수 있는 이름인지 확인한다.
 *
 * 문자 규칙을 다시 적는 대신 readWord 를 그대로 돌린다. 규칙을 두 곳에 적으면
 * 둘이 갈라지는 순간 formatIdentifier 가 파싱되지 않는 표기를 낸다.
 */
function isPlainIdentifier(name) {
  if (typeof name !== 'string' || name === '') return false;
  return readWord({ source: name, index: 0 }) === name;
}

function readWord(state) {
  const { source } = state;
  let end = state.index;

  if (end >= source.length || !IDENTIFIER_START.test(source[end])) return '';
  end += 1;
  while (end < source.length && IDENTIFIER_PART.test(source[end])) end += 1;

  const word = source.slice(state.index, end);
  state.index = end;
  return word;
}

function readIdentifier(state, what) {
  skipSpace(state);
  if (state.source[state.index] === QUOTE) return readQuotedIdentifier(state, what);

  const word = readWord(state);
  if (word === '') throw fail(state, `${what} 이 없습니다`);
  return word;
}

/**
 * 인용 식별자 (notation.md §2.3).
 *
 * enum: 과 ref: 가 가리키는 것은 C# 식별자가 아니라 원본 시트의 이름이고, 시트명과
 * 필드명에는 공백이 들어온다. 그래서 인용한 내용에는 식별자 문자 규칙을 적용하지
 * 않는다 — 'item-drop' 도 '1등급' 도 조회 키로는 유효하다. 실제로 그 이름의 시트가
 * 있는지는 E008 이 확인한다.
 *
 * 안쪽 공백은 앞뒤까지 보존한다. 조용히 다듬으면 시트를 못 찾는 이유를 알 수 없다.
 */
function readQuotedIdentifier(state, what) {
  const { source } = state;
  let index = state.index + 1; // 여는 따옴표를 지나간다
  let name = '';

  for (;;) {
    if (index >= source.length) throw fail(state, `${what} 의 인용이 닫히지 않았습니다`);

    const char = source[index];
    if (char === '\n' || char === '\r') {
      throw fail(state, `${what} 의 인용 안에 줄바꿈이 있습니다`);
    }

    if (char === QUOTE) {
      // '' 는 닫는 따옴표가 아니라 이름 안의 따옴표 한 개다.
      if (source[index + 1] !== QUOTE) break;
      name += QUOTE;
      index += 2;
      continue;
    }

    name += char;
    index += 1;
  }

  if (name === '') throw fail(state, `${what} 의 인용이 비어 있습니다`);

  state.index = index + 1; // 닫는 따옴표를 지나간다
  return name;
}

function expect(state, char, hint) {
  skipSpace(state);
  if (state.source[state.index] !== char) throw fail(state, hint);
  state.index += 1;
}

function fail(state, detail) {
  return new TypeNotationError(
    `타입 표기를 해석할 수 없습니다: "${state.source}" — ${detail}`,
  );
}

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `배열(${value.length}개)`;
  return `${typeof value} ${JSON.stringify(value)}`;
}
