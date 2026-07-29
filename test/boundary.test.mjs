// src/core/ 의 순수성을 npm test 마다 강제한다.
//
// 런타임 테스트로는 이 경계를 잡을 수 없다. Node 18+ 가 fetch 와 crypto 를 전역으로
// 제공하므로, core/ 안에서 그것들을 써도 Node 테스트는 통과해 버린다. 정적 검사만이
// 유효하다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const coreRoot = join(root, 'src', 'core');

// CLAUDE.md 규칙 4가 명시한 금지 목록
const FORBIDDEN_GLOBALS = ['window', 'document', 'localStorage', 'fetch', 'crypto', 'alert'];

// 규칙 4의 취지상 함께 막아야 하는 것들. 명시 목록이 아니므로 따로 둔다.
const FORBIDDEN_GLOBALS_EXTRA = [
  'sessionStorage',
  'indexedDB',
  'navigator',
  'XMLHttpRequest',
  'Worker',
  'requestAnimationFrame',
];

// SheetJS 를 아는 유일한 파일 (CLAUDE.md 규칙 5)
const SHEETJS_ALLOWED = join('src', 'core', 'parser', 'workbook-reader.js');

function listJsFiles(directory) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return found;
    throw error;
  }
  for (const entry of entries.sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...listJsFiles(path));
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) found.push(path);
  }
  return found;
}

// 주석과 문자열 리터럴을 공백으로 지운다. 안 지우면 규칙을 설명하는 주석이
// 규칙 위반으로 잡힌다.
//
// 한계: 따옴표를 담은 정규식 리터럴(/['"]/ 같은)은 문자열 시작으로 오인될 수 있다.
// core/ 에서 그런 패턴을 쓰게 되면 이 함수를 손봐야 한다.
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

// 식별자로 등장하는 것만 잡는다. obj.document 같은 속성 접근은 통과시킨다.
export function findForbiddenGlobals(source, names = [...FORBIDDEN_GLOBALS, ...FORBIDDEN_GLOBALS_EXTRA]) {
  const code = stripCommentsAndStrings(source);
  return names.filter((name) => new RegExp(String.raw`(?<![.\w$])${name}\b`).test(code));
}

test('가드 자체가 동작한다', () => {
  assert.deepEqual(findForbiddenGlobals('const el = document.body;'), ['document']);
  assert.deepEqual(findForbiddenGlobals('await fetch(url);'), ['fetch']);
  assert.deepEqual(findForbiddenGlobals('// document 를 쓰지 않는다'), []);
  assert.deepEqual(findForbiddenGlobals('/* window 금지 */'), []);
  assert.deepEqual(findForbiddenGlobals("const name = 'localStorage';"), []);
  assert.deepEqual(findForbiddenGlobals('ports.crypto(bytes);'), []);
  assert.deepEqual(findForbiddenGlobals('const documentation = 1;'), []);
});

test('src/core/ 는 브라우저 전역을 쓰지 않는다', () => {
  const offenders = [];
  for (const file of listJsFiles(coreRoot)) {
    const hits = findForbiddenGlobals(readFileSync(file, 'utf8'));
    if (hits.length) offenders.push(`${relative(root, file)} → ${hits.join(', ')}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `core/ 에서 브라우저 API를 쓰면 안 된다. 외부 기능은 core/util/ports.js 로 주입받는다.\n${offenders.join('\n')}`,
  );
});

test('src/core/ 는 ui 를 import 하지 않는다', () => {
  const offenders = [];
  for (const file of listJsFiles(coreRoot)) {
    const source = readFileSync(file, 'utf8');
    if (/from\s+['"][^'"]*\/ui\//.test(source)) offenders.push(relative(root, file));
  }
  assert.deepEqual(offenders, [], `의존 방향은 ui → core 단방향이다.\n${offenders.join('\n')}`);
});

test('SheetJS 는 workbook-reader.js 에서만 참조한다', () => {
  const offenders = [];
  for (const file of listJsFiles(coreRoot)) {
    if (relative(root, file) === SHEETJS_ALLOWED) continue;
    const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    if (/\bXLSX\b/.test(code)) offenders.push(relative(root, file));
    if (/from\s+['"][^'"]*sheetjs/i.test(readFileSync(file, 'utf8'))) offenders.push(relative(root, file));
  }
  assert.deepEqual(
    offenders,
    [],
    `core/ 의 나머지 모듈은 2차원 문자열 배열만 받는다.\n${offenders.join('\n')}`,
  );
});
