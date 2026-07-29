// W106 — 로컬라이즈 키 형식
//
// 사양: docs/spec.md §5.3 · docs/notation.md §4.1
//
// 키 존재 확인(E014)은 로컬라이즈 테이블이 함께 주어진 경우에만 한다. 형식 확인은
// 테이블 없이도 할 수 있고, 번역 작업이 늦게 따라오는 게 보통이므로 형식만 먼저 본다.
import { diagnostic } from '../../ir/diagnostic.js';
import { forEachValue } from '../traverse.js';

export const code = 'W106';
export const title = '로컬라이즈 키 형식';

const LOCALIZATION_KEY = /^[A-Z][A-Z0-9_]*$/;

export function check(ir) {
  const found = [];

  forEachValue(ir, ({ type, value, cell, field }) => {
    if (type.kind !== 'loc') return;
    if (typeof value === 'string' && LOCALIZATION_KEY.test(value)) return;

    found.push(
      diagnostic(
        code,
        cell,
        `로컬라이즈 키 형식이 아닙니다: ${value}`,
        `${field.name} 열. 대문자로 시작하고 대문자·숫자·밑줄만 씁니다`,
      ),
    );
  });

  return found;
}
