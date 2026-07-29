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
 * 엑셀 열 문자를 0부터 세는 인덱스로 되돌린다.
 *
 * @param {string} letters 'A' → 0, 'AA' → 26
 * @returns {number}
 */
export function columnIndex(letters) {
  if (typeof letters !== 'string' || !/^[A-Z]+$/.test(letters)) {
    throw new Error(`열 문자는 A~Z 로만 이뤄져야 합니다: ${describe(letters)}`);
  }

  let index = 0;
  for (const letter of letters) {
    index = index * LETTER_COUNT + (letter.charCodeAt(0) - CODE_A + 1);
  }
  return index - 1;
}

/**
 * 'Monster!D17' 을 시트명·행·열로 되돌린다.
 *
 * 진단을 위치 순으로 정렬할 때와, S9 에서 검증 항목을 클릭해 원본 셀로 이동할 때
 * 쓴다. 시트 전체 좌표('Monster!')는 행과 열이 null 이고, 파일 전체 좌표(파일명)는
 * 셀 좌표가 아니므로 null 을 돌려준다.
 *
 * @param {string} text
 * @returns {{sheet: string, row: number|null, column: number|null}|null}
 */
export function parseCellRef(text) {
  if (typeof text !== 'string') return null;

  // 엑셀 시트명에는 느낌표가 들어갈 수 있다. 'Hi!!A1' 은 시트 'Hi!' 의 A1 이다.
  const separator = text.lastIndexOf('!');
  if (separator <= 0) return null;

  const sheet = text.slice(0, separator);
  const rest = text.slice(separator + 1);
  if (rest === '') return { sheet, row: null, column: null };

  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(rest);
  if (!match) return null;
  return { sheet, row: Number(match[2]), column: columnIndex(match[1]) };
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
