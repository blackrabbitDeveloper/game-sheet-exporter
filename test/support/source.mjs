// 소스를 정적으로 검사하는 테스트들이 공유하는 헬퍼.
//
// boundary.test.mjs(브라우저 API 금지)와 determinism.test.mjs(현재 시각 금지)가
// 같은 문제를 만난다 — 규칙을 설명하는 주석이 규칙 위반으로 잡히는 문제다.

/**
 * 주석과 문자열 리터럴을 지운다. 안 지우면 규칙을 설명하는 주석이 규칙 위반으로
 * 잡힌다.
 *
 * 한계: 따옴표를 담은 정규식 리터럴(/['"]/ 같은)은 문자열 시작으로 오인될 수 있다.
 * core/ 에서 그런 패턴을 쓰게 되면 이 함수를 손봐야 한다.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripCommentsAndStrings(source) {
  let out = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index] === quote) { index += 1; break; }
        index += 1;
      }
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}
