// 개발 서버가 내주는 MIME 타입.
//
// 브라우저는 모듈 스크립트의 Content-Type 이 JavaScript 가 아니면 실행을 거부한다.
// 빌드 도구가 없어 이 프로젝트는 브라우저에게 파일을 그대로 넘기므로, MIME 하나가
// 빠지면 페이지가 첫 import 에서 죽는다. 실제로 vendor/sheetjs/xlsx.mjs 가 그랬다.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MIME_TYPES } from '../serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const JAVASCRIPT_MIME = 'text/javascript';

function filesUnder(directory) {
  const found = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

test('ES 모듈 확장자는 JavaScript MIME 으로 나간다', () => {
  assert.equal(MIME_TYPES['.js'], JAVASCRIPT_MIME);
  assert.equal(MIME_TYPES['.mjs'], JAVASCRIPT_MIME, 'vendor/sheetjs/xlsx.mjs 가 .mjs 다');
});

test('브라우저가 불러오는 파일의 확장자가 MIME 맵에 모두 있다', () => {
  // 확장자가 없는 파일(LICENSE, VERSION)과 .gitkeep 은 페이지가 불러오지 않는다.
  const extensions = new Set(
    [...filesUnder('src'), ...filesUnder('vendor')]
      .map((path) => extname(path))
      .filter((extension) => extension !== '' && extension !== '.gitkeep'),
  );

  const missing = [...extensions].filter((extension) => !(extension in MIME_TYPES)).sort();
  assert.deepEqual(missing, [], `MIME 맵에 없는 확장자: ${missing.join(' ')}`);
});

test('index.html 이 쓰는 확장자도 들어 있다', () => {
  assert.ok('.html' in MIME_TYPES);
  assert.ok('.css' in MIME_TYPES);
});
