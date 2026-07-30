// IR + 설정 → C# 호출부 예시.
//
// 사양: docs/spec.md §6.3
//
// 생성된 파일은 "무엇이 있는지" 를 보여주지만 "무엇을 써야 하는지" 는 보여주지
// 않는다. 예시는 실제 시트명·기본키 타입·네임스페이스를 써야 옮겨 붙일 수 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csharpUsage } from '../src/core/emit/csharp/usage.js';
import { cleanIr } from './support/ir.mjs';

const MONSTER = {
  Monster: [
    ['id', 'name', 'hp'],
    ['int', 'loc', 'int'],
    ['고유ID', '이름', '체력'],
    ['1001', 'MON_SLIME', '30'],
    ['1002', 'MON_GOBLIN', '55'],
  ],
};

const usage = (sheets, options) => csharpUsage(cleanIr(sheets), options);

test('실제 클래스명과 기본키 타입을 쓴다', () => {
  const text = usage(MONSTER);

  assert.match(text, /GameDataTable<Monster, int>\.Load\(/);
  assert.match(text, /using GameData;/);
});

test('시트의 첫 기본키 값을 예시로 쓴다', () => {
  // 1001 을 보여주면 옮겨 붙여 바로 돌려볼 수 있다.
  assert.match(usage(MONSTER), /\.Get\(1001\)/);
});

test('문자열 기본키는 따옴표를 붙인다', () => {
  const text = usage({ Quest: [['code'], ['string'], [''], ['Q1']] });
  assert.match(text, /\.Get\("Q1"\)/);
});

test('행이 없으면 자리표시자를 쓴다', () => {
  const text = usage({ Monster: [['id'], ['int'], ['고유ID']] });

  assert.match(text, /GameDataTable<Monster, int>/);
  assert.doesNotMatch(text, /\.Get\(\)/, '빈 인자를 내면 컴파일되지 않는다');
});

test('네임스페이스 설정을 따른다', () => {
  assert.match(usage(MONSTER, { namespace: 'My.Game' }), /using My\.Game;/);
});

// ── 형식별 경로 ──────────────────────────────────────────────────────

test('기본은 JSON 을 읽는다', () => {
  const text = usage(MONSTER);

  assert.match(text, /\.json/);
  assert.doesNotMatch(text, /GameDataCsv/);
});

test('CSV 를 켜면 CSV 경로를 보여준다', () => {
  const text = usage(MONSTER, { csv: true });

  assert.match(text, /GameDataCsv\.ReadRows<Monster>\(/);
  assert.match(text, /\.csv/);
  // 읽은 행으로 표를 만드는 방법까지 보여야 조회가 가능하다.
  assert.match(text, /new GameDataTable<Monster, int>\(/);
});

test('집계 로더를 켜면 그쪽을 보여준다', () => {
  const text = usage(MONSTER, { loader: true });

  assert.match(text, /GameDataTables\.Load\(/);
  assert.match(text, /var table = tables\.MonsterTable;/);
  assert.match(text, /table\.Get\(1001\)/);
});

test('집계 로더 클래스명을 따른다', () => {
  const text = usage(MONSTER, { loader: true, loaderClassName: 'Tables' });

  assert.match(text, /Tables\.Load\(/);
  assert.doesNotMatch(text, /GameDataTables/);
});

test('기본키가 배열이면 조회 대신 훑기를 보여준다', () => {
  // GameDataTable 의 제약을 만족하지 못하는 시트다 (spec §6.3).
  const text = usage({ Loot: [['ids', 'hp'], ['int[]', 'int'], ['', ''], ['1,2', '30']] });

  assert.match(text, /GameDataJson\.ReadRows<Loot>\(/);
  assert.doesNotMatch(text, /GameDataTable<Loot/);
  assert.match(text, /foreach/);
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('데이터 시트가 없으면 빈 문자열이다', () => {
  assert.equal(csharpUsage({ sheets: [], enums: [] }, {}), '');
});

test('줄바꿈은 LF 이고 끝에 개행이 있다', () => {
  const text = usage(MONSTER);

  assert.doesNotMatch(text, /\r/);
  assert.ok(text.endsWith('\n'));
});

test('같은 입력은 같은 예시를 낸다', () => {
  assert.equal(usage(MONSTER), usage(MONSTER));
});

test('예시에 현재 날짜가 섞이지 않는다', () => {
  assert.equal(usage(MONSTER).includes(String(new Date().getFullYear())), false);
});
