// 여러 워크북 → 하나.
//
// 사양: docs/spec.md §3.5, §8
//
// 병합 지점이 buildIR 앞이므로 검증기와 에미터는 파일이 몇 개였는지 알 필요가 없다.
// 그래서 이 파일이 지켜야 할 것은 둘뿐이다 — 순서가 흔들리지 않는 것, 그리고 좌표가
// 애매해지는 조합을 거부하는 것.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeWorkbooks } from '../src/core/parser/merge.js';

const workbook = (fileName, sheetNames) => ({
  fileName,
  sheets: sheetNames.map((name) => ({ name, rows: [[name]] })),
});

const codes = (diagnostics) => diagnostics.map((item) => item.code);

test('시트를 이어 붙인다', () => {
  const merged = mergeWorkbooks([
    workbook('a.xlsx', ['Monster', 'Item']),
    workbook('b.xlsx', ['Quest']),
  ]);

  assert.deepEqual(merged.sheets.map((sheet) => sheet.name), ['Monster', 'Item', 'Quest']);
  assert.deepEqual(merged.diagnostics, []);
});

test('시트마다 온 파일을 기록한다', () => {
  const merged = mergeWorkbooks([workbook('a.xlsx', ['Monster']), workbook('b.xlsx', ['Quest'])]);

  assert.deepEqual(
    merged.sheets.map((sheet) => [sheet.name, sheet.sourceFile]),
    [
      ['Monster', 'a.xlsx'],
      ['Quest', 'b.xlsx'],
    ],
  );
});

test('파일 목록을 낸다', () => {
  const merged = mergeWorkbooks([workbook('b.xlsx', ['Quest']), workbook('a.xlsx', ['Monster'])]);
  assert.deepEqual(merged.files, ['a.xlsx', 'b.xlsx']);
});

// ── 순서 (spec.md §8) ────────────────────────────────────────────────

test('파일명 순으로 정렬한다', () => {
  // 드롭 순서를 쓰면 같은 파일들을 다른 순서로 넣었을 때 출력이 달라진다.
  const merged = mergeWorkbooks([
    workbook('quests.xlsx', ['Quest']),
    workbook('items.xlsx', ['Item']),
    workbook('monsters.xlsx', ['Monster']),
  ]);

  assert.deepEqual(merged.sheets.map((sheet) => sheet.name), ['Item', 'Monster', 'Quest']);
});

test('넣은 순서가 달라도 같은 결과가 나온다', () => {
  const books = [
    workbook('c.xlsx', ['C']),
    workbook('a.xlsx', ['A']),
    workbook('b.xlsx', ['B']),
  ];
  const forward = mergeWorkbooks(books);
  const backward = mergeWorkbooks([...books].reverse());

  assert.deepEqual(backward, forward);
});

test('한 파일 안의 시트 순서는 그대로다', () => {
  // 워크북 안의 순서는 사람이 정한 것이다. 정렬하지 않는다.
  const merged = mergeWorkbooks([workbook('a.xlsx', ['Zebra', 'Apple', 'Mango'])]);
  assert.deepEqual(merged.sheets.map((sheet) => sheet.name), ['Zebra', 'Apple', 'Mango']);
});

test('정렬은 로케일에 의존하지 않는다', () => {
  // localeCompare 는 환경에 따라 순서가 달라진다.
  const merged = mergeWorkbooks([
    workbook('B.xlsx', ['B']),
    workbook('a.xlsx', ['A']),
  ]);

  // 코드 유닛 비교라 대문자가 앞선다.
  assert.deepEqual(merged.files, ['B.xlsx', 'a.xlsx']);
});

// ── E016 시트명 중복 (spec.md §3.5) ──────────────────────────────────

test('파일을 넘는 시트명 중복을 거부한다', () => {
  const merged = mergeWorkbooks([
    workbook('monsters.xlsx', ['Common']),
    workbook('quests.xlsx', ['Common']),
  ]);

  assert.deepEqual(codes(merged.diagnostics), ['E016']);
  assert.match(merged.diagnostics[0].message, /Common/);
  assert.match(merged.diagnostics[0].detail, /monsters\.xlsx/);
  assert.match(merged.diagnostics[0].detail, /quests\.xlsx/);
});

