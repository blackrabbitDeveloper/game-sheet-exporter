// 셀 문자열 + TypeNode → 값.
//
// 사양: docs/notation.md §3(스칼라), §5.2(빈 셀), §5.3(배열), §3.3(long 정밀도)
//
// "숫자처럼 생겼으니 숫자" 는 없다. 캐스팅은 타입 표기가 지시하는 대로만 일어난다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseValue } from '../src/core/parser/value-parser.js';

const scalar = (name) => ({ kind: 'scalar', name });
const nullable = (of) => ({ kind: 'nullable', of });
const array = (of) => ({ kind: 'array', of });
const loc = () => ({ kind: 'loc' });
const enumRef = (name) => ({ kind: 'enum', name });
const ref = (sheet, field) => ({ kind: 'ref', sheet, field });

const CELL = 'Monster!D17';

function parse(text, type, extra = {}) {
  return parseValue(text, type, { cell: CELL, delimiter: ',', ...extra });
}

/** 진단 없이 나온 값만 돌려준다. 진단이 있으면 그 자리에서 실패시킨다. */
function valueOf(text, type, extra) {
  const result = parse(text, type, extra);
  assert.deepEqual(
    result.diagnostics.map((item) => `${item.code} ${item.message}`),
    [],
    `${JSON.stringify(text)} 에서 예상치 못한 진단이 나왔다`,
  );
  return result.value;
}

const codesOf = (text, type, extra) => parse(text, type, extra).diagnostics.map((item) => item.code);

// ── 빈 셀 (notation.md §5.2) ─────────────────────────────────────────

test('빈 셀의 네 가지 형태를 모두 같게 취급한다', () => {
  // 셋을 구분하는 순간 엑셀 편집 이력에 따라 결과가 달라진다.
  for (const blank of [undefined, null, '', '   ', '\t']) {
    assert.equal(valueOf(blank, nullable(scalar('int'))), null, JSON.stringify(blank));
    assert.deepEqual(valueOf(blank, array(scalar('int'))), [], JSON.stringify(blank));
    assert.deepEqual(codesOf(blank, scalar('int')), ['E003'], JSON.stringify(blank));
  }
});

test('빈 셀의 결과는 타입이 정한다', () => {
  assert.equal(valueOf('', nullable(scalar('int'))), null); // T?
  assert.deepEqual(valueOf('', array(scalar('int'))), []); // T[]
  assert.equal(valueOf('', nullable(array(scalar('int')))), null); // T[]?
  assert.deepEqual(valueOf('', array(nullable(scalar('int')))), []); // T?[]
});

test('빈 셀에 기본값을 채우지 않는다', () => {
  // 비어 있는 int 열이 0 으로 나가면 밸런스 데이터에서 가장 찾기 어려운 버그가 된다.
  const result = parse('', scalar('int'));
  assert.deepEqual(result.diagnostics.map((item) => item.code), ['E003']);
  assert.equal(result.value, null);
  assert.equal(result.diagnostics[0].cell, CELL);
});

test('loc 과 enum 도 빈 셀을 채우지 않는다', () => {
  assert.deepEqual(codesOf('', loc()), ['E003']);
  assert.deepEqual(codesOf('', enumRef('Grade')), ['E003']);
  assert.equal(valueOf('', nullable(enumRef('Grade'))), null);
});

// ── int · long (notation.md §3, §3.3) ────────────────────────────────

test('int 를 캐스팅한다', () => {
  assert.equal(valueOf('1001', scalar('int')), 1001);
  assert.equal(valueOf('-5', scalar('int')), -5);
  assert.equal(valueOf('0', scalar('int')), 0);
  assert.equal(valueOf('  30  ', scalar('int')), 30);
});

test('int 는 32비트 범위를 지킨다', () => {
  assert.equal(valueOf('2147483647', scalar('int')), 2147483647);
  assert.equal(valueOf('-2147483648', scalar('int')), -2147483648);
  assert.deepEqual(codesOf('2147483648', scalar('int')), ['E006']);
  assert.deepEqual(codesOf('-2147483649', scalar('int')), ['E006']);
});

test('int 가 아닌 것을 거부한다', () => {
  for (const bad of ['abc', '1.5', '1e5', '１００１', '#REF!', 'TRUE']) {
    assert.deepEqual(codesOf(bad, scalar('int')), ['E006'], bad);
  }
});

test('천 단위 구분 쉼표를 거부한다', () => {
  // 배열 구분자와 충돌한다 (notation.md §3).
  assert.deepEqual(codesOf('1,000', scalar('int')), ['E006']);
});

test('long 은 안전 정수 범위 밖을 거부한다', () => {
  // notation.md §3.3: 조용히 다른 값이 되는 것보다 거부가 낫다.
  assert.equal(valueOf('9007199254740991', scalar('long')), 9007199254740991);
  assert.deepEqual(codesOf('9007199254740993', scalar('long')), ['E006']);
  assert.deepEqual(codesOf('-9007199254740993', scalar('long')), ['E006']);
});

