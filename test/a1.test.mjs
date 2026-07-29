// 셀 좌표 변환을 고정한다.
//
// spec.md §5.1 이 "좌표 없는 검증 결과는 미완성으로 간주한다" 고 정했으므로
// 이 모듈이 틀리면 도구 전체가 신뢰를 잃는다. 26진법 자리올림이 특히 틀리기 쉽다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { cellRef, columnLetter, sheetRef } from '../src/core/util/a1.js';

// ── 열 문자 ──────────────────────────────────────────────────────────

test('열 인덱스를 엑셀 열 문자로 바꾼다', () => {
  const cases = [
    [0, 'A'],
    [1, 'B'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
    [16383, 'XFD'], // 엑셀의 마지막 열
  ];
  for (const [index, expected] of cases) {
    assert.equal(columnLetter(index), expected, `${index} 번째 열`);
  }
});

test('열 문자는 A 부터 Z 까지 자리올림 없이 이어진다', () => {
  const letters = Array.from({ length: 26 }, (_, index) => columnLetter(index));
  assert.equal(letters.join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
});

test('잘못된 열 인덱스를 거부한다', () => {
  for (const bad of [-1, 1.5, NaN, Infinity, '0', null, undefined]) {
    assert.throws(
      () => columnLetter(bad),
      /열 인덱스/,
      `${JSON.stringify(bad)} 는 거부되어야 한다`,
    );
  }
});

// ── 셀 좌표 ──────────────────────────────────────────────────────────

test('시트명·행번호·열인덱스를 A1 좌표로 합친다', () => {
  assert.equal(cellRef('Monster', 17, 3), 'Monster!D17');
  assert.equal(cellRef('Monster', 1, 0), 'Monster!A1');
  assert.equal(cellRef('Item', 4, 26), 'Item!AA4');
});

test('행 번호는 엑셀 화면과 같이 1 부터 센다', () => {
  // 헤더 3행 구성에서 첫 데이터 행은 4행이다 (spec.md §3.1).
  assert.equal(cellRef('Monster', 4, 0), 'Monster!A4');
});

test('한글·공백이 든 시트명을 그대로 쓴다', () => {
  // 식별자 변환은 emit/csharp/naming.js 소관이고, 좌표는 사람이 시트에서
  // 찾아가는 용도이므로 원본 시트명이어야 한다 (spec.md §4.1).
  assert.equal(cellRef('몬스터 정보', 17, 3), '몬스터 정보!D17');
  assert.equal(cellRef('enum.Grade', 4, 0), 'enum.Grade!A4');
});

test('잘못된 행 번호를 거부한다', () => {
  for (const bad of [0, -1, 1.5, NaN, '1', null, undefined]) {
    assert.throws(
      () => cellRef('Monster', bad, 0),
      /행 번호/,
      `${JSON.stringify(bad)} 는 거부되어야 한다`,
    );
  }
});

test('빈 시트명을 거부한다', () => {
  for (const bad of ['', '   ', null, undefined, 3]) {
    assert.throws(() => cellRef(bad, 1, 0), /시트명/, `${JSON.stringify(bad)} 는 거부되어야 한다`);
  }
});

// ── 시트 좌표 ────────────────────────────────────────────────────────

test('시트 전체에 걸린 좌표는 시트명까지만 표기한다', () => {
  // spec.md §5.1: "시트 전체에 걸린 오류는 Monster! 까지"
  assert.equal(sheetRef('Monster'), 'Monster!');
  assert.equal(sheetRef('몬스터 정보'), '몬스터 정보!');
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('다른 모듈을 import 하지 않는다', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/core/util/a1.js', import.meta.url)),
    'utf8',
  );
  assert.equal(
    /^\s*import\s/m.test(source),
    false,
    'a1.js 는 순수 계산만 한다. import 가 생기면 의존이 늘어난 것이다',
  );
});
