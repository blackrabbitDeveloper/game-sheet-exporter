// 워크북 → IR 조립.
//
// 사양: docs/spec.md §3.2(시트 종류), §3.3(enum 정의), §3.4(기본키), §4(IR), §8(결정성)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { buildWorkbook } from './fixtures/build.mjs';
import { assertGolden, toGoldenJson } from './support/golden.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

/** 2차원 문자열 배열을 그대로 넣는다. core 는 SheetJS 없이도 조립할 수 있어야 한다. */
function workbook(sheets, fileName = 'gamedata.xlsx') {
  return {
    fileName,
    sheets: Object.entries(sheets).map(([name, rows]) => ({ name, rows })),
  };
}

const MONSTER = [
  ['id', 'name', 'hp'],
  ['int', 'loc', 'int'],
  ['고유ID', '이름', '체력'],
  ['1001', 'MON_SLIME', '30'],
];

const codes = (diagnostics) => diagnostics.map((item) => item.code);
const sheetNames = (ir) => ir.sheets.map((sheet) => sheet.name);

// ── 골든 (성공 조건) ─────────────────────────────────────────────────

test('basic 픽스처가 골든 IR 과 일치한다', () => {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  const { ir, diagnostics } = buildIR(readWorkbook(bytes, { fileName: 'basic.xlsx' }));

  assert.deepEqual(
    diagnostics.map((item) => `${item.code} ${item.cell} ${item.message}`),
    [],
    'basic 픽스처는 진단 없이 통과해야 한다',
  );
  assertGolden('basic.ir.json', toGoldenJson(ir));
});

