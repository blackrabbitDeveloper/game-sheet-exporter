// 규칙들이 공유하는 IR 순회 헬퍼.
//
// 배열·nullable 을 푸는 코드를 규칙마다 다시 쓰면 넷이 조용히 갈라진다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseType, forEachValue } from '../src/core/validate/traverse.js';
import { cleanIr } from './support/ir.mjs';

const scalar = (name) => ({ kind: 'scalar', name });
const nullable = (of) => ({ kind: 'nullable', of });
const array = (of) => ({ kind: 'array', of });

// ── baseType ─────────────────────────────────────────────────────────

test('접미사를 벗겨 잎 타입을 낸다', () => {
  assert.deepEqual(baseType(scalar('int')), scalar('int'));
  assert.deepEqual(baseType(nullable(scalar('int'))), scalar('int'));
  assert.deepEqual(baseType(array(nullable(scalar('int')))), scalar('int'));
  assert.deepEqual(baseType({ kind: 'loc' }), { kind: 'loc' });
  assert.deepEqual(baseType(nullable(array({ kind: 'enum', name: 'Grade' }))), {
    kind: 'enum',
    name: 'Grade',
  });
});

// ── forEachValue ─────────────────────────────────────────────────────

const SHEETS = {
  Monster: [
    ['id', 'name', 'tags'],
    ['int', 'loc', 'string[]'],
    ['고유ID', '이름', '태그'],
    ['1001', 'MON_SLIME', 'a,b'],
    ['1002', 'MON_GOBLIN', 'c'],
  ],
};

function collect(ir) {
  const seen = [];
  forEachValue(ir, (visit) => seen.push(visit));
  return seen;
}

test('잎 값을 좌표와 함께 준다', () => {
  const seen = collect(cleanIr(SHEETS));

  assert.deepEqual(
    seen.map((item) => [item.cell, item.value, item.index]),
    [
      ['Monster!A4', 1001, null],
      ['Monster!B4', 'MON_SLIME', null],
      ['Monster!C4', 'a', 0],
      ['Monster!C4', 'b', 1],
      ['Monster!A5', 1002, null],
      ['Monster!B5', 'MON_GOBLIN', null],
      ['Monster!C5', 'c', 0],
    ],
  );
});

test('잎 타입을 함께 준다', () => {
  const seen = collect(cleanIr(SHEETS));
  assert.deepEqual(seen[0].type, scalar('int'));
  assert.deepEqual(seen[1].type, { kind: 'loc' });
  assert.deepEqual(seen[2].type, scalar('string'));
});

test('시트·필드·행 객체를 그대로 넘긴다', () => {
  const [first] = collect(cleanIr(SHEETS));
  assert.equal(first.sheet.name, 'Monster');
  assert.equal(first.field.name, 'id');
  assert.equal(first.row.row, 4);
});

test('빈 값은 건너뛴다', () => {
  // null 은 nullable 이 비었거나 캐스팅이 실패한 자리다. 규칙마다 걸러내면
  // 같은 조건문이 일곱 번 반복된다.
  const ir = cleanIr({
    Monster: [
      ['id', 'memo', 'tags'],
      ['int', 'string?', 'string[]'],
      ['', '', ''],
      ['1001', '', ''],
    ],
  });
  assert.deepEqual(
    collect(ir).map((item) => [item.cell, item.value]),
    [['Monster!A4', 1001]],
  );
});

test('여러 시트를 순서대로 돈다', () => {
  const ir = cleanIr({
    Monster: [['id'], ['int'], [''], ['1001']],
    Item: [['id'], ['int'], [''], ['2001']],
  });
  assert.deepEqual(collect(ir).map((item) => item.cell), ['Monster!A4', 'Item!A4']);
});

test('데이터 행이 없으면 아무것도 부르지 않는다', () => {
  assert.deepEqual(collect(cleanIr({ Monster: [['id'], ['int'], ['']] })), []);
});
