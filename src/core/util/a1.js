// (시트명, 행 번호, 열 인덱스) → "Monster!D17"
//
// 사양: docs/spec.md §5.1
//
// 좌표 계산을 이 파일 하나로 모으는 이유는 spec.md §4.1 이 적은 그대로다.
// 계산이 호출부마다 흩어지면 "Monster!D17" 이 조금씩 어긋나기 시작하고,
// 어긋난 좌표는 잘못된 좌표보다 나쁘다 — 사람이 엉뚱한 셀을 고친다.
//
// 이 파일은 다른 모듈을 import 하지 않는다.

const LETTER_COUNT = 26;
const CODE_A = 'A'.charCodeAt(0);

/**
 * 0부터 세는 열 인덱스를 엑셀 열 문자로 바꾼다.
 *
 * 일반 26진법이 아니라 bijective base-26 이다. 'Z'(25) 다음이 'AA'(26) 이고
 * 0 자리를 나타내는 문자가 따로 없어, 자리를 올릴 때마다 1을 빼야 한다.
 *
 * @param {number} index 0 → 'A', 26 → 'AA'
 * @returns {string}
 */
export function columnLetter(index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`열 인덱스는 0 이상의 정수여야 합니다: ${describe(index)}`);
  }

  let letters = '';
  let remaining = index;
  for (;;) {
    letters = String.fromCharCode(CODE_A + (remaining % LETTER_COUNT)) + letters;
    remaining = Math.floor(remaining / LETTER_COUNT) - 1;
    if (remaining < 0) return letters;
  }
}

/**
 * @param {string} sheetName 원본 시트명. 변환하지 않는다
 * @param {number} rowNumber 엑셀 화면과 같이 1부터 세는 행 번호
 * @param {number} columnIndex 0부터 세는 열 인덱스
 * @returns {string} 'Monster!D17'
 */
export function cellRef(sheetName, rowNumber, columnIndex) {
  const sheet = checkSheetName(sheetName);
  if (!Number.isInteger(rowNumber) || rowNumber < 1) {
    throw new Error(`행 번호는 1 이상의 정수여야 합니다: ${describe(rowNumber)}`);
  }
  return `${sheet}!${columnLetter(columnIndex)}${rowNumber}`;
}

/**
 * 시트 전체에 걸린 진단의 좌표. spec.md §5.1 이 시트명까지만 적도록 정했다.
 *
 * @param {string} sheetName
 * @returns {string} 'Monster!'
 */
export function sheetRef(sheetName) {
  return `${checkSheetName(sheetName)}!`;
}

function checkSheetName(sheetName) {
  if (typeof sheetName !== 'string' || sheetName.trim() === '') {
    throw new Error(`시트명은 비어 있지 않은 문자열이어야 합니다: ${describe(sheetName)}`);
  }
  return sheetName;
}

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') return String(value);
  return `${typeof value} ${JSON.stringify(value)}`;
}
