// 헤더 행 → 필드 정의.
//
// 사양: docs/spec.md §3.1(헤더 구성), §3.2(무시 열), §4(IR), §5.5(파싱 단계 진단)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHeader } from '../src/core/parser/header-parser.js';

const BASIC = [
  ['id', 'name', 'hp', 'grade', 'drop_ids'],
  ['int', 'loc', 'int', 'enum:Grade', 'ref:Item.id[]'],
  ['고유ID', '이름', '체력', '등급', '드랍'],
  ['1001', 'MON_SLIME', '30', 'Normal', '2001,2002'],
];

const codes = (diagnostics) => diagnostics.map((item) => item.code);

// ── 기본 동작 ────────────────────────────────────────────────────────

test('헤더 세 행에서 필드 정의를 만든다', () => {
  const { fields, diagnostics } = parseHeader('Monster', BASIC);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(
    fields.map((field) => field.name),
    ['id', 'name', 'hp', 'grade', 'drop_ids'],
  );
  assert.deepEqual(fields[0], {
    name: 'id',
    identifier: 'id',
    column: 0,
    columnLetter: 'A',
    type: { kind: 'scalar', name: 'int' },
    comment: '고유ID',
    cell: 'Monster!A1',
  });
});

test('원본 이름과 변환된 식별자를 함께 담는다', () => {
  // 리포트는 사람이 시트에서 찾을 수 있게 원본을 쓰고, 출력은 변환된 식별자를
  // 쓴다. 하나만 들고 있으면 둘 중 하나가 깨진다 (spec.md §4.1).
  const { fields } = parseHeader('Monster', [['몬스터 이름', '2nd'], ['loc', 'int'], ['', '']]);

  assert.deepEqual(
    fields.map((field) => [field.name, field.identifier]),
    [
      ['몬스터 이름', '몬스터_이름'],
      ['2nd', '_2nd'],
    ],
  );
});

test('필드 좌표는 필드명 셀을 가리킨다', () => {
  const { fields } = parseHeader('Monster', BASIC);
  assert.deepEqual(
    fields.map((field) => field.cell),
    ['Monster!A1', 'Monster!B1', 'Monster!C1', 'Monster!D1', 'Monster!E1'],
  );
  assert.deepEqual(
    fields.map((field) => field.columnLetter),
    ['A', 'B', 'C', 'D', 'E'],
  );
});

test('타입 표기를 TypeNode 로 바꾼다', () => {
  const { fields } = parseHeader('Monster', BASIC);
  assert.deepEqual(fields[3].type, { kind: 'enum', name: 'Grade' });
  assert.deepEqual(fields[4].type, {
    kind: 'array',
    of: { kind: 'ref', sheet: 'Item', field: 'id' },
  });
});

test('필드명과 타입의 앞뒤 공백을 제거한다', () => {
  const { fields, diagnostics } = parseHeader('Monster', [['  id  '], ['  int  '], ['  주석  ']]);
  assert.deepEqual(diagnostics, []);
  assert.equal(fields[0].name, 'id');
  assert.equal(fields[0].comment, '주석');
  assert.deepEqual(fields[0].type, { kind: 'scalar', name: 'int' });
});

// ── 헤더 행은 설정값이다 (spec.md §3.1) ──────────────────────────────

test('헤더 행 번호를 설정으로 바꾼다', () => {
  const rows = [
    ['메모', '이 시트는...'],
    [],
    [],
    ['id', 'hp'],
    ['int', 'int'],
    ['고유ID', '체력'],
    ['1001', '30'],
  ];
  const { fields, diagnostics } = parseHeader('Monster', rows, {
    layout: { nameRow: 4, typeRow: 5, commentRow: 6, dataStartRow: 7 },
  });

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(fields.map((field) => field.name), ['id', 'hp']);
  assert.equal(fields[0].cell, 'Monster!A4');
  assert.equal(fields[1].comment, '체력');
});

test('주석 행이 없어도 동작한다', () => {
  const { fields, diagnostics } = parseHeader('Monster', [['id'], ['int'], ['1001']], {
    layout: { nameRow: 1, typeRow: 2, commentRow: null, dataStartRow: 3 },
  });
  assert.deepEqual(diagnostics, []);
  assert.equal(fields[0].comment, '');
});

// ── 무시 열 (spec.md §3.2) ───────────────────────────────────────────

test('필드명이 비었거나 # 로 시작하는 열을 건너뛴다', () => {
  const rows = [
    ['id', '', '#계산용', 'hp'],
    ['int', '', '', 'int'],
    ['고유ID', '', '임시', '체력'],
  ];
  const { fields, diagnostics } = parseHeader('Monster', rows);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(fields.map((field) => field.name), ['id', 'hp']);
});

