// UI 파이프라인 — 바이트 → IR → 진단 → 출력.
//
// 사양: docs/spec.md §7.1(설정), §3.1(헤더 행은 설정값), §5.1(E 가 있으면 내보내기 중단)
//
// runPipeline 이 File 이 아니라 바이트를 받으므로 Node 에서 그대로 돈다. UI 작업에서
// 검증할 수 있는 부분을 남겨두려고 이 경계를 골랐다. S10 에서 Worker 로 옮길 때
// 바뀌는 파일도 여기 하나다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { isError } from '../src/core/ir/diagnostic.js';
import { DEFAULT_SETTINGS, normalizeSettings, runPipeline } from '../src/ui/pipeline.js';
import { buildWorkbook } from './fixtures/build.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

/** 픽스처 def 를 xlsx 바이트로 만든다. 브라우저가 넘겨줄 것과 같은 형태다. */
function fixtureBytes(name) {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', `${name}.def.json`), 'utf8'));
  return XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
}

function bytesOf(sheets) {
  return XLSX.write(buildWorkbook(sheets), { type: 'buffer', bookType: 'xlsx' });
}

// ── 설정 정규화 ──────────────────────────────────────────────────────

test('빈 설정은 기본값이 된다', () => {
  const settings = normalizeSettings({});

  assert.deepEqual(settings.layout, {
    nameRow: 1,
    typeRow: 2,
    commentRow: 3,
    dataStartRow: 4,
  });
  assert.equal(settings.arrayDelimiter, ',');
  assert.equal(settings.namespace, 'GameData');
});

test('폼에서 온 문자열을 정수로 읽는다', () => {
  // input[type=number] 도 값은 문자열로 온다.
  const settings = normalizeSettings({
    nameRow: '2',
    typeRow: '3',
    commentRow: '4',
    dataStartRow: '6',
  });

  assert.deepEqual(settings.layout, {
    nameRow: 2,
    typeRow: 3,
    commentRow: 4,
    dataStartRow: 6,
  });
});

test('주석 행을 비우면 주석 행이 없는 것이다', () => {
  // 사양 §3.1 — 주석 행은 없앨 수도 있다. 기본값 3 으로 되돌리면 안 된다.
  for (const blank of ['', '   ', null]) {
    assert.equal(normalizeSettings({ commentRow: blank }).layout.commentRow, null, `${blank}`);
  }
});

test('행 번호를 비우면 기본값이다', () => {
  // 주석 행과 달리 나머지 행은 없앨 수 없으므로 빈 값은 "안 정했다" 로 읽는다.
  const settings = normalizeSettings({ nameRow: '', typeRow: '  ', dataStartRow: null });
  assert.equal(settings.layout.nameRow, 1);
  assert.equal(settings.layout.typeRow, 2);
  assert.equal(settings.layout.dataStartRow, 4);
});

test('잘못된 행 번호를 거부한다', () => {
  for (const bad of ['0', '-1', '1.5', 'abc', '１']) {
    assert.throws(() => normalizeSettings({ nameRow: bad }), /행/, `${bad} 는 거부되어야 한다`);
  }
});

test('겹치는 헤더 행을 거부한다', () => {
  // normalizeLayout 이 던지는 예외가 그대로 올라와야 한다. 설정 문제는 셀 좌표가
  // 없으므로 진단이 아니라 예외다.
  assert.throws(() => normalizeSettings({ nameRow: '1', typeRow: '1' }), /겹칩니다/);
  assert.throws(() => normalizeSettings({ dataStartRow: '2' }), /데이터 시작 행/);
});

test('배열 구분자는 비우면 쉼표다', () => {
  assert.equal(normalizeSettings({ arrayDelimiter: '' }).arrayDelimiter, ',');
  assert.equal(normalizeSettings({ arrayDelimiter: ';' }).arrayDelimiter, ';');
});

test('큰따옴표는 배열 구분자가 될 수 없다', () => {
  // notation §5.3 에서 큰따옴표는 원소 인용이다. 구분자로 쓰면 둘을 구분할 수 없다.
  assert.throws(() => normalizeSettings({ arrayDelimiter: '"' }), /구분자/);
});

test('네임스페이스는 비우면 기본값이고 공백을 다듬는다', () => {
  assert.equal(normalizeSettings({ namespace: '' }).namespace, 'GameData');
  assert.equal(normalizeSettings({ namespace: '  My.Game  ' }).namespace, 'My.Game');
});

