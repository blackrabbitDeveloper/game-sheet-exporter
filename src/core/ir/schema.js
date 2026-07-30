// IR 의 버전·기본값과 입력 분류 규칙.
//
// 사양: docs/spec.md §3.1(헤더 행은 설정값), §3.2(시트·열의 종류), §4(IR)

/**
 * 골든 파일이 IR 을 비교하므로 구조가 바뀌면 명시적으로 올린다 (spec.md §4.1).
 *
 * 1 — S2. `name` 만 있었다.
 * 2 — S5. 필드에 `identifier`, 시트와 enum 에 `className` 이 생겼다 (§6.4).
 * 3 — 여러 파일 입력. `source.fileName` 이 `source.files` 가 되고 시트에
 *     `sourceFile` 이 생겼다 (§3.5).
 */
export const IR_VERSION = 3;

/** spec.md §3.1 의 예시 구성. 하드코딩이 아니라 기본값이다. */
export const DEFAULT_LAYOUT = Object.freeze({
  nameRow: 1,
  typeRow: 2,
  commentRow: 3,
  dataStartRow: 4,
});

/** notation.md §5.3. 가장 흔하므로 기본값으로 두고 설정으로 바꾼다. */
export const DEFAULT_ARRAY_DELIMITER = ',';

const ENUM_SHEET_PREFIX = 'enum.';
const IGNORED_SHEET_PREFIXES = ['#', '_'];
const IGNORED_FIELD_PREFIX = '#';

/**
 * 설정으로 받은 헤더 구성을 검증하고 기본값을 채운다.
 *
 * 잘못된 레이아웃은 시트 데이터의 문제가 아니라 설정의 문제이므로 진단이 아니라
 * 예외로 알린다. 진단은 셀 좌표를 갖는데 여기엔 붙일 좌표가 없다.
 *
 * @param {object} [layout]
 * @returns {{nameRow: number, typeRow: number, commentRow: number|null, dataStartRow: number}}
 */
export function normalizeLayout(layout = {}) {
  if (layout === null || typeof layout !== 'object') {
    throw new Error('레이아웃은 객체여야 합니다');
  }

  // commentRow 는 undefined 와 null 이 다르다. "안 정했다" 는 기본값 3 이고
  // "주석 행이 없다" 는 null 이다. ?? 로 합치면 이 구분이 사라진다.
  const commentRow = 'commentRow' in layout ? layout.commentRow : DEFAULT_LAYOUT.commentRow;

  const resolved = {
    nameRow: pick(layout, 'nameRow'),
    typeRow: pick(layout, 'typeRow'),
    commentRow: commentRow === null ? null : checkRow(commentRow, '주석 행'),
    dataStartRow: pick(layout, 'dataStartRow'),
  };

  const headerRows = [
    ['필드명 행', resolved.nameRow],
    ['타입 행', resolved.typeRow],
    ...(resolved.commentRow === null ? [] : [['주석 행', resolved.commentRow]]),
  ];

  for (let i = 0; i < headerRows.length; i += 1) {
    for (let j = i + 1; j < headerRows.length; j += 1) {
      if (headerRows[i][1] === headerRows[j][1]) {
        throw new Error(
          `${headerRows[i][0]}과 ${headerRows[j][0]}이 ${headerRows[i][1]}행으로 겹칩니다`,
        );
      }
    }
  }

  const lastHeaderRow = Math.max(...headerRows.map(([, row]) => row));
  if (resolved.dataStartRow <= lastHeaderRow) {
    throw new Error(
      `데이터 시작 행(${resolved.dataStartRow})은 마지막 헤더 행(${lastHeaderRow})보다 뒤여야 합니다`,
    );
  }

  return resolved;
}

/**
 * @param {string} sheetName 원본 시트명
 * @returns {'data'|'enum'|'ignored'}
 */
export function classifySheet(sheetName) {
  const name = typeof sheetName === 'string' ? sheetName : '';

  // 무시 규칙을 먼저 본다. 쓰지 않게 된 enum 정의 시트에 _ 를 붙여 두는
  // 관습이 있고, 그때 _enum.Old 는 무시 시트여야 한다.
  if (IGNORED_SHEET_PREFIXES.some((prefix) => name.startsWith(prefix))) return 'ignored';
  if (name.startsWith(ENUM_SHEET_PREFIX) && name.length > ENUM_SHEET_PREFIX.length) return 'enum';
  return 'data';
}

/**
 * 필드명이 비었거나 # 로 시작하면 그 열은 무시한다 (spec.md §3.2).
 *
 * 실제 시트에는 계산용 임시 열이 늘 섞여 있고, 그걸 지우라고 요구하는 도구는
 * 쓰이지 않는다.
 *
 * @param {string|undefined} fieldName
 * @returns {boolean}
 */
export function isIgnoredFieldName(fieldName) {
  const name = typeof fieldName === 'string' ? fieldName.trim() : '';
  return name === '' || name.startsWith(IGNORED_FIELD_PREFIX);
}

function pick(layout, key) {
  const value = layout[key] === undefined ? DEFAULT_LAYOUT[key] : layout[key];
  return checkRow(value, key);
}

function checkRow(value, what) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${what}의 행 번호는 1 이상의 정수여야 합니다: ${JSON.stringify(value) ?? value}`);
  }
  return value;
}
