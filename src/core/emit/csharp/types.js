// TypeNode → C# 타입 표기
//
// 사양: docs/notation.md §2.1, §3 · docs/spec.md §6.3
//
// class.js 와 loader.js 가 공유한다. 두 곳에서 따로 매핑하면 필드 선언과 조회
// 메서드의 타입이 조용히 어긋난다.

const SCALARS = {
  int: 'int',
  long: 'long',
  float: 'float',
  double: 'double',
  bool: 'bool',
  string: 'string',
  datetime: 'DateTime',
};

// 참조 타입은 원래 null 이 될 수 있다. string? 나 List<int>? 는 C# 8 의 nullable
// 참조 문맥(#nullable enable)을 요구하는데, 생성 코드가 프로젝트의 컴파일 설정에
// 의존하게 만들 이유가 없다 (notation.md §2.1).
const REFERENCE_TYPES = new Set(['string']);

const FALLBACK = 'string';

/**
 * @param {object} type TypeNode
 * @param {object} ir enum 클래스명과 ref 대상 타입을 찾는 데 쓴다
 * @returns {string} 'int' · 'List<int>' · 'Grade' · 'DateTime?'
 */
export function toCSharpType(type, ir) {
  return map(type, ir, true);
}

/**
 * 기본키를 Dictionary 의 키로 쓸 수 있으면 그 필드와 타입을, 아니면 null 을 낸다.
 *
 * class.js(IGameData<TKey> 를 붙일지)와 loader.js(테이블 타입 인자)가 같은 판단을
 * 봐야 한다. 두 곳에서 따로 정하면 인터페이스를 붙이지 않은 클래스를 제네릭 제약이
 * 요구하는 자리에 넣는 코드가 나오고, 생성 코드가 컴파일되지 않는다.
 *
 * @param {object} sheet IR 의 시트
 * @param {object} ir
 * @returns {{field: object, csharpType: string}|null}
 */
export function indexableKey(sheet, ir) {
  const field = sheet.fields.find((item) => item.name === sheet.primaryKey) ?? null;
  if (field === null) return null;

  const csharpType = toCSharpType(field.type, ir);
  // List<T> 는 Dictionary 의 키가 될 수 없다. 그런 시트는 목록으로만 노출한다.
  if (csharpType.startsWith('List<')) return null;

  return { field, csharpType };
}

/**
 * @param {boolean} followRef 참조를 따라갈 수 있는지. 한 단계만 따라간다 —
 *   순환 참조가 허용되므로 끝까지 따라가면 멈추지 않는다 (notation.md §4.3).
 */
function map(type, ir, followRef) {
  switch (type?.kind) {
    case 'scalar':
      return SCALARS[type.name] ?? FALLBACK;
    case 'loc':
      return 'string';
    case 'enum':
      return ir.enums.find((item) => item.name === type.name)?.className ?? FALLBACK;
    case 'array':
      return `List<${map(type.of, ir, followRef)}>`;
    case 'nullable':
      return nullable(map(type.of, ir, followRef));
    case 'ref':
      return followRef ? map(targetType(type, ir), ir, false) : FALLBACK;
    default:
      return FALLBACK;
  }
}

function nullable(csharpType) {
  if (csharpType.startsWith('List<') || REFERENCE_TYPES.has(csharpType)) return csharpType;
  return `${csharpType}?`;
}

function targetType(type, ir) {
  const sheet = ir.sheets.find((item) => item.name === type.sheet);
  return sheet?.fields.find((field) => field.name === type.field)?.type ?? null;
}

/**
 * 이 타입이 System.Collections.Generic 을 필요로 하는지.
 *
 * using 을 조건부로 내면 쓰지 않는 네임스페이스가 파일에 남지 않는다.
 *
 * @param {string} csharpType toCSharpType 의 결과
 * @returns {boolean}
 */
export function needsGenericCollections(csharpType) {
  return csharpType.includes('List<');
}
