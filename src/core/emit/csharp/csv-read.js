// TypeNode → CSV 한 셀을 읽는 C# 표현식
//
// 사양: docs/spec.md §6.2, §6.3 · docs/notation.md §5.2, §5.3
//
// types.js 가 "이 필드는 C# 에서 무슨 타입인가" 를 답하고, 이 파일은 "그 값을 CSV
// 셀에서 어떻게 꺼내는가" 를 답한다. 둘을 한 파일에 두지 않는 이유는 매핑이 서로
// 다르기 때문이다 — `string` 과 `string?` 은 같은 C# 타입이지만 빈 셀 처리가 달라
// 읽기 표현식이 갈라진다.
//
// 빈 셀의 뜻은 타입이 정한다 (notation §5.2). T 는 오류, T? 는 null, T[] 는 빈
// 목록, T[]? 는 null 이다. 이 구분이 틀리면 CSV 로 읽은 값이 JSON 으로 읽은 값과
// 달라지고, 그건 이 도구가 막으려는 종류의 버그다.
import { DEFAULT_ARRAY_DELIMITER } from '../../ir/schema.js';

// 스칼라 → GameDataParse 의 함수 이름. 참조 타입(string)은 여기 없다 — Value<T> 의
// struct 제약을 쓸 수 없고 빈 셀 처리도 달라 전용 메서드로 간다.
const PARSERS = {
  int: 'Int',
  long: 'Long',
  float: 'Float',
  double: 'Double',
  bool: 'Bool',
  datetime: 'Date',
};

/**
 * @param {object} field IR 의 필드
 * @param {object} ir enum 클래스명과 ref 대상 타입을 찾는 데 쓴다
 * @param {{arrayDelimiter?: string}} [options]
 * @returns {string} `row.Value("id", GameDataParse.Int)` 같은 C# 표현식
 */
export function toCsvReadExpression(field, ir, options = {}) {
  const delimiter = options.arrayDelimiter ?? DEFAULT_ARRAY_DELIMITER;
  return read(field.type, quote(field.identifier), ir, delimiter);
}

function read(type, column, ir, delimiter) {
  const resolved = resolve(type, ir);

  if (resolved.kind === 'array') {
    return readArray(resolved.of, column, ir, delimiter);
  }

  if (resolved.kind === 'nullable') {
    const inner = resolve(resolved.of, ir);
    // T[]? — 배열 전체가 없을 수 있다.
    if (inner.kind === 'array') {
      return readArray(inner.of, column, ir, delimiter, true);
    }
    // string? 와 loc? 는 C# 에서 그냥 string 이라 표현식으로만 구분된다.
    if (isText(inner)) return `row.TextOrNull(${column})`;
    return `row.ValueOrNull(${column}, ${parser(inner, ir)})`;
  }

  if (isText(resolved)) return `row.Text(${column})`;
  return `row.Value(${column}, ${parser(resolved, ir)})`;
}

function readArray(element, column, ir, delimiter, orNull = false) {
  const resolved = resolve(element, ir);
  const suffix = orNull ? 'OrNull' : '';
  const separator = `, ${quote(delimiter)}`;

  // string?[] 는 원소가 참조 타입이라 nullable 이 의미 없다 — TextList 와 같다.
  if (resolved.kind === 'nullable') {
    const inner = resolve(resolved.of, ir);
    if (isText(inner)) return `row.TextList${suffix}(${column}${separator})`;
    return `row.NullableList${suffix}(${column}, ${parser(inner, ir)}${separator})`;
  }

  if (isText(resolved)) return `row.TextList${suffix}(${column}${separator})`;
  // 메서드 이름이 List 면 GameDataCsvRow 안의 new List<T>() 가 이 멤버를 먼저 찾아
  // CS0118 이 된다. Nullable 도 System.Nullable 을 가린다.
  return `row.ValueList${suffix}(${column}, ${parser(resolved, ir)}${separator})`;
}

/**
 * `ref:` 를 대상 필드의 타입으로 바꾼다.
 *
 * notation §4.3 이 "C# 타입은 대상 필드의 타입을 그대로 따른다" 로 정했으므로
 * 읽는 방법도 그것을 따라간다. 대상이 없으면 E008 이 이미 내보내기를 막았다.
 */
function resolve(type, ir) {
  if (type?.kind !== 'ref') return type;

  const sheet = ir.sheets.find((item) => item.name === type.sheet);
  const field = sheet?.fields.find((item) => item.name === type.field);
  if (!field) return { kind: 'scalar', name: 'string' };

  // 대상이 또 ref 면 한 단계만 따라간다 — 순환은 값 수준이라 허용된다.
  return field.type.kind === 'ref' ? { kind: 'scalar', name: 'string' } : resolve(field.type, ir);
}

/** 참조 타입인가. string 과 loc 뿐이다. */
function isText(type) {
  return type?.kind === 'loc' || (type?.kind === 'scalar' && type.name === 'string');
}

function parser(type, ir) {
  if (type.kind === 'enum') {
    const definition = ir.enums.find((item) => item.name === type.name);
    // 정의가 없으면 E008 이 이미 막았다. 이름을 그대로 써 컴파일 오류로 드러낸다.
    return `GameDataParse.Enum<${definition?.className ?? type.name}>`;
  }

  const name = PARSERS[type.name];
  // 알 수 없는 스칼라는 여기까지 오지 않는다 (E005 가 파싱 단계에서 거부한다).
  return `GameDataParse.${name ?? 'Text'}`;
}

/** C# 문자열 리터럴. 구분자에 따옴표나 역슬래시가 들어올 수 있다. */
function quote(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
