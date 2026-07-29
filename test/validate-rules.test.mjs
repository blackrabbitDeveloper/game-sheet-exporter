// 규칙 하나당 실패 케이스와 통과 케이스를 최소 하나씩 갖는다 (CLAUDE.md).
//
// 사양: docs/spec.md §5.2, §5.3
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E009 from '../src/core/validate/rules/E009.js';
import * as E012 from '../src/core/validate/rules/E012.js';
import * as W101 from '../src/core/validate/rules/W101.js';
import * as W102 from '../src/core/validate/rules/W102.js';
import * as W103 from '../src/core/validate/rules/W103.js';
import * as W104 from '../src/core/validate/rules/W104.js';
import * as W106 from '../src/core/validate/rules/W106.js';
import { cleanIr, irFrom } from './support/ir.mjs';

const ENUM_GRADE = [
  ['name', 'value', 'comment'],
  ['string', 'int?', 'string?'],
  ['이름', '값', '설명'],
  ['Normal', '0', '일반'],
  ['Rare', '10', '희귀'],
];

/** 규칙이 낸 진단을 [코드, 좌표] 로 줄인다. */
const found = (rule, ir) => rule.check(ir).map((item) => [item.code, item.cell]);

test('모든 규칙이 코드와 이름을 밝힌다', () => {
  for (const rule of [E009, E012, W101, W102, W103, W104, W106]) {
    assert.match(rule.code, /^[EW]\d{3}$/);
    assert.ok(rule.title.trim().length > 0, `${rule.code} 의 이름이 비었다`);
    assert.equal(typeof rule.check, 'function', `${rule.code} 에 check 가 없다`);
  }
});

// ── E009 enum 멤버 없음 ──────────────────────────────────────────────

test('E009 — 정의에 없는 enum 값을 잡는다', () => {
  const ir = cleanIr({
    Monster: [
      ['id', 'grade'],
      ['int', 'enum:Grade'],
      ['', ''],
      ['1001', 'Normal'],
      ['1002', 'Legendary'],
    ],
    'enum.Grade': ENUM_GRADE,
  });

  assert.deepEqual(found(E009, ir), [['E009', 'Monster!B5']]);
  assert.match(E009.check(ir)[0].message, /Legendary/);
});

test('E009 — 정의에 있는 값은 통과한다', () => {
  const ir = cleanIr({
    Monster: [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['1001', 'Rare']],
    'enum.Grade': ENUM_GRADE,
  });
  assert.deepEqual(E009.check(ir), []);
});

test('E009 — 배열 원소도 본다', () => {
  const ir = cleanIr({
    Monster: [['id', 'grades'], ['int', 'enum:Grade[]'], ['', ''], ['1001', 'Rare,Legendary']],
    'enum.Grade': ENUM_GRADE,
  });
  assert.deepEqual(found(E009, ir), [['E009', 'Monster!B4']]);
});

test('E009 — 정의 시트 자체가 없으면 잡지 않는다', () => {
  // 그건 E008 이 헤더 단계에서 이미 냈다. 여기서 또 내면 같은 문제로 두 번 운다.
  const { ir } = irFrom({
    Monster: [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['1001', 'Legendary']],
  });
  assert.deepEqual(E009.check(ir), []);
});

// ── E012 유일성 위반 ─────────────────────────────────────────────────

test('E012 — 기본키 중복을 잡는다', () => {
  const ir = cleanIr({
    Monster: [['id', 'hp'], ['int', 'int'], ['', ''], ['1001', '30'], ['1002', '40'], ['1001', '50']],
  });

  assert.deepEqual(found(E012, ir), [['E012', 'Monster!A6']]);
  assert.match(E012.check(ir)[0].detail, /Monster!A4/, '처음 나온 곳을 알려줘야 한다');
});

test('E012 — 기본키가 유일하면 통과한다', () => {
  const ir = cleanIr({
    Monster: [['id'], ['int'], [''], ['1001'], ['1002']],
  });
  assert.deepEqual(E012.check(ir), []);
});

test('E012 — 참조 대상 필드도 유일해야 한다', () => {
  // notation.md §4.3: 참조 대상이 아닌 필드의 중복은 문제 삼지 않는다.
  const ir = cleanIr({
    Monster: [['id', 'drop'], ['int', 'ref:Item.code'], ['', ''], ['1001', '7']],
    Item: [
      ['id', 'code', 'grade'],
      ['int', 'int', 'string'],
      ['', '', ''],
      ['2001', '7', '같음'],
      ['2002', '7', '같음'],
    ],
  });

  assert.deepEqual(found(E012, ir), [['E012', 'Item!B5']]);
});

test('E012 — 참조 대상이 아닌 필드의 중복은 넘어간다', () => {
  const ir = cleanIr({
    Monster: [['id', 'grade'], ['int', 'string'], ['', ''], ['1001', '같음'], ['1002', '같음']],
  });
  assert.deepEqual(E012.check(ir), []);
});

// ── W101 미사용 enum 멤버 ────────────────────────────────────────────

test('W101 — 어디서도 쓰지 않는 멤버를 알린다', () => {
  const ir = cleanIr({
    Monster: [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['1001', 'Normal']],
    'enum.Grade': ENUM_GRADE,
  });

  assert.deepEqual(found(W101, ir), [['W101', 'enum.Grade!A5']]);
});

