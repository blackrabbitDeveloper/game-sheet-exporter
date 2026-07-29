// docs/notation.md 의 타입 표기 스펙을 고정한다.
// 표의 모든 행 + §7 거부 사례 전체를 케이스로 넣는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseTypeNotation } from '../src/core/parser/type-notation.js';

const scalar = (name) => ({ kind: 'scalar', name });
const nullable = (of) => ({ kind: 'nullable', of });
const array = (of) => ({ kind: 'array', of });
const loc = () => ({ kind: 'loc' });
const enumRef = (name) => ({ kind: 'enum', name });
const ref = (sheet, field) => ({ kind: 'ref', sheet, field });

function assertRejected(input, reason) {
  const label = `${JSON.stringify(input)} (${reason})`;
  let thrown;
  try {
    parseTypeNotation(input);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `${label} 는 거부되어야 한다`);
  assert.equal(thrown.code, 'E005', `${label} 의 오류 코드`);
  assert.ok(thrown instanceof Error, `${label} 는 Error 를 던져야 한다`);
  assert.ok(thrown.message.trim().length > 0, `${label} 의 메시지가 비어 있다`);
}

// ── 스칼라 (notation.md §3) ──────────────────────────────────────────

test('스칼라 타입을 파싱한다', () => {
  for (const name of ['int', 'long', 'float', 'double', 'bool', 'string', 'datetime']) {
    assert.deepEqual(parseTypeNotation(name), scalar(name), name);
  }
});

// ── 접미사 (notation.md §2.1, §6) ────────────────────────────────────

test('접미사를 왼쪽부터 적용한다', () => {
  assert.deepEqual(parseTypeNotation('int?'), nullable(scalar('int')));
  assert.deepEqual(parseTypeNotation('int[]'), array(scalar('int')));
  assert.deepEqual(parseTypeNotation('int[]?'), nullable(array(scalar('int'))));
  assert.deepEqual(parseTypeNotation('int?[]'), array(nullable(scalar('int'))));
});

test('int[]? 와 int?[] 는 서로 다른 타입이다', () => {
  assert.notDeepEqual(parseTypeNotation('int[]?'), parseTypeNotation('int?[]'));
});

test('파서는 임의 깊이의 중첩을 파싱한다', () => {
  // 에미터가 E013 으로 거부하더라도 파서 단계에서는 통과해야 한다 (§2.2)
  assert.deepEqual(parseTypeNotation('int[][]'), array(array(scalar('int'))));
  assert.deepEqual(
    parseTypeNotation('int[]?[]'),
    array(nullable(array(scalar('int')))),
  );
});

// ── 접두 표기 (notation.md §4) ───────────────────────────────────────

test('loc 을 파싱한다', () => {
  assert.deepEqual(parseTypeNotation('loc'), loc());
  assert.deepEqual(parseTypeNotation('loc[]'), array(loc()));
  assert.deepEqual(parseTypeNotation('loc?'), nullable(loc()));
});

test('enum 참조를 파싱한다', () => {
  assert.deepEqual(parseTypeNotation('enum:Grade'), enumRef('Grade'));
  assert.deepEqual(parseTypeNotation('enum:Grade[]'), array(enumRef('Grade')));
  assert.deepEqual(parseTypeNotation('enum:Grade?'), nullable(enumRef('Grade')));
  assert.deepEqual(parseTypeNotation('enum:Item_Type2'), enumRef('Item_Type2'));
});

test('시트 참조를 파싱한다', () => {
  assert.deepEqual(parseTypeNotation('ref:Item.id'), ref('Item', 'id'));
  assert.deepEqual(parseTypeNotation('ref:Item.id[]'), array(ref('Item', 'id')));
  assert.deepEqual(
    parseTypeNotation('ref:Item.id[]?'),
    nullable(array(ref('Item', 'id'))),
  );
  assert.deepEqual(parseTypeNotation('ref:Item_2.drop_id'), ref('Item_2', 'drop_id'));
});