test('long 은 int 범위를 넘어도 된다', () => {
  assert.equal(valueOf('2147483648', scalar('long')), 2147483648);
});

// ── float · double ───────────────────────────────────────────────────

test('float 과 double 을 캐스팅한다', () => {
  for (const name of ['float', 'double']) {
    assert.equal(valueOf('1.5', scalar(name)), 1.5, name);
    assert.equal(valueOf('-0.25', scalar(name)), -0.25, name);
    assert.equal(valueOf('30', scalar(name)), 30, name);
    assert.equal(valueOf('1e5', scalar(name)), 100000, name);
    assert.equal(valueOf('1.5e-3', scalar(name)), 0.0015, name);
  }
});

test('유한하지 않은 수를 거부한다', () => {
  for (const bad of ['1e999', 'Infinity', 'NaN', '.5', '1.', 'abc']) {
    assert.deepEqual(codesOf(bad, scalar('float')), ['E006'], bad);
  }
});

// ── bool (notation.md §3.1) ──────────────────────────────────────────

test('bool 의 참 표기를 받는다', () => {
  for (const text of ['TRUE', 'true', 'True', '1', 'Y', 'y', 'O', 'o']) {
    assert.equal(valueOf(text, scalar('bool')), true, text);
  }
});

test('bool 의 거짓 표기를 받는다', () => {
  for (const text of ['FALSE', 'false', 'False', '0', 'N', 'n', 'X', 'x']) {
    assert.equal(valueOf(text, scalar('bool')), false, text);
  }
});

test('목록에 없는 bool 표기를 거부한다', () => {
  for (const bad of ['maybe', '2', 'YES', 'ㅇ', '참']) {
    assert.deepEqual(codesOf(bad, scalar('bool')), ['E006'], bad);
  }
});

test('빈 셀은 거짓이 아니다', () => {
  // bool 은 명시를 요구한다. 비워두려면 bool? 를 쓴다.
  assert.deepEqual(codesOf('', scalar('bool')), ['E003']);
  assert.equal(valueOf('', nullable(scalar('bool'))), null);
});

// ── string · loc · enum ──────────────────────────────────────────────

test('string 은 앞뒤 공백만 없애고 안쪽은 보존한다', () => {
  assert.equal(valueOf('  간격 있는 값  ', scalar('string')), '간격 있는 값');
  assert.equal(valueOf('1001', scalar('string')), '1001');
});

test('loc 과 enum 은 문자열 그대로 둔다', () => {
  // 키 형식(W106)과 멤버 존재(E009) 확인은 IR 이 만들어진 뒤에 한다.
  assert.equal(valueOf('MON_SLIME', loc()), 'MON_SLIME');
  assert.equal(valueOf('소문자키', loc()), '소문자키');
  assert.equal(valueOf('Normal', enumRef('Grade')), 'Normal');
  assert.equal(valueOf('없는멤버', enumRef('Grade')), '없는멤버');
});

// ── datetime (notation.md §3.2) ──────────────────────────────────────

test('엑셀 시리얼을 UTC ISO 8601 로 바꾼다', () => {
  assert.equal(valueOf('46232', scalar('datetime')), '2026-07-29T00:00:00.000Z');
  assert.equal(valueOf('61', scalar('datetime')), '1900-03-01T00:00:00.000Z');
});

test('시리얼의 시각 부분을 보존한다', () => {
  assert.equal(valueOf('46232.5', scalar('datetime')), '2026-07-29T12:00:00.000Z');
});

test('시리얼 60 이하를 거부한다', () => {
  // 1900 년을 윤년으로 잘못 처리하는 엑셀의 호환성 버그 구간이다.
  for (const bad of ['60', '59', '1', '0', '-1']) {
    assert.deepEqual(codesOf(bad, scalar('datetime')), ['E006'], bad);
  }
});

test('ISO 8601 문자열을 받는다', () => {
  assert.equal(valueOf('2026-07-29', scalar('datetime')), '2026-07-29T00:00:00.000Z');
  assert.equal(valueOf('2026-07-29T12:00:00Z', scalar('datetime')), '2026-07-29T12:00:00.000Z');
  assert.equal(valueOf('2026-07-29T12:00:00+09:00', scalar('datetime')), '2026-07-29T03:00:00.000Z');
});

test('지역 서식과 실재하지 않는 날짜를 거부한다', () => {
  for (const bad of ['2026/07/29', '26.7.29', '29-07-2026', '2026-02-30', '2026-13-01', '2026-07-29T25:00:00Z']) {
    assert.deepEqual(codesOf(bad, scalar('datetime')), ['E006'], bad);
  }
});

// ── 배열 (notation.md §5.3) ──────────────────────────────────────────

