// 개발용 정적 서버. `npm run dev`.
//
// 빌드 도구가 없으므로 브라우저에게 파일을 그대로 넘긴다. 그래서 Content-Type 이
// 곧 실행 여부를 결정한다 — 모듈 스크립트가 JavaScript MIME 으로 나가지 않으면
// 브라우저가 실행을 거부하고 페이지가 첫 import 에서 죽는다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

/** 확장자 → Content-Type. test/serve.test.mjs 가 빠진 확장자를 확인한다. */
export const MIME_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  // SheetJS 배포본이 .mjs 다. 빠지면 application/octet-stream 으로 나가고
  // 브라우저가 모듈 실행을 거부한다.
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

export function createStaticServer(root = process.cwd()) {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, `http://${request.headers.host}`).pathname,
    );
    const relative = normalize(pathname)
      .replace(/^(\.\.[/\\])+/, '')
      .replace(/^[/\\]+/, '');

    let file = join(root, relative || 'index.html');
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const type = MIME_TYPES[extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    createReadStream(file).pipe(response);
  });
}

// 테스트가 MIME_TYPES 를 import 할 수 있어야 하므로, 직접 실행할 때만 listen 한다.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const port = Number(process.env.PORT) || 8000;
  createStaticServer().listen(port, '127.0.0.1', () =>
    console.log(`http://127.0.0.1:${port}`),
  );
}
