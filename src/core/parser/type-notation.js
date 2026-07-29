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

// 토큰 사이의 공백만 무시한다. 식별자 안에는 공백을 넣을 수 없다 —
// 'enum:Item Type' 이 조용히 'ItemType' 이 되면 안 된다.
function skipSpace(state) {
  while (state.index < state.source.length && /\s/.test(state.source[state.index])) {
    state.index += 1;
  }
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
  const word = readWord(state);
  if (word === '') throw fail(state, `${what} 이 없습니다`);
  return word;
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
