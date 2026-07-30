// TypeNode → CSV 읽기 표현식.
//
// 사양: docs/spec.md §6.2, §6.3 · docs/notation.md §5.2, §5.3
//
// 빈 셀의 뜻이 타입으로 정해지므로(notation §5.2) 표현식도 타입마다 달라진다.
// T[] 는 빈 목록, T[]? 는 null, T 는 오류다. 이 구분이 틀리면 CSV 로 읽은 값이
// JSON 으로 읽은 값과 달라진다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCsvReadExpression } from '../src/core/emit/csharp/csv-read.js';
import { cleanIr } from './support/ir.mjs';

/** 시트 한 장의 필드마다 읽기 표현식을 뽑는다. */
function expressions(sheets, delimiter = ',') {
  const ir = cleanIr(sheets, delimiter === ',' ? undefined : { arrayDelimiter: delimiter });
  return ir.sheets[0].fields.map((field) =>
    toCsvReadExpression(field, ir, { arrayDelimiter: delimiter }),
  );
}

const row = (types, values) => ({
  T: [
    types.map((_, index) => `f${index}`),
    types,
    types.map(() => ''),
    values,
  ],
});

// ── 스칼라 ───────────────────────────────────────────────────────────

test('필수 스칼라는 Value 로 읽는다', () => {
  assert.deepEqual(
    expressions(row(['int', 'long', 'float', 'double', 'bool'], ['1', '2', '1.5', '2.5', 'Y'])),
    [
      'row.Value("f0", GameDataParse.Int)',
      'row.Value("f1", GameDataParse.Long)',
      'row.Value("f2", GameDataParse.Float)',
      'row.Value("f3", GameDataParse.Double)',
      'row.Value("f4", GameDataParse.Bool)',
    ],
  );
});

test('datetime 은 Date 로 읽는다', () => {
  assert.deepEqual(expressions(row(['datetime'], ['2026-07-30'])), [
    'row.Value("f0", GameDataParse.Date)',
  ]);
});

test('문자열과 loc 은 Text 로 읽는다', () => {
  // 참조 타입이라 Value<T> 의 struct 제약을 쓸 수 없고, 빈 셀 처리도 다르다.
  assert.deepEqual(expressions(row(['string', 'loc'], ['a', 'KEY'])), [
    'row.Text("f0")',
    'row.Text("f1")',
  ]);
});

test('nullable 스칼라는 Nullable 로 읽는다', () => {
  assert.deepEqual(expressions(row(['int?', 'bool?'], ['1', 'Y'])), [
    'row.ValueOrNull("f0", GameDataParse.Int)',
    'row.ValueOrNull("f1", GameDataParse.Bool)',
  ]);
});

test('nullable 문자열은 TextOrNull 로 읽는다', () => {
  // string? 의 C# 타입은 string 이라 표현식으로만 구분된다. 빈 셀이 null 이어야 한다.
  assert.deepEqual(expressions(row(['string?', 'loc?'], ['a', 'KEY'])), [
    'row.TextOrNull("f0")',
    'row.TextOrNull("f1")',
  ]);
});

// ── enum 과 ref ──────────────────────────────────────────────────────

test('enum 은 타입 인자를 붙여 읽는다', () => {
  const ir = cleanIr({
    T: [['a', 'b'], ['enum:Grade', 'enum:Grade?'], ['', ''], ['Normal', 'Normal']],
    'enum.Grade': [['name', 'value'], ['string', 'int?'], ['', ''], ['Normal', '0']],
  });

  assert.deepEqual(
    ir.sheets[0].fields.map((field) => toCsvReadExpression(field, ir, {})),
    ['row.Value("a", GameDataParse.Enum<Grade>)', 'row.ValueOrNull("b", GameDataParse.Enum<Grade>)'],
  );
});

test('ref 는 대상 필드의 타입을 따른다', () => {
  const ir = cleanIr({
    Monster: [['id', 'drop'], ['int', 'ref:Item.code'], ['', ''], ['1', 'A']],
    Item: [['id', 'code'], ['int', 'string'], ['', ''], ['2', 'A']],
  });

  assert.deepEqual(
    ir.sheets[0].fields.map((field) => toCsvReadExpression(field, ir, {})),
    ['row.Value("id", GameDataParse.Int)', 'row.Text("drop")'],
  );
});