test('DEFAULT_SETTINGS 는 고정되어 있다', () => {
  assert.throws(() => {
    DEFAULT_SETTINGS.nameRow = 9;
  });
});

// ── 파이프라인 ───────────────────────────────────────────────────────

test('basic 픽스처는 내보내기를 통과한다', () => {
  const result = runPipeline(fixtureBytes('basic'), { fileName: 'basic.xlsx' });

  assert.equal(result.blocked, false, 'E 가 없으면 내보낼 수 있다');
  assert.deepEqual(result.diagnostics.filter(isError), []);
  assert.equal(result.ir.sheets.length, 2);
});

test('E 가 하나라도 있으면 내보내기를 막는다', () => {
  // 사양 §5.1
  const result = runPipeline(fixtureBytes('refs'), { fileName: 'refs.xlsx' });

  assert.equal(result.blocked, true);
  assert.ok(result.diagnostics.some((item) => item.code === 'E004'));
});

test('시트당 JSON 파일 하나를 낸다', () => {
  const { outputs } = runPipeline(fixtureBytes('basic'), { fileName: 'basic.xlsx' });

  assert.deepEqual(
    outputs.json.map((file) => file.fileName),
    ['Monster.json', 'Item.json'],
  );
  assert.match(outputs.json[0].text, /"id": 1001/);
});

test('C# 은 enum · 클래스 · 로더를 모두 낸다', () => {
  const { outputs } = runPipeline(fixtureBytes('basic'), { fileName: 'basic.xlsx' });
  const names = outputs.csharp.map((file) => file.fileName);

  assert.ok(names.includes('Grade.cs'), 'enum 이 빠졌다');
  assert.ok(names.includes('Monster.cs'), '데이터 클래스가 빠졌다');
  assert.ok(names.includes('GameDataTables.cs'), '로더가 빠졌다');
});

test('네임스페이스 설정이 C# 출력에 반영된다', () => {
  const { outputs } = runPipeline(fixtureBytes('basic'), {
    fileName: 'basic.xlsx',
    settings: { namespace: 'My.Game' },
  });

  for (const file of outputs.csharp) {
    assert.match(file.text, /namespace My\.Game/, file.fileName);
  }
});

test('헤더 행 번호가 하드코딩되어 있지 않다', () => {
  // 사양 §3.1 — 기존 시트를 가진 팀이 헤더를 옮기지 않고 쓸 수 있어야 한다.
  const shifted = bytesOf({
    Monster: [
      ['(설명 행)', ''],
      ['id', 'hp'],
      ['int', 'int'],
      [1001, 30],
    ],
  });

  const result = runPipeline(shifted, {
    fileName: 'shifted.xlsx',
    settings: { nameRow: '2', typeRow: '3', commentRow: '', dataStartRow: '4' },
  });

  assert.deepEqual(result.diagnostics.filter(isError), []);
  assert.deepEqual(result.ir.sheets[0].rows[0].values, { id: 1001, hp: 30 });
});

test('배열 구분자 설정이 파싱에 반영된다', () => {
  const bytes = bytesOf({
    Monster: [
      ['id', 'drops'],
      ['int', 'int[]'],
      ['', ''],
      [1001, '10;20'],
    ],
  });

  const result = runPipeline(bytes, {
    fileName: 'semi.xlsx',
    settings: { arrayDelimiter: ';' },
  });

  assert.deepEqual(result.diagnostics.filter(isError), []);
  assert.deepEqual(result.ir.sheets[0].rows[0].values.drops, [10, 20]);
});

test('같은 바이트는 같은 출력을 낸다', () => {
  // 사양 §8 — UI 를 거쳐도 결정성이 유지되어야 한다.
  const bytes = fixtureBytes('basic');
  const first = runPipeline(bytes, { fileName: 'basic.xlsx' });
  const second = runPipeline(bytes, { fileName: 'basic.xlsx' });

  assert.deepEqual(second.outputs, first.outputs);
});

test('파일명이 IR 에 담긴다', () => {
  const result = runPipeline(fixtureBytes('basic'), { fileName: '내 데이터.xlsx' });
  assert.equal(result.ir.source.fileName, '내 데이터.xlsx');
});

test('잘못된 설정은 예외로 알린다', () => {
  assert.throws(
    () => runPipeline(fixtureBytes('basic'), { fileName: 'basic.xlsx', settings: { nameRow: '0' } }),
    /행/,
  );
});
