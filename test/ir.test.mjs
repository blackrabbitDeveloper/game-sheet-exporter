// IR 상수·레이아웃 검증·진단 객체를 고정한다.
//
// 사양: docs/spec.md §3.1(헤더 행은 설정값), §3.2(무시 규칙), §5.1(좌표 필수)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_ARRAY_DELIMITER,
  DEFAULT_LAYOUT,
  IR_VERSION,
  classifySheet,
  isIgnoredFieldName,
  normalizeLayout,
} from '../src/core/ir/schema.js';
import {
  diagnostic,
  hasErrors,
  isError,
  isWarning,
  sortDiagnostics,
} from '../src/core/ir/diagnostic.js';

// ── 상수 ─────────────────────────────────────────────────────────────

test('IR 버전과 기본값을 고정한다', () => {
  assert.equal(IR_VERSION, 2);
  assert.deepEqual(DEFAULT_LAYOUT, { nameRow: 1, typeRow: 2, commentRow: 3, dataStartRow: 4 });
  assert.equal(DEFAULT_ARRAY_DELIMITER, ',');
});

test('기본 레이아웃을 수정해도 원본이 오염되지 않는다', () => {
  const first = normalizeLayout();
  first.nameRow = 99;
  assert.equal(normalizeLayout().nameRow, 1);
});

// ── 레이아웃 (spec.md §3.1) ──────────────────────────────────────────

test('레이아웃을 생략하면 기본값을 쓴다', () => {
  assert.deepEqual(normalizeLayout(), DEFAULT_LAYOUT);
  assert.deepEqual(normalizeLayout({}), DEFAULT_LAYOUT);
});

test('헤더 행 번호는 설정값이다', () => {
  // 기존 시트를 가진 팀이 헤더를 옮기지 않고 쓸 수 있어야 한다.
  assert.deepEqual(
    normalizeLayout({ nameRow: 5, typeRow: 6, commentRow: 7, dataStartRow: 9 }),
    { nameRow: 5, typeRow: 6, commentRow: 7, dataStartRow: 9 },
  );
});

test('주석 행은 없앨 수 있다', () => {
  const layout = normalizeLayout({ nameRow: 1, typeRow: 2, commentRow: null, dataStartRow: 3 });
  assert.equal(layout.commentRow, null);
});

test('주석 행 생략과 명시적 없음을 구분한다', () => {
  // undefined 는 "안 정했다" 이므로 기본값 3, null 은 "주석 행이 없다" 이다.
  assert.equal(normalizeLayout({ nameRow: 1, typeRow: 2 }).commentRow, 3);
  assert.equal(normalizeLayout({ commentRow: null, dataStartRow: 3 }).commentRow, null);
});

test('데이터 시작 행이 헤더 행보다 뒤에 있어야 한다', () => {
  assert.throws(
    () => normalizeLayout({ nameRow: 1, typeRow: 2, commentRow: 3, dataStartRow: 3 }),
    /데이터 시작 행/,
  );
  assert.throws(
    () => normalizeLayout({ nameRow: 5, typeRow: 6, commentRow: null, dataStartRow: 4 }),
    /데이터 시작 행/,
  );
});

test('헤더 행 번호가 겹치면 거부한다', () => {
  assert.throws(() => normalizeLayout({ nameRow: 2, typeRow: 2 }), /겹칩니다/);
  assert.throws(() => normalizeLayout({ nameRow: 1, typeRow: 3, commentRow: 3 }), /겹칩니다/);
});

test('행 번호는 1 이상의 정수여야 한다', () => {
  for (const bad of [0, -1, 1.5, NaN, '1']) {
    assert.throws(() => normalizeLayout({ nameRow: bad }), /행 번호/, `nameRow=${bad}`);
  }
});

// ── 시트·열 분류 (spec.md §3.2) ──────────────────────────────────────

test('시트를 데이터·enum·무시로 분류한다', () => {
  assert.equal(classifySheet('Monster'), 'data');
  assert.equal(classifySheet('몬스터 정보'), 'data');
  assert.equal(classifySheet('enum.Grade'), 'enum');
  assert.equal(classifySheet('#임시계산'), 'ignored');
  assert.equal(classifySheet('_메모'), 'ignored');
});

test('무시 규칙이 enum 규칙보다 먼저 걸린다', () => {
  // 쓰지 않게 된 enum 정의 시트를 지우지 않고 _ 를 붙여 두는 관습을 받아준다.
  assert.equal(classifySheet('_enum.Old'), 'ignored');
  assert.equal(classifySheet('#enum.Draft'), 'ignored');
});

test('enum 접두는 이름이 뒤따라야 한다', () => {
  assert.equal(classifySheet('enum.'), 'data');
  assert.equal(classifySheet('enumGrade'), 'data');
});

test('빈 열과 # 로 시작하는 열을 무시한다', () => {
  // 실제 시트에는 계산용 임시 열이 늘 섞여 있다.
  assert.equal(isIgnoredFieldName(''), true);
  assert.equal(isIgnoredFieldName('   '), true);
  assert.equal(isIgnoredFieldName(undefined), true);
  assert.equal(isIgnoredFieldName('#계산용'), true);
  assert.equal(isIgnoredFieldName('  #계산용  '), true);
  assert.equal(isIgnoredFieldName('id'), false);
  assert.equal(isIgnoredFieldName('드랍_ids'), false);
});

// ── 진단 (spec.md §5.1) ──────────────────────────────────────────────