test('쉼표로 원소를 나눈다', () => {
  assert.deepEqual(valueOf('2001,2002,2003', array(scalar('int'))), [2001, 2002, 2003]);
  assert.deepEqual(valueOf('2001', array(scalar('int'))), [2001]);
});

test('원소의 앞뒤 공백을 없앤다', () => {
  assert.deepEqual(valueOf('2001, 2002 ,2003', array(scalar('int'))), [2001, 2002, 2003]);
});

test('빈 원소를 거부한다', () => {
  // 2001,,2003 은 대개 오타다.
  assert.deepEqual(codesOf('2001,,2003', array(scalar('int'))), ['E006']);
  assert.deepEqual(codesOf('2001,', array(scalar('int'))), ['E006']);
  assert.deepEqual(codesOf(',2001', array(scalar('int'))), ['E006']);
});

test('원소 nullable 을 명시하면 빈 원소를 받는다', () => {
  assert.deepEqual(valueOf('1,,3', array(nullable(scalar('int')))), [1, null, 3]);
});

test('큰따옴표로 구분자를 감싼다', () => {
  assert.deepEqual(valueOf('"a,b",c', array(scalar('string'))), ['a,b', 'c']);
});

test('큰따옴표 안의 큰따옴표는 두 번 쓴다', () => {
  assert.deepEqual(valueOf('"say ""hi"""', array(scalar('string'))), ['say "hi"']);
});

test('따옴표 안의 공백은 보존한다', () => {
  assert.deepEqual(valueOf('"  간격  ",b', array(scalar('string'))), ['  간격  ', 'b']);
});

test('따옴표로 감싼 빈 문자열은 빈 원소가 아니다', () => {
  assert.deepEqual(valueOf('"",b', array(scalar('string'))), ['', 'b']);
});

test('닫히지 않은 따옴표를 거부한다', () => {
  assert.deepEqual(codesOf('"a,b', array(scalar('string'))), ['E006']);
});

test('구분자를 설정으로 바꾼다', () => {
  assert.deepEqual(valueOf('2001;2002', array(scalar('int')), { delimiter: ';' }), [2001, 2002]);
  // 구분자를 바꾸면 쉼표는 평범한 문자가 된다.
  assert.deepEqual(valueOf('a,b;c', array(scalar('string')), { delimiter: ';' }), ['a,b', 'c']);
});

test('원소마다 캐스팅 오류를 낸다', () => {
  assert.deepEqual(codesOf('1,abc,3,xyz', array(scalar('int'))), ['E006', 'E006']);
});

// ── ref (notation.md §4.3) ───────────────────────────────────────────

test('ref 는 대상 필드의 타입으로 캐스팅한다', () => {
  const resolveRef = (sheet, field) => (sheet === 'Item' && field === 'id' ? scalar('int') : null);
  assert.equal(valueOf('2001', ref('Item', 'id'), { resolveRef }), 2001);
  assert.deepEqual(valueOf('2001,2002', array(ref('Item', 'id')), { resolveRef }), [2001, 2002]);
});

test('대상 타입이 string 이면 문자열로 남는다', () => {
  const resolveRef = () => scalar('string');
  assert.equal(valueOf('2001', ref('Item', 'code'), { resolveRef }), '2001');
});

test('대상을 못 찾으면 값을 문자열로 두고 진단하지 않는다', () => {
  // E008 은 헤더 단계에서 필드마다 한 번 나온다. 여기서 또 내면 행 수만큼 쌓인다.
  const result = parse('2001', ref('Item', 'id'), { resolveRef: () => null });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.value, '2001');
});

test('참조의 참조는 따라가지 않는다', () => {
  // 순환 참조가 허용되므로 끝까지 따라가면 멈추지 않는다 (notation.md §4.3).
  const result = parse('2001', ref('A', 'x'), { resolveRef: () => ref('B', 'y') });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.value, '2001');
});

// ── 좌표와 결정성 ────────────────────────────────────────────────────

test('모든 진단이 셀 좌표를 갖는다', () => {
  const cases = [
    ['', scalar('int')],
    ['abc', scalar('int')],
    ['maybe', scalar('bool')],
    ['60', scalar('datetime')],
    ['1,,2', array(scalar('int'))],
    ['"a', array(scalar('string'))],
  ];
  for (const [text, type] of cases) {
    const { diagnostics } = parse(text, type);
    assert.ok(diagnostics.length > 0, `${JSON.stringify(text)} 는 진단이 나와야 한다`);
    for (const item of diagnostics) {
      assert.equal(item.cell, CELL, `${item.code} 의 좌표`);
      assert.ok(item.message.trim().length > 0, `${item.code} 의 메시지`);
    }
  }
});

test('같은 입력은 같은 결과를 낸다', () => {
  const type = array(nullable(scalar('int')));
  assert.deepEqual(parse('1,,3', type), parse('1,,3', type));
});
