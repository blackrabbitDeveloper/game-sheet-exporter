// 골든 파일 비교.
//
// 개발가이드 §5.2:
//   npm test                 비교
//   UPDATE_GOLDEN=1 npm test 의도적 변경 시 갱신
//
// CLAUDE.md: 골든은 임의로 갱신하지 않는다. 불일치가 나면 고치지 말고 diff 를
// 보고한다. 갱신은 사람이 판단해서 하고, 항상 chore(golden) 접두사로 별도 커밋한다.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const goldenDirectory = fileURLToPath(new URL('../golden/', import.meta.url));

/**
 * 객체를 골든 파일에 쓸 JSON 문자열로 만든다.
 *
 * 들여쓰기 2칸, 줄바꿈 LF, 파일 끝 개행 (spec.md §6.1).
 * 키 순서는 삽입 순서를 따르므로 정렬하지 않는다.
 *
 * @param {*} value
 * @returns {string}
 */
export function toGoldenJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * @param {string} name 'basic.ir.json'
 * @param {string} actual 비교할 텍스트
 */
export function assertGolden(name, actual) {
  const path = join(goldenDirectory, name);
  const text = actual.endsWith('\n') ? actual : `${actual}\n`;

  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(goldenDirectory, { recursive: true });
    writeFileSync(path, text, 'utf8');
    return;
  }

  assert.ok(
    existsSync(path),
    `골든 파일이 없습니다: test/golden/${name}\n` +
      'UPDATE_GOLDEN=1 npm test 로 만든 뒤 내용을 확인하고 커밋하십시오.',
  );

  const expected = readFileSync(path, 'utf8');
  assert.equal(
    text,
    expected,
    `골든 파일과 다릅니다: test/golden/${name}\n` +
      '출력 형식을 의도적으로 바꾼 것이라면 UPDATE_GOLDEN=1 npm test 로 갱신하고\n' +
      'chore(golden) 커밋으로 따로 남기십시오. 아니라면 회귀입니다.',
  );
}
