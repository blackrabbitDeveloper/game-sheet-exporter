// 검증 테스트용 IR 조립 헬퍼.
//
// 손으로 쓴 IR 리터럴 대신 실제 파서를 태운다. IR 구조가 바뀌면 규칙 테스트도
// 함께 깨져야 한다 — 리터럴로 쓰면 파서와 규칙이 조용히 갈라진다.
import { buildIR } from '../../src/core/parser/build-ir.js';

/**
 * @param {Record<string, string[][]>} sheets 시트명 → 2차원 문자열 배열
 * @param {object} [options] buildIR 옵션
 * @returns {{ir: object, diagnostics: Array<object>}}
 */
export function irFrom(sheets, options) {
  return buildIR(
    {
      fileName: 'test.xlsx',
      sheets: Object.entries(sheets).map(([name, rows]) => ({ name, rows })),
    },
    options,
  );
}

/** 진단 없이 만들어진 IR 만 돌려준다. 규칙 테스트의 입력은 깨끗해야 한다. */
export function cleanIr(sheets, options) {
  const { ir, diagnostics } = irFrom(sheets, options);
  if (diagnostics.length > 0) {
    const lines = diagnostics.map((item) => `${item.code} ${item.cell} ${item.message}`);
    throw new Error(`픽스처 자체가 파싱 진단을 냈습니다:\n${lines.join('\n')}`);
  }
  return ir;
}
