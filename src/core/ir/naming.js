// 시트명·필드명 → C# 식별자
//
// 사양: docs/spec.md §6.4
//
// 변환은 이 파일 하나만 한다. 두 곳에서 변환하면 JSON 키와 C# 필드명이 조용히
// 어긋나고, 증상은 "런타임에 필드가 전부 기본값" 으로 나타나 원인을 찾기 어렵다.
//
// emit/csharp/ 이 아니라 ir/ 에 있는 이유는 §6.4 가 정한 "identifier = JSON 키 =
// C# 필드명" 때문이다. JSON·CSV 출력도 이 변환에 의존하므로 C# 전용이 아니다.

// C# 식별자의 첫 글자: 문자 또는 밑줄.
const IDENTIFIER_START = /[\p{L}\p{Nl}_]/u;

// 두 번째 글자부터: 문자·숫자·결합 문자·연결 문장부호.
//
// C# 명세는 서식 문자(\p{Cf}, zero-width space 등)도 허용하지만 일부러 뺀다.
// 시트에 보이지 않는 문자가 섞이면 눈에 똑같은 두 필드명이 다른 키가 되는데,
// 그것이 이 도구가 막으려는 버그의 전형이다. 빼면 밑줄로 치환되어 W105 가 뜨고
// 사람이 알아챌 수 있다.
const IDENTIFIER_PART = /[\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}]/u;

// 시트명을 PascalCase 로 만들 때 단어 경계로 보는 문자.
const WORD_BOUNDARY = /[\s\-._]+/u;

/**
 * C# 예약 키워드. 이 목록에 든 이름은 `E007` 이다.
 *
 * 문맥 키워드(value · var · record · dynamic · async 등)는 넣지 않는다. 식별자로
 * 쓰는 것이 합법이기 때문이다 — `public int value;` 는 컴파일된다. 합법인 이름을
 * 막으면, 자동 개명을 하지 않기로 한 이상 사용자가 시트를 고쳐야 한다.
 */
export const RESERVED_WORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked',
  'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum',
  'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto',
  'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
  'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public',
  'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string',
  'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
  'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while',
]);

/**
 * 필드명 → 식별자. 최소 변환이다.
 *
 * 대소문자를 건드리지 않는다. `drop_ids` 를 `DropIds` 로 바꾸면 시트를 쓴 사람이
 * 생성 코드에서 자기 열을 못 찾는다. 한글도 그대로 둔다 — C# 명세상 합법이고,
 * 로마자로 옮기는 것은 원본과의 연결을 끊는 일이다.
 *
 * 예약어를 자동으로 바꾸지 않는다. 그대로 돌려주고 `E007` 로 보고한다.
 *
 * @param {string} name 원본 필드명
 * @returns {string} 변환된 식별자. 쓸 수 있는지는 isUsableIdentifier 로 확인한다
 */
export function toFieldIdentifier(name) {
  if (typeof name !== 'string') return '';
  return applyIdentifierRules(name.normalize('NFC'));
}

/**
 * 시트명 → 클래스명. PascalCase 로 만든다.
 *
 * 클래스명만 C# 관습을 따르는 이유는 필드와 달리 사람이 시트에서 찾을 이름이
 * 아니기 때문이다. 공백·하이픈·점·밑줄을 단어 경계로 본다.
 *
 * 각 단어의 첫 글자만 올리고 나머지는 그대로 둔다. `ITEM` 을 `Item` 으로 낮추면
 * NPC·UI 같은 약어가 전부 망가진다.
 *
 * @param {string} sheetName 원본 시트명
 * @returns {string}
 */
export function toClassName(sheetName) {
  if (typeof sheetName !== 'string') return '';

  const words = sheetName
    .normalize('NFC')
    .split(WORD_BOUNDARY)
    .filter((word) => word !== '');
  if (words.length === 0) return '';

  return applyIdentifierRules(words.map(capitalizeFirst).join(''));
}

/**
 * 이름 구실을 하는 식별자인지.
 *
 * `___` 는 C# 문법상 합법이지만 이름이 없는 것과 같다 (spec.md §6.4). `E011` 의 조건이다.
 *
 * @param {string} identifier
 * @returns {boolean}
 */
export function isUsableIdentifier(identifier) {
  return typeof identifier === 'string' && identifier !== '' && /[^_]/u.test(identifier);
}

/**
 * @param {string} word
 * @returns {boolean}
 */
export function isReservedWord(word) {
  // C# 키워드는 전부 소문자다. Class 와 INT 는 합법인 식별자이므로 대소문자를 구분한다.
  return RESERVED_WORDS.has(word);
}

function applyIdentifierRules(text) {
  const converted = [...text]
    .map((char) => (IDENTIFIER_PART.test(char) ? char : '_'))
    .join('');
  if (converted === '') return '';

  // 숫자로 시작하면 밑줄을 앞에 붙인다.
  return IDENTIFIER_START.test([...converted][0]) ? converted : `_${converted}`;
}

function capitalizeFirst(word) {
  const [first, ...rest] = [...word];
  return first.toUpperCase() + rest.join('');
}