test('W101 — 모두 쓰이면 조용하다', () => {
  const ir = cleanIr({
    Monster: [
      ['id', 'grade'],
      ['int', 'enum:Grade'],
      ['', ''],
      ['1001', 'Normal'],
      ['1002', 'Rare'],
    ],
    'enum.Grade': ENUM_GRADE,
  });
  assert.deepEqual(W101.check(ir), []);
});

// ── W102 데이터 행 없음 ──────────────────────────────────────────────

test('W102 — 헤더만 있는 시트를 알린다', () => {
  const ir = cleanIr({ Monster: [['id'], ['int'], ['고유ID']] });
  assert.deepEqual(found(W102, ir), [['W102', 'Monster!']]);
});

test('W102 — 데이터가 있으면 조용하다', () => {
  const ir = cleanIr({ Monster: [['id'], ['int'], [''], ['1001']] });
  assert.deepEqual(W102.check(ir), []);
});

// ── W103 빈 열 ───────────────────────────────────────────────────────

test('W103 — 모든 행에서 비어 있는 열을 알린다', () => {
  const ir = cleanIr({
    Monster: [
      ['id', 'memo', 'tags'],
      ['int', 'string?', 'string[]'],
      ['', '', ''],
      ['1001', '', ''],
      ['1002', '', ''],
    ],
  });

  assert.deepEqual(found(W103, ir), [
    ['W103', 'Monster!B1'],
    ['W103', 'Monster!C1'],
  ]);
});

test('W103 — 한 행이라도 값이 있으면 조용하다', () => {
  const ir = cleanIr({
    Monster: [['id', 'memo'], ['int', 'string?'], ['', ''], ['1001', ''], ['1002', '있음']],
  });
  assert.deepEqual(W103.check(ir), []);
});

test('W103 — 데이터 행이 없으면 잡지 않는다', () => {
  // 그건 W102 가 낸다. 열마다 또 내면 한 시트에서 경고가 열 수만큼 늘어난다.
  const ir = cleanIr({ Monster: [['id', 'memo'], ['int', 'string?'], ['', '']] });
  assert.deepEqual(W103.check(ir), []);
});

// ── W104 주석 없음 ───────────────────────────────────────────────────

test('W104 — 주석이 빈 필드를 알린다', () => {
  const ir = cleanIr({
    Monster: [['id', 'hp'], ['int', 'int'], ['고유ID', ''], ['1001', '30']],
  });
  assert.deepEqual(found(W104, ir), [['W104', 'Monster!B1']]);
});

test('W104 — 주석이 있으면 조용하다', () => {
  const ir = cleanIr({
    Monster: [['id'], ['int'], ['고유ID'], ['1001']],
  });
  assert.deepEqual(W104.check(ir), []);
});

test('W104 — 주석 행을 쓰지 않기로 했으면 잡지 않는다', () => {
  // commentRow: null 은 "주석을 안 쓴다" 는 의도 표명이다.
  const ir = cleanIr(
    { Monster: [['id'], ['int'], ['1001']] },
    { layout: { nameRow: 1, typeRow: 2, commentRow: null, dataStartRow: 3 } },
  );
  assert.deepEqual(W104.check(ir), []);
});

// ── W106 로컬라이즈 키 형식 ──────────────────────────────────────────

test('W106 — 키 형식이 아닌 loc 값을 알린다', () => {
  const ir = cleanIr({
    Monster: [
      ['id', 'name'],
      ['int', 'loc'],
      ['', ''],
      ['1001', 'MON_SLIME'],
      ['1002', 'mon_goblin'],
      ['1003', '몬스터이름'],
    ],
  });

  assert.deepEqual(found(W106, ir), [
    ['W106', 'Monster!B5'],
    ['W106', 'Monster!B6'],
  ]);
});

test('W106 — 대문자·숫자·밑줄 키는 통과한다', () => {
  const ir = cleanIr({
    Monster: [['id', 'name'], ['int', 'loc'], ['', ''], ['1001', 'MON_SLIME_2']],
  });
  assert.deepEqual(W106.check(ir), []);
});

// ── 공통 계약 ────────────────────────────────────────────────────────

test('모든 규칙의 진단이 좌표와 메시지를 갖는다', () => {
  const ir = cleanIr({
    Monster: [
      ['id', 'grade', 'name', 'memo'],
      ['int', 'enum:Grade', 'loc', 'string?'],
      ['고유ID', '', '', ''],
      ['1001', 'Legendary', 'mon_slime', ''],
      ['1001', 'Legendary', 'mon_slime', ''],
    ],
    'enum.Grade': ENUM_GRADE,
    Empty: [['id'], ['int'], ['고유ID']],
  });

  const all = [E009, E012, W101, W102, W103, W104, W106].flatMap((rule) => rule.check(ir));
  assert.ok(all.length >= 7, `규칙이 골고루 걸려야 한다: ${all.length}개`);
  for (const item of all) {
    assert.match(item.cell, /^[^!]+!([A-Z]+[1-9][0-9]*)?$/, `${item.code} 의 좌표`);
    assert.ok(item.message.trim().length > 0, `${item.code} 의 메시지`);
  }
});

test('규칙은 IR 을 수정하지 않는다', () => {
  const ir = cleanIr({
    Monster: [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['1001', 'Legendary']],
    'enum.Grade': ENUM_GRADE,
  });
  const snapshot = structuredClone(ir);

  for (const rule of [E009, E012, W101, W102, W103, W104, W106]) rule.check(ir);
  assert.deepEqual(ir, snapshot);
});