test('CSV 도 IR 까지 이어진다', () => {
  // spec.md §3.5: 시트가 하나뿐인 워크북으로 취급하고 시트명은 파일명에서 온다.
  const csv = ['id,name,hp', 'int,loc,int', '고유ID,이름,체력', '1001,MON_SLIME,30'].join('\n');
  const { ir, diagnostics } = buildIR(readWorkbook(csv, { fileName: 'Monster.csv' }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(sheetNames(ir), ['Monster']);
  assert.equal(ir.sheets[0].primaryKey, 'id');
  assert.deepEqual(ir.sheets[0].rows[0].values, { id: 1001, name: 'MON_SLIME', hp: 30 });
  assert.equal(ir.sheets[0].rows[0].cells.hp, 'Monster!C4');
});

// ── IR 머리 정보 (spec.md §4) ────────────────────────────────────────

test('IR 은 버전·원본·레이아웃을 갖는다', () => {
  const { ir } = buildIR(workbook({ Monster: MONSTER }, 'gamedata.xlsx'));

  assert.equal(ir.irVersion, 2);
  assert.deepEqual(ir.source, { fileName: 'gamedata.xlsx', sheetCount: 1 });
  assert.deepEqual(ir.layout, { nameRow: 1, typeRow: 2, commentRow: 3, dataStartRow: 4 });
});

test('레이아웃 설정이 IR 에 기록된다', () => {
  const rows = [['id'], ['int'], ['1001'], ['1002']];
  const { ir } = buildIR(workbook({ Monster: rows }), {
    layout: { nameRow: 1, typeRow: 2, commentRow: null, dataStartRow: 3 },
  });

  assert.equal(ir.layout.commentRow, null);
  assert.deepEqual(ir.sheets[0].rows.map((row) => row.row), [3, 4]);
});

// ── 시트 분류 (spec.md §3.2) ─────────────────────────────────────────

test('무시 시트는 IR 에 넣지 않되 원본 시트 수는 그대로 센다', () => {
  const { ir } = buildIR(
    workbook({ Monster: MONSTER, '#임시계산': [['x']], _메모: [['y']] }),
  );

  assert.deepEqual(sheetNames(ir), ['Monster']);
  assert.equal(ir.source.sheetCount, 3, '원본 파일에 대한 정보이므로 필터링을 반영하지 않는다');
});

test('시트 순서는 워크북 순서를 따른다', () => {
  const { ir } = buildIR(workbook({ Zebra: MONSTER, Apple: MONSTER }));
  assert.deepEqual(sheetNames(ir), ['Zebra', 'Apple']);
});

// ── 데이터 행 (spec.md §3.4, §4) ─────────────────────────────────────

test('시트마다 클래스명을 담는다', () => {
  const { ir } = buildIR(
    workbook({ 'item-drop': MONSTER, '몬스터 정보': MONSTER, Monster: MONSTER }),
  );
  assert.deepEqual(
    ir.sheets.map((sheet) => [sheet.name, sheet.className]),
    [
      ['item-drop', 'ItemDrop'],
      ['몬스터 정보', '몬스터정보'],
      ['Monster', 'Monster'],
    ],
  );
});

test('enum 도 클래스명을 담는다', () => {
  const { ir } = buildIR(
    workbook({ 'enum.아이템 등급': [['name'], ['string'], [''], ['Normal']] }),
  );
  assert.deepEqual(
    ir.enums.map((item) => [item.name, item.className]),
    [['아이템 등급', '아이템등급']],
  );
});

test('첫 번째 필드가 기본키다', () => {
  const { ir } = buildIR(workbook({ Monster: MONSTER }));
  assert.equal(ir.sheets[0].primaryKey, 'id');
});

test('무시 열이 앞에 있으면 그 다음 필드가 기본키다', () => {
  const rows = [['#메모', 'id', 'hp'], ['', 'int', 'int'], ['', '', ''], ['', '1001', '30']];
  const { ir } = buildIR(workbook({ Monster: rows }));
  assert.equal(ir.sheets[0].primaryKey, 'id');
});

test('행마다 엑셀 행 번호와 셀 좌표를 남긴다', () => {
  const { ir } = buildIR(workbook({ Monster: MONSTER }));
  const [row] = ir.sheets[0].rows;

  assert.equal(row.row, 4);
  assert.deepEqual(row.values, { id: 1001, name: 'MON_SLIME', hp: 30 });
  assert.deepEqual(row.cells, { id: 'Monster!A4', name: 'Monster!B4', hp: 'Monster!C4' });
});

test('완전히 빈 행은 건너뛴다', () => {
  // 엑셀 시트 끝에 서식만 남은 빈 행이 흔하다. 데이터로 읽으면 E003 이 무더기로 난다.
  const rows = [...MONSTER, ['', '', ''], ['1002', 'MON_GOBLIN', '50'], ['', '', '']];
  const { ir, diagnostics } = buildIR(workbook({ Monster: rows }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.sheets[0].rows.map((row) => row.row), [4, 6]);
});

test('무시 열에만 값이 있는 행도 빈 행이다', () => {
  // "# 여기부터 신규 몬스터" 같은 구분선을 넣는 관습이 흔하다. 이걸 데이터 행으로
  // 읽으면 필수 필드마다 E003 이 난다.
  const rows = [
    ['id', 'name', 'hp', '#메모'],
    ['int', 'loc', 'int', ''],
    ['고유ID', '이름', '체력', ''],
    ['1001', 'MON_SLIME', '30', ''],
    ['', '', '', '여기부터 신규'],
  ];
  const { ir, diagnostics } = buildIR(workbook({ Monster: rows }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.sheets[0].rows.map((row) => row.row), [4]);
});

test('일부만 빈 행은 건너뛰지 않는다', () => {
  // 그건 실제 누락이므로 E003 이 맞다.
  const rows = [...MONSTER, ['1002', '', '50']];
  const { ir, diagnostics } = buildIR(workbook({ Monster: rows }));

  assert.deepEqual(codes(diagnostics), ['E003']);
  assert.equal(diagnostics[0].cell, 'Monster!B5');
  assert.equal(ir.sheets[0].rows.length, 2);
});

test('무시 열의 값은 IR 에 넣지 않는다', () => {
  const rows = [['id', '#계산용'], ['int', ''], ['', ''], ['1001', '아무거나']];
  const { ir } = buildIR(workbook({ Monster: rows }));
  assert.deepEqual(ir.sheets[0].rows[0].values, { id: 1001 });
});

// ── enum 정의 시트 (spec.md §3.3) ────────────────────────────────────

const ENUM_GRADE = [
  ['name', 'value', 'comment'],
  ['string', 'int?', 'string?'],
  ['이름', '값', '설명'],
  ['Normal', '0', '일반'],
  ['Rare', '10', '희귀'],
  ['Unique', '', '유니크'],
];

test('enum 정의 시트를 읽는다', () => {
  const { ir, diagnostics } = buildIR(workbook({ 'enum.Grade': ENUM_GRADE }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(sheetNames(ir), [], 'enum 시트는 데이터 시트가 아니다');
  assert.deepEqual(ir.enums, [
    {
      name: 'Grade',
      className: 'Grade',
      sheet: 'enum.Grade',
      members: [
        { name: 'Normal', value: 0, comment: '일반', cell: 'enum.Grade!A4' },
        { name: 'Rare', value: 10, comment: '희귀', cell: 'enum.Grade!A5' },
        { name: 'Unique', value: 11, comment: '유니크', cell: 'enum.Grade!A6' },
      ],
    },
  ]);
});

test('값을 생략하면 이전 멤버 + 1 이고 첫 멤버면 0 이다', () => {
  const rows = [['name', 'value'], ['string', 'int?'], ['', ''], ['A', ''], ['B', ''], ['C', '7'], ['D', '']];
  const { ir, diagnostics } = buildIR(workbook({ 'enum.E': rows }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.enums[0].members.map((member) => member.value), [0, 1, 7, 8]);
});

test('enum 열은 이름으로 찾고 순서에 매이지 않는다', () => {
  const rows = [['comment', 'name'], ['string?', 'string'], ['', ''], ['일반', 'Normal']];
  const { ir, diagnostics } = buildIR(workbook({ 'enum.Grade': rows }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.enums[0].members, [
    { name: 'Normal', value: 0, comment: '일반', cell: 'enum.Grade!B4' },
  ]);
});

test('name 열이 없으면 E010 이고 그 시트는 IR 에 없다', () => {
  const rows = [['이름', '값'], ['string', 'int?'], ['', ''], ['Normal', '0']];
  const { ir, diagnostics } = buildIR(workbook({ 'enum.Grade': rows }));

  assert.deepEqual(codes(diagnostics), ['E010']);
  assert.equal(diagnostics[0].cell, 'enum.Grade!');
  assert.deepEqual(ir.enums, []);
});

test('멤버 이름 중복은 E010 이다', () => {
  const rows = [['name'], ['string'], [''], ['Normal'], ['Normal']];
  const { ir, diagnostics } = buildIR(workbook({ 'enum.Grade': rows }));

  assert.deepEqual(codes(diagnostics), ['E010']);
  assert.equal(diagnostics[0].cell, 'enum.Grade!A5');
  assert.deepEqual(ir.enums[0].members.map((member) => member.name), ['Normal']);
});

test('멤버 값 중복은 E010 이다', () => {
  // 저장된 세이브 데이터와의 호환 때문에 값을 명시할 수 있게 두었으므로,
  // 값이 겹치는 것은 조용히 넘기면 안 된다.
  const rows = [['name', 'value'], ['string', 'int?'], ['', ''], ['A', '5'], ['B', '5']];
  const { diagnostics } = buildIR(workbook({ 'enum.Grade': rows }));

  assert.deepEqual(codes(diagnostics), ['E010']);
  assert.equal(diagnostics[0].cell, 'enum.Grade!B5');
});

test('멤버 이름이 비면 E010 이다', () => {
  const rows = [['name', 'value'], ['string', 'int?'], ['', ''], ['', '5']];
  const { diagnostics } = buildIR(workbook({ 'enum.Grade': rows }));

  assert.deepEqual(codes(diagnostics), ['E010']);
  assert.equal(diagnostics[0].cell, 'enum.Grade!A4');
});

test('정수가 아닌 멤버 값은 E010 이다', () => {
  const rows = [['name', 'value'], ['string', 'int?'], ['', ''], ['A', '높음']];
  const { diagnostics } = buildIR(workbook({ 'enum.Grade': rows }));

  assert.deepEqual(codes(diagnostics), ['E010']);
  assert.equal(diagnostics[0].cell, 'enum.Grade!B4');
});

test('enum 시트의 빈 행은 건너뛴다', () => {
  const rows = [['name'], ['string'], [''], ['A'], [''], ['B']];
  const { ir, diagnostics } = buildIR(workbook({ 'enum.Grade': rows }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.enums[0].members.map((member) => member.value), [0, 1]);
});

// ── E008 참조 대상 정의 없음 ─────────────────────────────────────────

test('enum 정의 시트가 없으면 E008 이고 좌표는 필드명 셀이다', () => {
  const rows = [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['1001', 'Normal']];
  const { ir, diagnostics } = buildIR(workbook({ Monster: rows }));

  assert.deepEqual(codes(diagnostics), ['E008']);
  assert.equal(diagnostics[0].cell, 'Monster!B1');
  assert.equal(ir.sheets[0].rows[0].values.grade, 'Normal', '값은 버리지 않는다');
});

test('ref 대상 시트나 필드가 없으면 E008 이다', () => {
  const rows = [['id', 'drop'], ['int', 'ref:Item.id'], ['', ''], ['1001', '2001']];
  const { diagnostics } = buildIR(workbook({ Monster: rows }));

  assert.deepEqual(codes(diagnostics), ['E008']);
  assert.equal(diagnostics[0].cell, 'Monster!B1');
});

test('E008 은 필드마다 한 번만 나온다', () => {
  // 행마다 내면 10,000 행 시트에서 같은 오류가 10,000 개 쌓인다.
  const rows = [
    ['id', 'grade'],
    ['int', 'enum:Grade'],
    ['', ''],
    ['1001', 'Normal'],
    ['1002', 'Rare'],
    ['1003', 'Unique'],
  ];
  const { diagnostics } = buildIR(workbook({ Monster: rows }));
  assert.deepEqual(codes(diagnostics), ['E008']);
});

// ── ref 캐스팅 (notation.md §4.3) ────────────────────────────────────

test('ref 값은 대상 필드의 타입으로 캐스팅한다', () => {
  const monster = [
    ['id', 'drop_ids'],
    ['int', 'ref:Item.id[]'],
    ['', ''],
    ['1001', '2001,2002'],
  ];
  const item = [['id'], ['int'], [''], ['2001'], ['2002']];
  const { ir, diagnostics } = buildIR(workbook({ Monster: monster, Item: item }));

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(ir.sheets[0].rows[0].values.drop_ids, [2001, 2002]);
});

test('참조 대상이 뒤쪽 시트여도 타입을 찾는다', () => {
  // 헤더를 모두 읽은 뒤에 값을 캐스팅하는 2패스 구조라서 순서에 매이지 않는다.
  const monster = [['id', 'drop'], ['int', 'ref:Item.id'], ['', ''], ['1001', '2001']];
  const item = [['id'], ['int'], [''], ['2001']];
  const { ir } = buildIR(workbook({ Monster: monster, Item: item }));
  assert.equal(ir.sheets[0].rows[0].values.drop, 2001);
});

// ── 진단 합류 ────────────────────────────────────────────────────────

test('헤더 진단과 값 진단이 한 목록에 모인다', () => {
  const rows = [['id', 'hp', 'bad'], ['int', 'int', 'integer'], ['', '', ''], ['1001', 'abc', 'x']];
  const { diagnostics } = buildIR(workbook({ Monster: rows }));

  assert.deepEqual(codes(diagnostics), ['E005', 'E006']);
  assert.deepEqual(
    diagnostics.map((item) => item.cell),
    ['Monster!C2', 'Monster!B4'],
  );
});

test('모든 진단이 좌표를 갖는다', () => {
  const rows = [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['', 'Normal']];
  const { diagnostics } = buildIR(workbook({ Monster: rows }));

  assert.ok(diagnostics.length >= 2);
  for (const item of diagnostics) {
    assert.match(item.cell, /^[^!]+!([A-Z]+\d+)?$/, `${item.code} 의 좌표가 형식에 맞지 않는다`);
  }
});

// ── 결정성 (spec.md §8) ──────────────────────────────────────────────

test('같은 입력을 두 번 조립하면 바이트가 같다', () => {
  const input = workbook({ Monster: MONSTER, 'enum.Grade': ENUM_GRADE });
  const first = buildIR(structuredClone(input));
  const second = buildIR(structuredClone(input));

  assert.equal(toGoldenJson(first.ir), toGoldenJson(second.ir));
  assert.deepEqual(first.diagnostics, second.diagnostics);
});

test('입력 워크북을 수정하지 않는다', () => {
  const input = workbook({ Monster: MONSTER });
  const snapshot = structuredClone(input);
  buildIR(input);
  assert.deepEqual(input, snapshot);
});