// ── 배열 (notation.md §5.2) ──────────────────────────────────────────

test('T[] 는 빈 셀이 빈 목록이다', () => {
  assert.deepEqual(expressions(row(['int[]'], ['1,2'])), [
    'row.ValueList("f0", GameDataParse.Int, ",")',
  ]);
});

test('T[]? 는 빈 셀이 null 이다', () => {
  assert.deepEqual(expressions(row(['int[]?'], ['1,2'])), [
    'row.ValueListOrNull("f0", GameDataParse.Int, ",")',
  ]);
});

test('T?[] 는 원소가 비어 있을 수 있다', () => {
  assert.deepEqual(expressions(row(['int?[]'], ['1,2'])), [
    'row.NullableList("f0", GameDataParse.Int, ",")',
  ]);
});

test('문자열 배열은 전용 메서드로 읽는다', () => {
  assert.deepEqual(expressions(row(['string[]', 'string[]?'], ['a,b', 'a,b'])), [
    'row.TextList("f0", ",")',
    'row.TextListOrNull("f1", ",")',
  ]);
});

test('enum 배열도 읽는다', () => {
  const ir = cleanIr({
    T: [['a'], ['enum:Grade[]'], [''], ['Normal']],
    'enum.Grade': [['name', 'value'], ['string', 'int?'], ['', ''], ['Normal', '0']],
  });

  assert.deepEqual(
    ir.sheets[0].fields.map((field) => toCsvReadExpression(field, ir, {})),
    ['row.ValueList("a", GameDataParse.Enum<Grade>, ",")'],
  );
});

// ── 배열 구분자 (설정값) ─────────────────────────────────────────────

test('배열 구분자를 표현식에 박는다', () => {
  // 내보낼 때 쓴 구분자와 읽을 때 쓰는 구분자가 같아야 한다. 설정을 나중에 바꿔도
  // 이미 생성된 코드는 자기가 내보낸 CSV 를 읽는다.
  assert.deepEqual(expressions(row(['int[]'], ['1;2']), ';'), [
    'row.ValueList("f0", GameDataParse.Int, ";")',
  ]);
});

test('구분자의 따옴표와 역슬래시를 이스케이프한다', () => {
  const ir = cleanIr(
    { T: [['a'], ['int[]'], [''], ['1\\2']] },
    { arrayDelimiter: '\\' },
  );

  assert.equal(
    toCsvReadExpression(ir.sheets[0].fields[0], ir, { arrayDelimiter: '\\' }),
    'row.ValueList("a", GameDataParse.Int, "\\\\")',
  );
});

// ── 식별자 ───────────────────────────────────────────────────────────

test('열 이름은 변환된 식별자다', () => {
  // CSV 헤더가 변환된 식별자를 쓰므로(§6.2) 읽을 때도 같은 이름으로 찾아야 한다.
  const ir = cleanIr({ T: [['고유 ID'], ['int'], [''], ['1']] });

  assert.equal(
    toCsvReadExpression(ir.sheets[0].fields[0], ir, {}),
    'row.Value("고유_ID", GameDataParse.Int)',
  );
});

test('원소와 배열이 모두 nullable 인 조합도 읽는다', () => {
  // int?[]? — 배열 전체가 없을 수 있고 원소도 없을 수 있다 (notation §2.1).
  assert.deepEqual(expressions(row(['int?[]?'], ['1,2'])), [
    'row.NullableListOrNull("f0", GameDataParse.Int, ",")',
  ]);
});

test('필요한 목록 메서드가 여섯 가지다', () => {
  // 런타임이 이 여섯 개를 모두 내야 한다. 하나라도 빠지면 컴파일되지 않는다.
  const found = new Set(
    expressions(
      row(
        ['int[]', 'int[]?', 'int?[]', 'int?[]?', 'string[]', 'string[]?'],
        ['1', '1', '1', '1', 'a', 'a'],
      ),
    ).map((expression) => expression.slice('row.'.length, expression.indexOf('('))),
  );

  assert.deepEqual([...found].sort(), [
    'NullableList',
    'NullableListOrNull',
    'TextList',
    'TextListOrNull',
    // List·Nullable 이라는 이름은 C# 에서 System.Collections.Generic.List·
    // System.Nullable 을 가려 CS0118 이 된다 (runtime.js 참조).
    'ValueList',
    'ValueListOrNull',
  ]);
});