test('진단은 코드·좌표·메시지·상세를 갖는다', () => {
  assert.deepEqual(
    diagnostic('E004', 'Monster!E4', '참조 대상이 없습니다: Item.id = 2003', 'drop_ids 열의 값'),
    { code: 'E004', cell: 'Monster!E4', message: '참조 대상이 없습니다: Item.id = 2003', detail: 'drop_ids 열의 값' },
  );
});

test('상세를 생략하면 빈 문자열이 된다', () => {
  // 키가 있다 없다 하면 골든 비교가 흔들린다.
  assert.deepEqual(Object.keys(diagnostic('E003', 'Monster!A4', '필수 값 누락')), [
    'code',
    'cell',
    'message',
    'detail',
  ]);
  assert.equal(diagnostic('E003', 'Monster!A4', '필수 값 누락').detail, '');
});

test('좌표 없는 진단을 만들 수 없다', () => {
  // spec.md §5.1: 좌표 없는 검증 결과는 미완성으로 간주한다.
  for (const bad of ['', '   ', null, undefined]) {
    assert.throws(() => diagnostic('E003', bad, '메시지'), /좌표/, `cell=${JSON.stringify(bad)}`);
  }
});

test('진단 코드 형식을 강제한다', () => {
  for (const bad of ['E1', 'X001', 'e001', 'E0011', '', null]) {
    assert.throws(() => diagnostic(bad, 'Monster!A1', '메시지'), /진단 코드/, `code=${bad}`);
  }
});

test('빈 메시지를 거부한다', () => {
  assert.throws(() => diagnostic('E003', 'Monster!A1', '   '), /메시지/);
});

test('E 는 오류, W 는 경고다', () => {
  const error = diagnostic('E003', 'Monster!A4', '필수 값 누락');
  const warning = diagnostic('W105', 'Monster!B1', '식별자가 변환되었습니다');

  assert.equal(isError(error), true);
  assert.equal(isWarning(error), false);
  assert.equal(isError(warning), false);
  assert.equal(isWarning(warning), true);
});

// ── 진단 정렬 ────────────────────────────────────────────────────────

const cells = (list) => list.map((item) => item.cell);

test('시트 순서를 따르고 시트 안에서는 행 → 열 순이다', () => {
  const input = [
    diagnostic('E006', 'Item!B5', 'b'),
    diagnostic('E003', 'Monster!C4', 'c'),
    diagnostic('E003', 'Monster!A4', 'a'),
    diagnostic('E006', 'Item!A4', 'd'),
    diagnostic('E003', 'Monster!A2', 'e'),
  ];
  assert.deepEqual(cells(sortDiagnostics(input, ['Monster', 'Item'])), [
    'Monster!A2',
    'Monster!A4',
    'Monster!C4',
    'Item!A4',
    'Item!B5',
  ]);
});

test('시트 전체 좌표가 그 시트의 셀 좌표보다 앞에 온다', () => {
  const input = [diagnostic('E003', 'Monster!A4', 'a'), diagnostic('W102', 'Monster!', 'b')];
  assert.deepEqual(cells(sortDiagnostics(input, ['Monster'])), ['Monster!', 'Monster!A4']);
});

test('파일 전체 좌표가 맨 앞에 온다', () => {
  const input = [diagnostic('E003', 'Monster!A4', 'a'), diagnostic('E015', 'gamedata.xlsx', 'b')];
  assert.deepEqual(cells(sortDiagnostics(input, ['Monster'])), ['gamedata.xlsx', 'Monster!A4']);
});

test('목록에 없는 시트는 뒤에 이름순으로 온다', () => {
  const input = [
    diagnostic('E003', 'Zebra!A1', 'a'),
    diagnostic('E003', 'Monster!A1', 'b'),
    diagnostic('E003', 'Apple!A1', 'c'),
  ];
  assert.deepEqual(cells(sortDiagnostics(input, ['Monster'])), ['Monster!A1', 'Apple!A1', 'Zebra!A1']);
});

test('같은 셀이면 코드 순이다', () => {
  const input = [
    diagnostic('W106', 'Monster!A4', 'b'),
    diagnostic('E006', 'Monster!A4', 'a'),
    diagnostic('E003', 'Monster!A4', 'c'),
  ];
  assert.deepEqual(
    sortDiagnostics(input, ['Monster']).map((item) => item.code),
    ['E003', 'E006', 'W106'],
  );
});

test('정렬은 원본을 바꾸지 않고 결정적이다', () => {
  const input = [diagnostic('E006', 'Item!B5', 'b'), diagnostic('E003', 'Monster!A4', 'a')];
  const snapshot = structuredClone(input);
  const first = sortDiagnostics(input, ['Monster', 'Item']);
  const second = sortDiagnostics(input, ['Monster', 'Item']);

  assert.deepEqual(input, snapshot, '원본 배열이 바뀌었다');
  assert.deepEqual(first, second);
});

test('오류가 하나라도 있으면 내보내기를 막는다', () => {
  // spec.md §5.1: E 하나라도 있으면 내보내기를 막고 W 는 진행한다.
  const warning = diagnostic('W102', 'Empty!', '데이터 행이 없습니다');
  const error = diagnostic('E003', 'Monster!A4', '필수 값 누락');

  assert.equal(hasErrors([]), false);
  assert.equal(hasErrors([warning]), false);
  assert.equal(hasErrors([warning, error]), true);
});
