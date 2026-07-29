// IR → 시트별 CSV
//
// 사양: docs/spec.md §6.2
//
// CSV 는 차이 확인과 다른 도구 연동용이다. 게임 런타임이 읽는 형식은 JSON 이다.
// 헤더가 필드명 한 줄뿐이라 이 도구가 이 파일을 그대로 다시 읽을 수는 없다 —
// 타입 행이 없기 때문이다.
import { DEFAULT_ARRAY_DELIMITER } from '../ir/schema.js';

// 열 구분자는 CSV 의 것으로 고정한다. 배열 구분자(설정값)와는 다른 층위다.
const COLUMN_SEPARATOR = ',';
const NEEDS_QUOTE = /[",\r\n]/;

/**
 * @param {object} ir
 * @param {{arrayDelimiter?: string}} [options]
 * @returns {Array<{fileName: string, text: string}>}
 */
export function emitCsv(ir, options = {}) {
  const arrayDelimiter = options.arrayDelimiter ?? DEFAULT_ARRAY_DELIMITER;

  return ir.sheets.map((sheet) => ({
    fileName: `${sheet.name}.csv`,
    text: render(sheet, arrayDelimiter),
  }));
}

function render(sheet, arrayDelimiter) {
  // 키 순서와 마찬가지로 열 순서의 근거는 fields 배열이다.
  const lines = [sheet.fields.map((field) => escapeField(field.name)).join(COLUMN_SEPARATOR)];

  for (const row of sheet.rows) {
    lines.push(
      sheet.fields
        .map((field) => encodeCell(row.values[field.name], arrayDelimiter))
        .join(COLUMN_SEPARATOR),
    );
  }

  return `${lines.join('\n')}\n`;
}

function encodeCell(value, arrayDelimiter) {
  if (!Array.isArray(value)) return escapeField(scalarText(value));
  if (value.length === 0) return '';

  // §6.2: 배열은 셀 안에서 이어 붙이고 필드 전체를 큰따옴표로 감싼다.
  const joined = value
    .map((element) => encodeElement(element, arrayDelimiter))
    .join(arrayDelimiter);
  return quote(joined);
}

/**
 * 배열 원소 하나.
 *
 * 원소가 구분자나 큰따옴표를 담으면 원소 단위로도 감싼다. 그래야 셀 문자열이
 * value-parser 가 받는 형태로 남고(notation.md §5.3), 사람이 이 값을 시트에
 * 다시 붙여넣어도 원소 경계가 살아난다.
 */
function encodeElement(value, arrayDelimiter) {
  const text = scalarText(value);
  const ambiguous = text.includes(arrayDelimiter) || text.includes('"') || text !== text.trim();
  return ambiguous ? quote(text) : text;
}

function scalarText(value) {
  if (value === null || value === undefined) return '';
  // 엑셀이 내놓는 표기이자 notation.md §3.1 이 받는 표기다.
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function escapeField(text) {
  return NEEDS_QUOTE.test(text) ? quote(text) : text;
}

function quote(text) {
  return `"${text.replace(/"/g, '""')}"`;
}
