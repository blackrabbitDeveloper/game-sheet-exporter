// SheetJS 접점의 계약을 고정한다.
//
// 사양: docs/notation.md §5.1(모든 셀은 문자열), §3.2(datetime 은 시리얼),
//       docs/spec.md §3.6(CSV)
//
// 여기서 틀리면 그 뒤의 모든 좌표와 값이 함께 틀린다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';

/** 시트명 → 2차원 배열(AOA) 정의를 xlsx 바이트로 만든다. */
function toXlsx(definition) {
  const workbook = XLSX.utils.book_new();
  workbook.Props = { CreatedDate: new Date(Date.UTC(2020, 0, 1)) };
  for (const [name, rows] of Object.entries(definition)) {
    const sheet = Array.isArray(rows) ? XLSX.utils.aoa_to_sheet(rows) : rows;
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function read(definition, fileName = 'gamedata.xlsx') {
  return readWorkbook(toXlsx(definition), { fileName });
}

// ── 구조 ─────────────────────────────────────────────────────────────

test('시트 순서와 원본 시트명을 보존한다', () => {
  const workbook = read({ Zebra: [['a']], 'enum.Grade': [['b']], '몬스터 정보': [['c']] });
  assert.deepEqual(
    workbook.sheets.map((sheet) => sheet.name),
    ['Zebra', 'enum.Grade', '몬스터 정보'],
  );
});

test('파일명을 그대로 전달한다', () => {
  assert.equal(read({ A: [['x']] }, 'gamedata.xlsx').fileName, 'gamedata.xlsx');
});

// ── 모든 셀은 문자열 (notation.md §5.1) ──────────────────────────────

test('숫자 셀을 문자열로 낸다', () => {
  const [sheet] = read({ Monster: [[1001, 30, -5, 0.5]] }).sheets;
  assert.deepEqual(sheet.rows[0], ['1001', '30', '-5', '0.5']);
});

test('불리언 셀을 TRUE·FALSE 로 낸다', () => {
  // notation.md §3.1 이 허용하는 표기여야 value-parser 가 그대로 받는다.
  const [sheet] = read({ Monster: [[true, false]] }).sheets;
  assert.deepEqual(sheet.rows[0], ['TRUE', 'FALSE']);
});

test('문자열 셀의 공백을 건드리지 않는다', () => {
  // 앞뒤 공백 제거는 값 해석 규칙이라 value-parser 소관이다. 리더는 원본을 옮긴다.
  const [sheet] = read({ Monster: [['  간격  ', 'a b']] }).sheets;
  assert.deepEqual(sheet.rows[0], ['  간격  ', 'a b']);
});

test('서식이 아니라 원시 값을 읽는다', () => {
  // 천 단위 서식이 걸린 1000 을 "1,000" 으로 읽으면 배열 구분자와 충돌한다.
  const sheet = XLSX.utils.aoa_to_sheet([[1000]]);
  sheet.A1.z = '#,##0';
  const [read1] = readWorkbook(toXlsx({ Monster: sheet }), { fileName: 'x.xlsx' }).sheets;
  assert.equal(read1.rows[0][0], '1000');
});

test('날짜 셀을 엑셀 시리얼 넘버로 낸다', () => {
  // notation.md §3.2 의 "시리얼 60 이하 거부" 를 적용하려면 시리얼이 필요하다.
  // SheetJS 가 Date 로 바꿔버리면 1900 윤년 버그 구간을 구분할 수 없다.
  //
  // 실제 xlsx 의 날짜 셀은 날짜 서식이 걸린 숫자다. JS Date 를 aoa_to_sheet 에
  // 넘겨 만들면 SheetJS 가 로컬 타임존으로 변환해 UTC+9 에서는 0.375 가 붙는다 —
  // 그러면 이 테스트가 타임존에 따라 달라진다.
  const sheet = { '!ref': 'A1:B1', A1: { t: 'n', v: 46232, z: 'yyyy-mm-dd' }, B1: { t: 'n', v: 60, z: 'yyyy-mm-dd' } };
  const [read1] = readWorkbook(toXlsx({ Monster: sheet }), { fileName: 'x.xlsx' }).sheets;
  assert.deepEqual(read1.rows[0], ['46232', '60']); // 2026-07-29, 그리고 1900 윤년 버그 구간
});

// ── 좌표 정합성 ──────────────────────────────────────────────────────

test('빈 셀은 빈 문자열이고 행은 시트 너비만큼 채워진다', () => {
  const [sheet] = read({ Monster: [['a', null, 'c'], ['d']] }).sheets;
  assert.deepEqual(sheet.rows, [
    ['a', '', 'c'],
    ['d', '', ''],
  ]);
});

test('시트가 A1 에서 시작하지 않아도 좌표가 밀리지 않는다', () => {
  // A열과 1행이 통째로 비면 !ref 가 B2 부터 시작한다. 범위 시작부터 읽으면
  // rows[0][0] 이 실제로는 B2 가 되어 모든 오류 좌표가 한 칸씩 어긋난다.
  const sheet = { '!ref': 'B2:C3', B2: { t: 's', v: 'id' }, C2: { t: 's', v: 'hp' }, B3: { t: 'n', v: 1 }, C3: { t: 'n', v: 2 } };
  const [read1] = readWorkbook(toXlsx({ Monster: sheet }), { fileName: 'x.xlsx' }).sheets;
  assert.deepEqual(read1.rows, [
    ['', '', ''],
    ['', 'id', 'hp'],
    ['', '1', '2'],
  ]);
});

test('빈 시트는 행이 없는 시트로 남는다', () => {
  const [sheet] = read({ Empty: {} }).sheets;
  assert.equal(sheet.name, 'Empty');
  assert.deepEqual(sheet.rows, []);
});

// ── 오류 셀 ──────────────────────────────────────────────────────────

test('오류 셀은 오류 텍스트로 읽어 캐스팅 단계에서 잡히게 한다', () => {
  const sheet = { '!ref': 'A1:A1', A1: { t: 'e', v: 0x17, w: '#REF!' } };
  const [read1] = readWorkbook(toXlsx({ Monster: sheet }), { fileName: 'x.xlsx' }).sheets;
  assert.equal(read1.rows[0][0], '#REF!');
});

// ── CSV (spec.md §3.6) ───────────────────────────────────────────────

test('CSV 를 시트 하나짜리 워크북으로 읽는다', () => {
  const workbook = readWorkbook('id,name\nint,loc\n고유ID,이름\n1001,MON_SLIME\n', {
    fileName: 'Monster.csv',
  });
  assert.equal(workbook.sheets.length, 1);
  assert.equal(workbook.sheets[0].name, 'Monster');
  assert.deepEqual(workbook.sheets[0].rows[3], ['1001', 'MON_SLIME']);
});

test('CSV 시트명은 경로가 아니라 파일 이름에서 가져온다', () => {
  const workbook = readWorkbook('a\n1\n', { fileName: 'data/시트 하나.CSV' });
  assert.equal(workbook.sheets[0].name, '시트 하나');
});

test('CSV 의 BOM 을 값에 섞지 않는다', () => {
  const workbook = readWorkbook('﻿id,name\n1001,MON_SLIME\n', { fileName: 'Monster.csv' });
  assert.deepEqual(workbook.sheets[0].rows[0], ['id', 'name']);
});

// ── 입력 검증 ────────────────────────────────────────────────────────

test('파일명 없이 읽을 수 없다', () => {
  assert.throws(() => readWorkbook(toXlsx({ A: [['x']] })), /파일명/);
  assert.throws(() => readWorkbook(toXlsx({ A: [['x']] }), { fileName: '' }), /파일명/);
});

// ── 결정성 (spec.md §8) ──────────────────────────────────────────────

test('같은 바이트를 두 번 읽으면 같은 결과가 나온다', () => {
  const bytes = toXlsx({ Monster: [['id', 'hp'], ['int', 'int'], [1001, 30]] });
  const first = readWorkbook(bytes, { fileName: 'x.xlsx' });
  const second = readWorkbook(bytes, { fileName: 'x.xlsx' });
  assert.deepEqual(first, second);
});
