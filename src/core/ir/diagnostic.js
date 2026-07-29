// 검증 결과 하나를 나타내는 객체.
//
// 사양: docs/spec.md §5.1, §5.5
//
// 파싱 단계(core/parser/)와 검증 단계(core/validate/)가 같은 객체를 낸다.
// 사용자는 어느 단계에서 나왔는지 알 필요가 없고, 리포트 형식은 하나다.
//
// validate/ 가 아니라 ir/ 에 두는 이유는 진단이 IR 과 함께 이동하는 데이터이기
// 때문이다. parser/ → validate/ 라는 의존 방향을 만들지 않는다.

const CODE_PATTERN = /^[EW]\d{3}$/;

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
