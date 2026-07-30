// 예시 데이터 → 사람이 열어 보는 xlsx
//
// 사양: docs/spec.md §3(시트 포맷 규약), §8(결정성)
//
// 예시를 만져 보려면 규약대로 생긴 엑셀 파일이 있어야 한다. 화면의 가이드 표와
// `예시로 시작` 버튼과 이 파일이 모두 sample.js 하나를 원본으로 쓰므로 셋이 어긋나지
// 않는다. 만든 파일이 진단 0건인 것은 test/ui-sample-file.test.mjs 가 확인한다.
//
// **왜 core/ 가 아니라 ui/ 인가.** CLAUDE.md 규칙 5 는 `core/` 가 SheetJS 를 모르게
// 하고 예외를 workbook-reader.js 하나로 둔다. 그 규칙의 목적은 CLI·CI 로 옮길 때
// 진입점 하나만 새로 쓰면 되게 하는 것이고, 예시 파일 내려주기는 화면의 편의 기능이라
// 그 경로에 없다. 브라우저 쪽 관심사(Blob·다운로드)를 이미 ui/ 가 들고 있다.
//
// 추가 비용은 없다. XLSX.write 는 페이지가 읽기용으로 이미 불러온 모듈 안에 있다.
import * as XLSX from '../../vendor/sheetjs/xlsx.mjs';
import { DEFAULT_LAYOUT } from '../core/ir/schema.js';
import { SAMPLE_WORKBOOK } from './sample.js';

export const SAMPLE_FILE_NAME = '게임데이터-예시.xlsx';

export const SAMPLE_FILE_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const INTEGER = /^-?[0-9]+$/;

// 결정적 출력을 위해 고정한다. 생성 경로에서 현재 시각을 읽지 않는다 (§8).
const FIXED_CREATED_DATE = new Date(Date.UTC(2020, 0, 1));

/**
 * 데이터 행의 정수꼴 문자열을 숫자로, 빈 문자열을 빈 셀로 바꾼다.
 *
 * 전부 문자열로 넣으면 엑셀이 "숫자가 텍스트로 저장됨" 경고를 띄워 망가진 파일처럼
 * 보인다. 반대로 헤더 행까지 바꾸면 타입 표기가 깨지므로 데이터 행만 손댄다.
 *
 * 배열 셀(`2001,2002`)과 로컬라이즈 키는 정수꼴이 아니라 문자열로 남는다.
 *
 * @param {string[][]} rows
 * @param {number} dataStartRow 1부터 세는 행 번호
 * @returns {Array<Array<string|number|null>>}
 */
export function toTypedRows(rows, dataStartRow) {
  return rows.map((row, index) => {
    if (index + 1 < dataStartRow) return [...row];

    return row.map((cell) => {
      // 빈 문자열을 그대로 넣으면 값이 있는 셀이 되어 빈 셀 규칙이 어긋난다
      // (notation §5.2). null 은 aoa_to_sheet 가 셀을 만들지 않는다.
      if (cell === '') return null;
      return INTEGER.test(cell) ? Number(cell) : cell;
    });
  });
}

/**
 * 예시 워크북의 xlsx 바이트.
 *
 * @returns {Uint8Array}
 */
export function buildSampleXlsx() {
  const workbook = XLSX.utils.book_new();
  workbook.Props = { CreatedDate: FIXED_CREATED_DATE };

  for (const sheet of SAMPLE_WORKBOOK.sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(toTypedRows(sheet.rows, DEFAULT_LAYOUT.dataStartRow)),
      sheet.name,
    );
  }

  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
}
