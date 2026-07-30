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
import {
  DEFAULT_SETTINGS,
  checkOutputSettings,
  describeOutputs,
  normalizeSettings,
  runOnWorkbook,
  runPipeline,
} from '../src/ui/pipeline.js';
import { SAMPLE_WORKBOOK } from '../src/ui/sample.js';
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

test('C# 은 런타임 · enum · 클래스를 낸다', () => {
  const { outputs } = runPipeline(fixtureBytes('basic'), { fileName: 'basic.xlsx' });
  const names = outputs.csharp.map((file) => file.fileName);

  assert.ok(names.includes('GameDataRuntime.cs'), '런타임이 빠졌다');
  assert.ok(names.includes('Grade.cs'), 'enum 이 빠졌다');
  assert.ok(names.includes('Monster.cs'), '데이터 클래스가 빠졌다');
  // 집계 로더는 켜야 나온다 (spec §6.3).
  assert.equal(names.includes('GameDataTables.cs'), false);
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

test('브라우저가 넘기는 바이트 형태를 모두 받는다', () => {
  // app.js 는 File.arrayBuffer() 의 결과를 Uint8Array 로 감싸 넘긴다. Node 테스트가
  // 쓰는 Buffer 도 뷰라 같은 분기를 타지만, 브라우저 쪽 형태를 명시해 둔다.
  const buffer = fixtureBytes('basic');
  const view = new Uint8Array(buffer);
  const arrayBuffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);

  const fromView = runPipeline(view, { fileName: 'basic.xlsx' });
  const fromArrayBuffer = runPipeline(arrayBuffer, { fileName: 'basic.xlsx' });

  assert.deepEqual(fromView.outputs, fromArrayBuffer.outputs);
  assert.equal(fromView.blocked, false);
});

test('잘못된 설정은 예외로 알린다', () => {
  assert.throws(
    () => runPipeline(fixtureBytes('basic'), { fileName: 'basic.xlsx', settings: { nameRow: '0' } }),
    /행/,
  );
});

// ── 예시 데이터 ──────────────────────────────────────────────────────

test('예시는 readWorkbook 이 내는 것과 같은 모양이다', () => {
  // xlsx 를 거치지 않고 파이프라인에 바로 넣는다. 그래서 UI 가 SheetJS 를 알 필요도,
  // base64 덩어리를 소스에 박을 필요도 없다.
  assert.equal(typeof SAMPLE_WORKBOOK.fileName, 'string');
  assert.ok(Array.isArray(SAMPLE_WORKBOOK.sheets));

  for (const sheet of SAMPLE_WORKBOOK.sheets) {
    assert.equal(typeof sheet.name, 'string');
    for (const row of sheet.rows) {
      for (const cell of row) {
        // 엑셀에서 읽은 값은 전부 문자열이다 (notation §5.1). 예시가 숫자를 담으면
        // 파서가 실제로 받는 것과 다른 것을 테스트하게 된다.
        assert.equal(typeof cell, 'string', `${sheet.name} 의 ${cell}`);
      }
    }
  }
});

test('예시는 진단을 하나도 내지 않는다', () => {
  // 첫 화면에서 보는 것이 올바른 시트여야 한다. 경고가 뜨면 규약을 잘못 배운다.
  const result = runOnWorkbook(SAMPLE_WORKBOOK);

  assert.deepEqual(
    result.diagnostics.map((item) => `${item.code} ${item.cell} ${item.message}`),
    [],
  );
  assert.equal(result.blocked, false);
});

test('예시가 표기법을 두루 보여준다', () => {
  const result = runOnWorkbook(SAMPLE_WORKBOOK);
  const types = result.ir.sheets.flatMap((sheet) => sheet.fields.map((field) => field.type.kind));

  for (const kind of ['scalar', 'loc', 'enum', 'array', 'nullable']) {
    assert.ok(types.includes(kind), `${kind} 을 보여주지 않는다`);
  }
  assert.ok(result.ir.enums.length > 0, 'enum 정의 시트가 없다');
});

// ── 출력 파일 설명 ───────────────────────────────────────────────────

test('출력 파일마다 무엇인지와 크기를 붙인다', () => {
  const result = runOnWorkbook(SAMPLE_WORKBOOK);
  const described = describeOutputs(result.ir, result.outputs);

  const monsterJson = described.find((file) => file.fileName === 'Monster.json');
  assert.equal(monsterJson.format, 'json');
  assert.match(monsterJson.description, /Monster/);
  assert.match(monsterJson.description, /행/);
  assert.ok(monsterJson.bytes > 0);
});

test('데이터 클래스 · enum · 런타임 · 집계를 구분해 설명한다', () => {
  const result = runOnWorkbook(SAMPLE_WORKBOOK, { settings: { loader: true } });
  const described = describeOutputs(result.ir, result.outputs);
  const find = (name) => described.find((file) => file.fileName === name).description;

  assert.match(find('Monster.cs'), /클래스/);
  assert.match(find('Grade.cs'), /enum/);
  assert.match(find('GameDataRuntime.cs'), /런타임/);
  assert.match(find('GameDataTables.cs'), /집계/);
});

test('크기는 UTF-8 바이트 수다', () => {
  // 한글 주석이 XML 문서 주석으로 들어가므로 문자 수와 바이트 수가 다르다.
  const result = runOnWorkbook(SAMPLE_WORKBOOK);
  const described = describeOutputs(result.ir, result.outputs);
  const file = described.find((item) => item.fileName === 'Monster.cs');
  const text = result.outputs.csharp.find((item) => item.fileName === 'Monster.cs').text;

  assert.equal(file.bytes, new TextEncoder().encode(text).length);
  assert.ok(file.bytes > text.length, '한글이 들어 있으면 바이트가 더 많다');
});

test('설명 목록의 순서가 출력 순서와 같다', () => {
  // 사양 §8 — 화면에 보이는 순서도 흔들리지 않아야 한다.
  const result = runOnWorkbook(SAMPLE_WORKBOOK);
  const described = describeOutputs(result.ir, result.outputs);

  const jsonNames = described.filter((file) => file.format === 'json').map((file) => file.fileName);
  assert.deepEqual(jsonNames, result.outputs.json.map((file) => file.fileName));
});

// ── 로더 옵션 (spec.md §6.3) ─────────────────────────────────────────

test('C# 출력에 런타임이 항상 들어간다', () => {
  const { outputs } = runOnWorkbook(SAMPLE_WORKBOOK);
  const names = outputs.csharp.map((file) => file.fileName);

  assert.ok(names.includes('GameDataRuntime.cs'), '런타임이 빠지면 생성 코드가 컴파일되지 않는다');
});

test('집계 로더는 기본으로 나오지 않는다', () => {
  // 이 클래스만이 "이 워크북이 게임 데이터 전부다" 를 전제한다.
  const { outputs } = runOnWorkbook(SAMPLE_WORKBOOK);
  const names = outputs.csharp.map((file) => file.fileName);

  assert.equal(names.includes('GameDataTables.cs'), false);
});

test('켜면 집계 로더가 나온다', () => {
  const { outputs } = runOnWorkbook(SAMPLE_WORKBOOK, { settings: { loader: true } });
  const names = outputs.csharp.map((file) => file.fileName);

  assert.ok(names.includes('GameDataTables.cs'));
});

test('집계 로더 클래스명을 바꾼다', () => {
  const { outputs } = runOnWorkbook(SAMPLE_WORKBOOK, {
    settings: { loader: true, loaderClassName: 'MyTables' },
  });
  const names = outputs.csharp.map((file) => file.fileName);

  assert.ok(names.includes('MyTables.cs'));
  assert.equal(names.includes('GameDataTables.cs'), false);
});

test('로더 클래스명을 비우면 기본값이다', () => {
  assert.equal(normalizeSettings({ loaderClassName: '' }).loaderClassName, 'GameDataTables');
  assert.equal(normalizeSettings({ loaderClassName: '  Tables  ' }).loaderClassName, 'Tables');
});

test('C# 출력 순서를 고정한다', () => {
  // 사양 §8 — 미리보기 목록이 이 순서로 보인다.
  const { outputs } = runOnWorkbook(SAMPLE_WORKBOOK, { settings: { loader: true } });

  assert.deepEqual(outputs.csharp.map((file) => file.fileName), [
    'GameDataRuntime.cs',
    'Grade.cs',
    'Monster.cs',
    'Item.cs',
    'GameDataTables.cs',
  ]);
});

test('런타임은 워크북이 달라도 같은 바이트다', () => {
  const sample = runOnWorkbook(SAMPLE_WORKBOOK);
  const basic = runPipeline(fixtureBytes('basic'), { fileName: 'basic.xlsx' });
  const runtimeOf = (result) =>
    result.outputs.csharp.find((file) => file.fileName === 'GameDataRuntime.cs').text;

  assert.equal(runtimeOf(sample), runtimeOf(basic));
});

test('런타임 파일도 설명이 붙는다', () => {
  const result = runOnWorkbook(SAMPLE_WORKBOOK);
  const described = result.described ?? describeOutputs(result.ir, result.outputs);
  const runtime = described.find((file) => file.fileName === 'GameDataRuntime.cs');

  assert.match(runtime.description, /런타임/);
  assert.ok(runtime.bytes > 0);
});

// ── 설정 조합 검사 (spec.md §6.2) ────────────────────────────────────

test('C# 만 켜면 JSON 이 없다고 알린다', () => {
  // 생성된 C# 은 JSON 을 읽는다. JSON 이 없으면 Load 가 읽을 파일이 없다.
  const issues = checkOutputSettings(['csharp']);

  assert.equal(issues.length, 1);
  assert.match(issues[0], /JSON/);
});

test('CSV 와 C# 을 켜도 JSON 이 없으면 알린다', () => {
  // CSV 는 차이 확인용이고 런타임이 읽는 형식이 아니다 (사양 §6.2).
  assert.equal(checkOutputSettings(['csharp', 'csv']).length, 1);
});

test('JSON 을 함께 켜면 조용하다', () => {
  assert.deepEqual(checkOutputSettings(['json', 'csharp']), []);
  assert.deepEqual(checkOutputSettings(['json', 'csharp', 'csv']), []);
});

test('C# 없이 JSON 이나 CSV 만 켜면 조용하다', () => {
  assert.deepEqual(checkOutputSettings(['json']), []);
  assert.deepEqual(checkOutputSettings(['csv']), []);
  assert.deepEqual(checkOutputSettings(['json', 'csv']), []);
});

test('C# 을 끈 채 집계 로더를 켜면 아무 것도 안 나온다고 알린다', () => {
  const issues = checkOutputSettings(['json'], { loader: true });

  assert.equal(issues.length, 1);
  assert.match(issues[0], /로더/);
});

test('C# 을 켰으면 집계 로더 설정은 문제가 아니다', () => {
  assert.deepEqual(checkOutputSettings(['json', 'csharp'], { loader: true }), []);
});

test('알림은 막지 않는다', () => {
  // 이미 JSON 이 프로젝트에 있고 C# 만 다시 보려는 경우가 있다. 내보내기를 막는
  // 판단은 진단의 E 만 한다 (사양 §5.1).
  const result = runOnWorkbook(SAMPLE_WORKBOOK);
  assert.equal(result.blocked, false);
});