test('한글 식별자를 허용한다', () => {
  // spec.md §6.4 — C# 명세상 유니코드 식별자는 합법이다
  assert.deepEqual(parseTypeNotation('enum:등급'), enumRef('등급'));
  assert.deepEqual(parseTypeNotation('ref:아이템.번호'), ref('아이템', '번호'));
});

// ── 공백과 대소문자 (notation.md §2) ─────────────────────────────────

test('공백은 무시한다', () => {
  assert.deepEqual(parseTypeNotation('  int  '), scalar('int'));
  assert.deepEqual(parseTypeNotation('int [ ]'), array(scalar('int')));
  assert.deepEqual(parseTypeNotation('enum : Grade'), enumRef('Grade'));
  assert.deepEqual(parseTypeNotation('ref : Item . id [ ] ?'), nullable(array(ref('Item', 'id'))));
  assert.deepEqual(parseTypeNotation('int\t?'), nullable(scalar('int')));
});

test('대소문자를 구분한다', () => {
  for (const input of ['Int', 'INT', 'Bool', 'String', 'Loc', 'Enum:Grade', 'Ref:Item.id']) {
    assertRejected(input, '대소문자 구분');
  }
});

// ── 거부 사례 (notation.md §7) ───────────────────────────────────────

test('§7 거부 사례를 모두 E005 로 거부한다', () => {
  const cases = [
    ['', '빈 문자열'],
    ['   ', '공백만'],
    ['Int', '대소문자 구분'],
    ['integer', '알 수 없는 스칼라'],
    ['enum', 'enum 이름 누락'],
    ['enum:', 'enum 이름 누락'],
    ['enum:1Grade', '식별자가 숫자로 시작'],
    ['ref:Item', 'ref 필드 누락'],
    ['ref:Item.', 'ref 필드 누락'],
    ['ref:.id', 'ref 시트 누락'],
    ['int[', '닫히지 않은 접미사'],
    ['int]', '여는 괄호 없음'],
    ['int??', '중복 nullable'],
    ['?int', '접미사가 앞에 옴'],
    ['loc:Name', 'loc 은 인자를 받지 않음'],
  ];
  for (const [input, reason] of cases) assertRejected(input, reason);
});

test('중복 nullable 만 거부하고 사이에 배열이 끼면 허용한다', () => {
  assertRejected('int??', '중복 nullable');
  assertRejected('int?[]??', '중복 nullable');
  assert.deepEqual(parseTypeNotation('int?[]?'), nullable(array(nullable(scalar('int')))));
});

test('표기 뒤에 남은 문자가 있으면 거부한다', () => {
  for (const input of ['int x', 'enum:Grade Y', 'ref:Item.id.extra', 'loc loc', 'int[]]']) {
    assertRejected(input, '남은 문자');
  }
});

test('문자열이 아닌 입력을 거부한다', () => {
  for (const input of [null, undefined, 42, {}, ['int']]) {
    assertRejected(input, '문자열이 아님');
  }
});

// ── 오류 메시지 품질 ─────────────────────────────────────────────────

test('오류 메시지에 원본 표기가 들어간다', () => {
  // 리포트가 Monster!B2 좌표와 함께 이 메시지를 보여준다. 무엇이 틀렸는지 알아야 한다.
  try {
    parseTypeNotation('integer');
    assert.fail('거부되어야 한다');
  } catch (error) {
    assert.match(error.message, /integer/);
  }
});

// ── 구조 계약 ────────────────────────────────────────────────────────

test('같은 입력은 매번 새 객체를 낸다', () => {
  // 노드를 공유하면 이후 단계에서 한 곳을 고쳤을 때 다른 필드까지 바뀐다.
  const first = parseTypeNotation('int[]');
  const second = parseTypeNotation('int[]');
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.of, second.of);
});

test('다른 모듈을 import 하지 않는다', () => {
  // 개발가이드 §4.1 — 순수 문자열 처리만 한다.
  const source = readFileSync(
    fileURLToPath(new URL('../src/core/parser/type-notation.js', import.meta.url)),
    'utf8',
  );
  assert.doesNotMatch(source, /^\s*import\s/m, 'import 문이 있다');
  assert.doesNotMatch(source, /\brequire\s*\(/, 'require 호출이 있다');
});
