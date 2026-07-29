// zero-build / zero-dependency 제약을 npm test 마다 확인한다.
// CLAUDE.md 규칙 2와 3에 해당한다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('런타임 npm 의존성이 없다', () => {
  assert.deepEqual(
    pkg.dependencies,
    {},
    'dependencies 는 비어 있어야 한다. 서드파티는 vendor/ 에 파일로 커밋한다.',
  );
});

test('필수 스크립트가 있다', () => {
  for (const name of ['dev', 'test', 'fixtures']) {
    assert.ok(pkg.scripts?.[name], `package.json 에 ${name} 스크립트가 없다`);
  }
});

test('vendor 배포본이 버전과 라이선스를 함께 갖는다', () => {
  const files = [
    'vendor/blackrabbit-ui/blackrabbit-ui.css',
    'vendor/blackrabbit-ui/blackrabbit-ui.js',
    'vendor/sheetjs/xlsx.full.min.js',
    'vendor/sheetjs/xlsx.mjs',
    'vendor/sheetjs/LICENSE',
    'vendor/sheetjs/VERSION',
  ];
  const missing = files.filter((file) => !existsSync(join(root, file)));
  assert.deepEqual(missing, [], `vendor 파일이 없다:\n${missing.join('\n')}`);
});

test('SheetJS VERSION 이 실제 배포본과 일치한다', async () => {
  const declared = readFileSync(join(root, 'vendor/sheetjs/VERSION'), 'utf8').trim();
  assert.match(declared, /^\d+\.\d+\.\d+$/, 'VERSION 은 x.y.z 형식이어야 한다');

  const sheetjs = await import('../vendor/sheetjs/xlsx.mjs');
  assert.equal(
    sheetjs.version,
    declared,
    'VERSION 파일과 vendor/sheetjs/xlsx.mjs 의 실제 버전이 다르다',
  );
});