test('무시한 열이 있어도 열 인덱스는 실제 위치를 유지한다', () => {
  const rows = [['id', '#temp', 'hp'], ['int', '', 'int'], ['', '', '']];
  const { fields } = parseHeader('Monster', rows);

  assert.deepEqual(fields.map((field) => field.column), [0, 2]);
  assert.deepEqual(fields.map((field) => field.cell), ['Monster!A1', 'Monster!C1']);
});

// ── E001 필드명 오류 ─────────────────────────────────────────────────

test('타입은 있는데 필드명이 비면 E001 이다', () => {
  const rows = [['id', ''], ['int', 'int'], ['', '']];
  const { fields, diagnostics } = parseHeader('Monster', rows);

  assert.deepEqual(codes(diagnostics), ['E001']);
  assert.equal(diagnostics[0].cell, 'Monster!B1');
  assert.deepEqual(fields.map((field) => field.name), ['id']);
});

test('필드명이 중복되면 E001 이고 뒤엣것을 버린다', () => {
  const rows = [['id', 'hp', 'id'], ['int', 'int', 'string'], ['', '', '']];
  const { fields, diagnostics } = parseHeader('Monster', rows);

  assert.deepEqual(codes(diagnostics), ['E001']);
  assert.equal(diagnostics[0].cell, 'Monster!C1');
  assert.deepEqual(fields.map((field) => field.name), ['id', 'hp']);
  assert.deepEqual(fields.map((field) => field.column), [0, 1]);
});

// ── E002 타입 표기 누락 ──────────────────────────────────────────────

test('필드명은 있는데 타입이 비면 E002 이고 좌표는 타입 셀이다', () => {
  const rows = [['id', 'hp'], ['int', '   '], ['', '']];
  const { fields, diagnostics } = parseHeader('Monster', rows);

  assert.deepEqual(codes(diagnostics), ['E002']);
  assert.equal(diagnostics[0].cell, 'Monster!B2');
  assert.deepEqual(fields.map((field) => field.name), ['id']);
});

test('타입 행이 통째로 없으면 필드마다 E002 가 나온다', () => {
  const { diagnostics } = parseHeader('Monster', [['id', 'hp']]);
  assert.deepEqual(codes(diagnostics), ['E002', 'E002']);
  assert.deepEqual(diagnostics.map((item) => item.cell), ['Monster!A2', 'Monster!B2']);
});

// ── E005 타입 표기 파싱 실패 ─────────────────────────────────────────

test('해석할 수 없는 타입 표기는 E005 이고 좌표는 타입 셀이다', () => {
  const rows = [['id', 'hp'], ['int', 'integer'], ['', '']];
  const { fields, diagnostics } = parseHeader('Monster', rows);

  assert.deepEqual(codes(diagnostics), ['E005']);
  assert.equal(diagnostics[0].cell, 'Monster!B2');
  assert.match(diagnostics[0].message, /integer/);
  assert.deepEqual(fields.map((field) => field.name), ['id']);
});

// ── E013 지원하지 않는 타입 (notation.md §2.2) ───────────────────────

test('배열 깊이 2 이상은 파싱은 되지만 E013 이다', () => {
  const rows = [['grid'], ['int[][]'], ['']];
  const { fields, diagnostics } = parseHeader('Monster', rows);

  assert.deepEqual(codes(diagnostics), ['E013']);
  assert.equal(diagnostics[0].cell, 'Monster!A2');
  assert.deepEqual(fields, []);
});

test('nullable 이 끼어도 배열 깊이만 센다', () => {
  assert.deepEqual(codes(parseHeader('M', [['a'], ['int[]?[]'], ['']]).diagnostics), ['E013']);
  assert.deepEqual(parseHeader('M', [['a'], ['int?[]?'], ['']]).diagnostics, []);
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('빈 시트는 필드도 진단도 내지 않는다', () => {
  assert.deepEqual(parseHeader('Empty', []), { fields: [], diagnostics: [] });
});

test('모든 진단이 좌표를 갖는다', () => {
  const rows = [['id', '', 'id', 'x', 'y'], ['int', 'int', 'int', '', 'integer'], ['', '', '', '', '']];
  const { diagnostics } = parseHeader('Monster', rows);

  assert.ok(diagnostics.length >= 4, '진단이 나와야 한다');
  for (const item of diagnostics) {
    assert.match(item.cell, /^Monster![A-Z]+\d+$/, `${item.code} 의 좌표가 없다`);
    assert.ok(item.message.trim().length > 0, `${item.code} 의 메시지가 비었다`);
  }
});

test('진단은 열 순서대로 나온다', () => {
  const rows = [['id', 'x', 'y'], ['int', '', 'integer'], ['', '', '']];
  const { diagnostics } = parseHeader('Monster', rows);
  assert.deepEqual(diagnostics.map((item) => item.cell), ['Monster!B2', 'Monster!C2']);
});
