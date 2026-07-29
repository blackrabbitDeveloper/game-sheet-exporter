// 워크북 바이트 → 2차원 문자열 배열
//
// 사양: docs/notation.md §5.1, §3.2 · docs/spec.md §3.5
//
// CLAUDE.md 규칙 5: core/ 에서 SheetJS 를 아는 유일한 파일이다. 나머지 모듈은
// 여기가 낸 2차원 문자열 배열만 받는다. 그래야 CSV·구글시트·CLI 입력을 붙일 때
// 이 파일 하나만 늘어난다.
import * as XLSX from '../../../vendor/sheetjs/xlsx.mjs';

// 서식·스타일을 읽지 않는다. cellDates 를 켜면 SheetJS 가 날짜를 Date 로 바꿔
// 시리얼 넘버가 사라지고, notation.md §3.2 의 "시리얼 60 이하 거부" 를 적용할 수
// 없게 된다. cellText 는 오류 셀의 표시 문자열(#REF!)을 얻기 위해 켜 둔다.
const READ_OPTIONS = { cellDates: false, cellStyles: false, cellText: true, cellNF: false };

/**
 * @param {ArrayBuffer|Uint8Array|string} data xlsx·xlsm 바이트 또는 CSV 문자열
 * @param {{fileName: string}} options
 * @returns {{fileName: string, sheets: Array<{name: string, rows: string[][]}>}}
 */
export function readWorkbook(data, { fileName } = {}) {
  if (typeof fileName !== 'string' || fileName.trim() === '') {
    throw new Error('파일명이 필요합니다. 시트 좌표와 CSV 시트명이 파일명에서 나옵니다');
  }

  const workbook = readRaw(data);
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: toRows(workbook.Sheets[name]),
  }));

  // CSV 는 시트가 하나뿐인 워크북으로 취급하고 시트명을 파일명에서 가져온다
  // (spec.md §3.5). SheetJS 는 'Sheet1' 이라는 이름을 붙인다.
  if (/\.csv$/i.test(fileName) && sheets.length === 1) {
    sheets[0].name = csvSheetName(fileName);
  }

  return { fileName, sheets };
}

function readRaw(data) {
  if (typeof data === 'string') {
    // spec.md §3.5: UTF-8 만 받되 BOM 유무는 무관하다. SheetJS 는 문자열 입력에서
    // BOM 을 벗기지 않아, 두면 첫 필드명이 보이지 않는 문자로 시작하는 값이 된다.
    return XLSX.read(stripBom(data), { type: 'string', ...READ_OPTIONS });
  }
  if (data instanceof ArrayBuffer) {
    return XLSX.read(new Uint8Array(data), { type: 'array', ...READ_OPTIONS });
  }
  if (ArrayBuffer.isView(data)) return XLSX.read(data, { type: 'array', ...READ_OPTIONS });
  throw new Error('워크북은 ArrayBuffer·Uint8Array 바이트이거나 CSV 문자열이어야 합니다');
}

/**
 * 시트를 2차원 문자열 배열로 편다.
 *
 * 범위의 시작점(`!ref` 의 왼쪽)을 무시하고 항상 A1 부터 채운다. A열과 1행이
 * 통째로 비면 `!ref` 가 B2 부터 시작하는데, 그 자리부터 읽으면 rows[0][0] 이
 * 실제로는 B2 가 되어 이후의 모든 오류 좌표가 한 칸씩 어긋난다.
 *
 * sheet_to_json 을 쓰지 않는 이유도 같다. 뒤쪽 빈 열을 잘라내 행마다 배열
 * 길이가 달라진다.
 */
function toRows(sheet) {
  const ref = sheet?.['!ref'];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const rows = [];

  for (let r = 0; r <= range.e.r; r += 1) {
    const row = [];
    for (let c = 0; c <= range.e.c; c += 1) {
      row.push(cellToString(sheet[XLSX.utils.encode_cell({ r, c })]));
    }
    rows.push(row);
  }

  return rows;
}

/**
 * 셀 하나를 문자열로 만든다 (notation.md §5.1).
 *
 * 서식된 텍스트(`w`)가 아니라 원시 값(`v`)을 쓴다. 천 단위 서식이 걸린 1000 셀을
 * "1,000" 으로 읽으면 배열 구분자와 충돌한다 (notation.md §3).
 */
function cellToString(cell) {
  if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) return '';

  switch (cell.t) {
    case 'b':
      // notation.md §3.1 이 허용하는 표기로 맞춘다.
      return cell.v ? 'TRUE' : 'FALSE';
    case 'e':
      // #REF! 같은 오류 셀. 값을 버리지 않고 넘겨 캐스팅 단계에서 좌표와 함께
      // E006 으로 보고되게 한다.
      return typeof cell.w === 'string' && cell.w !== '' ? cell.w : `#ERROR(${cell.v})`;
    case 'd':
      // cellDates 를 껐으므로 보통 나오지 않는다. 나오면 ISO 로 넘긴다.
      return cell.v instanceof Date ? cell.v.toISOString() : String(cell.v);
    default:
      return typeof cell.v === 'string' ? cell.v : String(cell.v);
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function csvSheetName(fileName) {
  const base = fileName.split(/[\\/]/).pop();
  return base.replace(/\.csv$/i, '');
}
