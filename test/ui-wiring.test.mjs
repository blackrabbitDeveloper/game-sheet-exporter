// index.html 과 app.js 의 배선을 정적으로 확인한다.
//
// 빌드 도구가 없으므로 오타를 잡아주는 컴파일 단계가 없다. `$('#run-buton')` 은
// 조용히 null 이 되고, 증상은 "버튼을 눌러도 아무 일이 없다" 로 나타난다. 이 테스트가
// 그 자리를 메운다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const html = read('index.html');
const appJs = read('src/ui/app.js');
const css = read('src/ui/app.css') + read('vendor/blackrabbit-ui/blackrabbit-ui.css');

/** 정규식으로 모든 캡처 그룹을 모은다. */
function matchAll(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

test('app.js 가 찾는 모든 ID 가 index.html 에 있다', () => {
  const declared = new Set(matchAll(html, /\sid="([^"]+)"/g));
  const queried = matchAll(appJs, /\$\('#([^']+)'\)/g);

  assert.ok(queried.length > 10, `쿼리를 못 찾았다: ${queried.length}개`);

  const missing = queried.filter((id) => !declared.has(id));
  assert.deepEqual(missing, [], `index.html 에 없는 ID: ${missing.join(', ')}`);
});

test('index.html 의 ID 가 중복되지 않는다', () => {
  const ids = matchAll(html, /\sid="([^"]+)"/g);
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual(duplicated, [], `중복된 ID: ${duplicated.join(', ')}`);
});

// 카드 이름은 스타일이 아니라 의미 표시용 훅이다. 배치는 .workspace-grid 와
// .output-grid 가 하고, 카드 자체의 모양은 .br-card 가 준다.
const SEMANTIC_HOOK = /-card$/;

test('index.html 이 쓰는 클래스가 모두 CSS 에 있다', () => {
  // 선택자 어디에 나와도 정의된 것으로 본다 — .tab.is-active 처럼 조합으로만
  // 쓰이는 클래스가 있다.
  const defined = new Set(matchAll(css, /\.([a-zA-Z][a-zA-Z0-9_-]*)/g));

  const used = new Set(
    matchAll(html, /\sclass="([^"]+)"/g).flatMap((value) => value.split(/\s+/)).filter(Boolean),
  );

  const missing = [...used]
    .filter((name) => !defined.has(name) && !SEMANTIC_HOOK.test(name))
    .sort();
  assert.deepEqual(missing, [], `CSS 에 없는 클래스: ${missing.join(' ')}`);
});

test('render.js 가 만드는 클래스가 모두 CSS 에 있다', () => {
  const renderJs = read('src/ui/render.js');
  const defined = new Set(matchAll(css, /\.([a-zA-Z][a-zA-Z0-9_-]*)/g));

  // element(tag, 'a b', ...) 의 두 번째 인자와 classList.add('x') 를 모은다.
  const fromElement = matchAll(renderJs, /element\('[a-z]+',\s*'([^']+)'/g);
  const fromTemplate = matchAll(renderJs, /element\('[a-z]+',\s*`([a-z0-9 _-]*)/g);
  const fromClassList = matchAll(renderJs, /classList\.(?:add|remove|toggle)\('([^']+)'\)/g);
  const fromTernary = matchAll(renderJs, /\?\s*'(is-[a-z-]+)'\s*:\s*'(is-[a-z-]+)'/g);
  const fromTernaryElse = [...renderJs.matchAll(/\?\s*'is-[a-z-]+'\s*:\s*'(is-[a-z-]+)'/g)].map(
    (match) => match[1],
  );

  const used = new Set(
    [...fromElement, ...fromTemplate, ...fromClassList, ...fromTernary, ...fromTernaryElse]
      .flatMap((value) => value.split(/\s+/))
      .filter(Boolean),
  );

  assert.ok(used.size > 8, `클래스를 못 찾았다: ${[...used].join(' ')}`);

  const missing = [...used].filter((name) => !defined.has(name)).sort();
  assert.deepEqual(missing, [], `CSS 에 없는 클래스: ${missing.join(' ')}`);
});

test('app.js 가 문법 오류 없이 파싱된다', () => {
  // app.js 는 어떤 테스트도 import 하지 않는다 — 최상위에서 document 를 만지므로
  // Node 에서 실행할 수 없다. 그래서 문법 오류가 있어도 브라우저를 열기 전까지
  // 아무도 모른다. --check 는 실행하지 않고 파싱만 한다.
  for (const path of ['src/ui/app.js', 'src/ui/render.js', 'src/ui/sample.js']) {
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  }
});

test('app.js 는 데모 코드를 남기지 않았다', () => {
  // 스타터 템플릿의 가짜 진행률과 안내 문구가 남으면 실제로 동작하지 않는 화면이
  // 동작하는 것처럼 보인다.
  assert.doesNotMatch(appJs, /runDemoProcess/);
  assert.doesNotMatch(appJs, /연결하세요/);
});

test('index.html 이 사양 §7.1 의 설정 항목을 모두 갖는다', () => {
  // 헤더 행 번호는 설정값이다 (사양 §3.1). 하드코딩하지 않는다는 뜻은 화면에
  // 입력 칸이 있어야 한다는 뜻이다.
  const names = new Set(matchAll(html, /\sname="([^"]+)"/g));

  for (const name of [
    'nameRow',
    'typeRow',
    'commentRow',
    'dataStartRow',
    'arrayDelimiter',
    'namespace',
    'format',
    // 집계 로더는 켜야 나오므로 켤 자리가 있어야 한다 (사양 §6.3).
    'loader',
    'loaderClassName',
  ]) {
    assert.ok(names.has(name), `설정 입력이 없다: ${name}`);
  }
});
