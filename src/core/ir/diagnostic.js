// 검증 결과 하나를 나타내는 객체.
//
// 사양: docs/spec.md §5.1, §5.5
//
// 파싱 단계(core/parser/)와 검증 단계(core/validate/)가 같은 객체를 낸다.
// 사용자는 어느 단계에서 나왔는지 알 필요가 없고, 리포트 형식은 하나다.
//
// validate/ 가 아니라 ir/ 에 두는 이유는 진단이 IR 과 함께 이동하는 데이터이기
// 때문이다. parser/ → validate/ 라는 의존 방향을 만들지 않는다.

import { parseCellRef } from '../util/a1.js';

const CODE_PATTERN = /^[EW]\d{3}$/;

// 좌표가 없는 자리를 나타낸다. 파일 전체·시트 전체 진단이 그 범위의 셀 진단보다
// 앞에 오도록 -1 을 쓴다.
const NO_POSITION = -1;

/**
 * @param {string} code 'E004' | 'W105'
 * @param {string} cell 'Monster!E4' — 시트 전체면 'Monster!', 파일 전체면 파일명
 * @param {string} message 한 줄 요약
 * @param {string} [detail] 보충 설명
 * @returns {{code: string, cell: string, message: string, detail: string}}
 */
export function diagnostic(code, cell, message, detail = '') {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    throw new Error(`진단 코드는 E000 또는 W000 형식이어야 합니다: ${JSON.stringify(code)}`);
  }
  // spec.md §5.1: 좌표 없는 검증 결과는 미완성으로 간주한다.
  // 생성 시점에 막지 않으면 좌표가 빠진 진단이 리포트까지 흘러간다.
  if (typeof cell !== 'string' || cell.trim() === '') {
    throw new Error(`${code} 에 좌표가 없습니다. 최소한 '시트명!' 까지는 적어야 합니다`);
  }
  if (typeof message !== 'string' || message.trim() === '') {
    throw new Error(`${code} (${cell}) 의 메시지가 비어 있습니다`);
  }

  // 키 순서와 개수를 고정한다. 키가 있다 없다 하면 골든 비교가 흔들린다.
  return { code, cell, message, detail: typeof detail === 'string' ? detail : '' };
}

/** @param {{code: string}} item */
export function isError(item) {
  return item.code.startsWith('E');
}

/** @param {{code: string}} item */
export function isWarning(item) {
  return item.code.startsWith('W');
}

/**
 * E 가 하나라도 있으면 내보내기를 막는다 (spec.md §5.1).
 *
 * @param {Array<{code: string}>} diagnostics
 */
export function hasErrors(diagnostics) {
  return diagnostics.some(isError);
}

/**
 * 진단을 셀 위치 순으로 정렬한다. 원본 배열은 바꾸지 않는다.
 *
 * 파싱 단계와 검증 단계가 각자의 순서로 진단을 내므로, 합쳐서 사람에게 보여줄 때는
 * 한 번 정렬해야 같은 셀의 오류가 리포트 앞뒤로 흩어지지 않는다.
 *
 * 시트 순서는 워크북 순서이고, 목록에 없는 시트는 뒤에 이름순으로 붙는다.
 * 정렬 기준을 전부 결정적인 값으로만 두어야 골든 리포트가 흔들리지 않는다 —
 * localeCompare 는 환경에 따라 결과가 달라지므로 쓰지 않는다.
 *
 * @param {Array<{code: string, cell: string}>} diagnostics
 * @param {string[]} [sheetOrder] 워크북 시트 순서
 * @returns {Array<object>}
 */
export function sortDiagnostics(diagnostics, sheetOrder = []) {
  const order = new Map(sheetOrder.map((name, index) => [name, index]));

  const unknown = [
    ...new Set(
      diagnostics
        .map((item) => parseCellRef(item.cell)?.sheet)
        .filter((name) => name !== undefined && !order.has(name)),
    ),
  ].sort();
  for (const [index, name] of unknown.entries()) order.set(name, sheetOrder.length + index);

  return [...diagnostics].sort((left, right) => compareKeys(sortKey(left, order), sortKey(right, order)));
}

function sortKey(item, order) {
  const position = parseCellRef(item.cell);
  if (position === null) {
    // 파일 전체에 걸린 진단. 어느 시트보다도 앞이다.
    return [NO_POSITION, NO_POSITION, NO_POSITION, item.code, item.message];
  }
  return [
    order.get(position.sheet),
    position.row ?? NO_POSITION,
    position.column ?? NO_POSITION,
    item.code,
    item.message,
  ];
}

function compareKeys(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}
