// IR → 시트별 JSON
//
// 사양: docs/spec.md §6.1, §8(결정성), §11.1(Newtonsoft 전제 확정)
//
// 출력 구조를 직접 조립한다. JSON.stringify 에 행 객체를 그대로 넘기면 JavaScript 가
// 숫자꼴 키를 앞으로 당겨, 레벨별 스탯처럼 1·2·3 열을 쓰는 시트에서 "키 순서 = 시트
// 열 순서"(§6.1)가 통째로 깨진다. JSON.stringify 는 잎 값 인코딩에만 쓴다.
//
// 키 순서의 근거는 행 객체가 아니라 sheet.fields 배열이다. IR 의 values 객체도
// 같은 이유로 순서를 보장하지 못한다.

const INDENT = '  ';

/**
 * @param {object} ir
 * @param {{minify?: boolean}} [options]
 * @returns {Array<{fileName: string, text: string}>}
 */
export function emitJson(ir, options = {}) {
  const minify = options.minify === true;

  return ir.sheets.map((sheet) => ({
    // 파일명은 클래스명이다. 생성된 C# 클래스가 이 파일을 이름으로 찾는다 (§6.3).
    fileName: `${sheet.className}.json`,
    text: minify ? minified(sheet) : pretty(sheet),
  }));
}

function pretty(sheet) {
  if (sheet.rows.length === 0) return `{\n${INDENT}"rows": []\n}\n`;

  const rows = sheet.rows.map((row) => {
    const entries = sheet.fields.map(
      // 키는 변환된 식별자다. §6.4 가 "identifier = JSON 키 = C# 필드명" 으로
      // 정했으므로 여기서 원본 이름을 쓰면 C# 역직렬화가 조용히 어긋난다.
      (field) => `${INDENT.repeat(3)}${quote(field.identifier)}: ${encode(row.values[field.name])}`,
    );
    return `${INDENT.repeat(2)}{\n${entries.join(',\n')}\n${INDENT.repeat(2)}}`;
  });

  return `{\n${INDENT}"rows": [\n${rows.join(',\n')}\n${INDENT}]\n}\n`;
}

function minified(sheet) {
  const rows = sheet.rows.map((row) => {
    const entries = sheet.fields.map(
      (field) => `${quote(field.identifier)}:${encode(row.values[field.name], ',')}`,
    );
    return `{${entries.join(',')}}`;
  });

  return `{"rows":[${rows.join(',')}]}\n`;
}

/**
 * 잎 값 하나를 JSON 표기로 만든다.
 *
 * 배열은 한 줄로 낸다 (§6.1 의 `"drop_ids": [2001, 2002]`). 원소마다 줄을 나누면
 * 드랍 목록 하나가 열 줄이 되어 diff 를 읽기 어려워진다.
 */
function encode(value, separator = ', ') {
  if (Array.isArray(value)) {
    return `[${value.map((element) => encode(element, separator)).join(separator)}]`;
  }
  // undefined 는 IR 에 없어야 하지만, 있어도 키를 빼지 않고 null 로 낸다.
  if (value === undefined) return 'null';
  // 한글을 \uXXXX 로 바꾸지 않는다. 사람이 읽는 diff 가 더 중요하다.
  return JSON.stringify(value);
}

function quote(text) {
  return JSON.stringify(text);
}
