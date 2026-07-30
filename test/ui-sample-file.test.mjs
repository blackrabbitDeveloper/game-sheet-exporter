// 예시 데이터 → 사람이 열어 보는 xlsx.
//
// 사양: docs/spec.md §3(시트 포맷 규약), §8(결정성)
//
// 이 파일의 핵심 검사는 "만든 파일을 도구에 다시 넣으면 진단이 0건" 이다. 예시가
// 경고를 내면 그것을 열어 본 사람이 규약을 잘못 배운다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LAYOUT } from '../src/core/ir/schema.js';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { validate } from '../src/core/validate/validator.js';
import { SAMPLE_FILE_NAME, buildSampleXlsx, toTypedRows } from '../src/ui/sample-file.js';
import { SAMPLE_WORKBOOK } from '../src/ui/sample.js';

// ── 셀 타입 ──────────────────────────────────────────────────────────

test('데이터 행의 정수는 숫자로, 헤더는 문자열로 둔다', () => {
  // 전부 문자열로 넣으면 엑셀이 "숫자가 텍스트로 저장됨" 경고를 띄워 망가진 파일처럼
  // 보인다. 반대로 헤더까지 숫자로 바꾸면 타입 표기가 깨진다.
  const rows = toTypedRows(
    [
      ['id', 'hp'],
      ['int', 'int'],
      ['고유ID', '체력'],
      ['1001', '30'],
    ],
    4,
  );

  assert.deepEqual(rows[0], ['id', 'hp']);
  assert.deepEqual(rows[1], ['int', 'int']);
  assert.deepEqual(rows[3], [1001, 30]);
});

test('정수가 아닌 데이터는 문자열로 남는다', () => {
  // 배열 셀과 로컬라이즈 키는 숫자가 아니다.
  const rows = toTypedRows([['a'], ['b'], ['c'], ['2001,2002', 'MON_SLIME', '1.5', 'Y']], 4);
  assert.deepEqual(rows[3], ['2001,2002', 'MON_SLIME', '1.5', 'Y']);
});

test('빈 셀은 정말 빈 셀이 된다', () => {
  // 빈 문자열을 넣으면 엑셀에 값이 있는 셀이 되어 빈 셀 규칙(notation §5.2)이 어긋난다.
  const rows = toTypedRows([['a'], ['b'], ['c'], ['', '1']], 4);
  assert.deepEqual(rows[3], [null, 1]);
});

test('원본 행을 바꾸지 않는다', () => {
  const rows = [['a'], ['b'], ['c'], ['1']];
  const before = JSON.stringify(rows);
  toTypedRows(rows, 4);

  assert.equal(JSON.stringify(rows), before);
});

test('데이터 시작 행을 따른다', () => {
  const rows = toTypedRows([['1'], ['2'], ['3']], 2);

  assert.deepEqual(rows[0], ['1'], '헤더는 그대로');
  assert.deepEqual(rows[1], [2]);
  assert.deepEqual(rows[2], [3]);
});

// ── 만든 파일 ────────────────────────────────────────────────────────

test('xlsx 바이트를 낸다', () => {
  const bytes = buildSampleXlsx();

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 1000, `너무 작다: ${bytes.length}`);
  // xlsx 는 zip 이다.
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b]);
});

test('만든 파일을 도구가 다시 읽어 진단이 0건이다', () => {
  // 이 테스트가 이 모듈의 존재 이유다.
  const workbook = readWorkbook(buildSampleXlsx(), { fileName: SAMPLE_FILE_NAME });
  const { ir, diagnostics: parsed } = buildIR(workbook);
  const diagnostics = validate(ir, parsed);

  assert.deepEqual(
    diagnostics.map((item) => `${item.code} ${item.cell} ${item.message}`),
    [],
  );
});

test('예시 데이터와 같은 시트를 담는다', () => {
  const workbook = readWorkbook(buildSampleXlsx(), { fileName: SAMPLE_FILE_NAME });

  assert.deepEqual(
    workbook.sheets.map((sheet) => sheet.name),
    SAMPLE_WORKBOOK.sheets.map((sheet) => sheet.name),
  );
});

test('내려받은 파일과 예시로 시작이 같은 IR 을 만든다', () => {
  // 화면의 예시와 내려받은 파일이 다르면 사람이 둘 중 하나를 잘못 배운다.
  const fromFile = buildIR(readWorkbook(buildSampleXlsx(), { fileName: SAMPLE_FILE_NAME })).ir;
  const fromMemory = buildIR(SAMPLE_WORKBOOK).ir;

  assert.deepEqual(
    fromFile.sheets.map((sheet) => sheet.rows.map((row) => row.values)),
    fromMemory.sheets.map((sheet) => sheet.rows.map((row) => row.values)),
  );
  assert.deepEqual(fromFile.enums, fromMemory.enums);
});

// ── 결정성 (spec.md §8) ──────────────────────────────────────────────

test('두 번 만들면 바이트가 같다', () => {
  // 생성 경로에서 현재 시각을 읽으면 매번 다른 파일이 된다.
  assert.deepEqual(buildSampleXlsx(), buildSampleXlsx());
});

test('파일명이 고정되어 있다', () => {
  assert.match(SAMPLE_FILE_NAME, /\.xlsx$/);
});

test('기본 레이아웃으로 쓰였다', () => {
  // 예시로 시작 버튼이 설정을 기본값으로 되돌리는 것과 같은 전제다.
  assert.equal(DEFAULT_LAYOUT.dataStartRow, 4);
});