test('E016 의 좌표는 나중 파일이다', () => {
  // 좌표가 파일명까지인 진단이다 (사양 §5.1).
  const merged = mergeWorkbooks([
    workbook('a.xlsx', ['Common']),
    workbook('b.xlsx', ['Common']),
  ]);

  assert.equal(merged.diagnostics[0].cell, 'b.xlsx');
});

test('중복된 시트는 하나만 남긴다', () => {
  // 둘 다 남기면 좌표가 애매한 진단이 뒤에서 쏟아진다.
  const merged = mergeWorkbooks([
    workbook('a.xlsx', ['Common']),
    workbook('b.xlsx', ['Common']),
  ]);

  assert.deepEqual(merged.sheets.map((sheet) => sheet.sourceFile), ['a.xlsx']);
});

test('한 파일 안의 중복은 여기서 다루지 않는다', () => {
  // 엑셀이 같은 이름의 시트를 두 개 만들 수 없다.
  const merged = mergeWorkbooks([workbook('a.xlsx', ['Monster', 'Item'])]);
  assert.deepEqual(merged.diagnostics, []);
});

test('시트명이 다르면 파일이 달라도 통과한다', () => {
  const merged = mergeWorkbooks([
    workbook('a.xlsx', ['Monster']),
    workbook('b.xlsx', ['Item']),
  ]);
  assert.deepEqual(merged.diagnostics, []);
});

test('무시 시트는 파일마다 있어도 된다', () => {
  // # 과 _ 로 시작하는 시트는 통째로 무시되므로 중복이 문제가 아니다.
  const merged = mergeWorkbooks([
    workbook('a.xlsx', ['#메모', '_임시', 'Monster']),
    workbook('b.xlsx', ['#메모', '_임시', 'Item']),
  ]);

  assert.deepEqual(merged.diagnostics, []);
  assert.deepEqual(merged.sheets.map((sheet) => sheet.name), ['Monster', 'Item']);
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('파일 하나만 넣어도 된다', () => {
  const merged = mergeWorkbooks([workbook('a.xlsx', ['Monster'])]);

  assert.deepEqual(merged.files, ['a.xlsx']);
  assert.deepEqual(merged.sheets.map((sheet) => sheet.name), ['Monster']);
});

test('파일이 없으면 빈 결과다', () => {
  const merged = mergeWorkbooks([]);

  assert.deepEqual(merged.files, []);
  assert.deepEqual(merged.sheets, []);
  assert.deepEqual(merged.diagnostics, []);
});

test('시트가 없는 워크북도 받는다', () => {
  const merged = mergeWorkbooks([workbook('a.xlsx', []), workbook('b.xlsx', ['Monster'])]);

  assert.deepEqual(merged.files, ['a.xlsx', 'b.xlsx']);
  assert.deepEqual(merged.sheets.map((sheet) => sheet.name), ['Monster']);
});

test('같은 파일명이 두 번 오면 거부한다', () => {
  // 같은 파일을 두 번 넣었거나 다른 폴더의 동명 파일이다. 어느 쪽이든 좌표가 겹친다.
  const merged = mergeWorkbooks([
    workbook('a.xlsx', ['Monster']),
    workbook('a.xlsx', ['Item']),
  ]);

  assert.deepEqual(codes(merged.diagnostics), ['E016']);
  assert.match(merged.diagnostics[0].message, /a\.xlsx/);
});

test('원본 워크북을 바꾸지 않는다', () => {
  const books = [workbook('a.xlsx', ['Monster'])];
  const before = JSON.stringify(books);
  mergeWorkbooks(books);

  assert.equal(JSON.stringify(books), before);
});

test('거부한 파일은 목록에 넣지 않는다', () => {
  const merged = mergeWorkbooks([
    workbook('a.xlsx', ['Monster']),
    workbook('a.xlsx', ['Item']),
  ]);

  assert.deepEqual(merged.files, ['a.xlsx']);
});
