// TypeNode → C# 타입.
//
// 사양: docs/notation.md §2.1, §3 · docs/spec.md §6.3
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCSharpType } from '../src/core/emit/csharp/types.js';
import { cleanIr } from './support/ir.mjs';

/** 시트 한 장의 필드 타입을 C# 표기로 뽑는다. */
function typesOf(sheets, sheetIndex = 0) {
  const ir = cleanIr(sheets);
  return ir.sheets[sheetIndex].fields.map((field) => toCSharpType(field.type, ir));
}

// ── 스칼라 (notation.md §3) ──────────────────────────────────────────

test('스칼라를 C# 타입으로 옮긴다', () => {
  assert.deepEqual(
    typesOf({
      T: [
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        ['int', 'long', 'float', 'double', 'bool', 'string', 'datetime'],
        ['', '', '', '', '', '', ''],
        ['1', '1', '1', '1', 'O', 'x', '46232'],
      ],
    }),
    ['int', 'long', 'float', 'double', 'bool', 'string', 'DateTime'],
  );
});

test('loc 은 string 이다', () => {
  assert.deepEqual(typesOf({ T: [['a'], ['loc'], [''], ['KEY']] }), ['string']);
});

// ── nullable (notation.md §2.1) ──────────────────────────────────────

test('값 타입에는 물음표를 붙인다', () => {
  assert.deepEqual(
    typesOf({
      T: [['a', 'b', 'c'], ['int?', 'bool?', 'datetime?'], ['', '', ''], ['', '', '']],
    }),
    ['int?', 'bool?', 'DateTime?'],
  );
});

test('참조 타입에는 물음표를 붙이지 않는다', () => {
  // string? 는 C# 8 의 nullable 참조 문맥을 요구한다. 생성 코드가 프로젝트의
  // 컴파일 설정에 의존하게 만들 이유가 없다.
  assert.deepEqual(
    typesOf({ T: [['a', 'b'], ['string?', 'loc?'], ['', ''], ['', '']] }),
    ['string', 'string'],
  );
});

// ── 배열 (notation.md §2.1) ──────────────────────────────────────────

test('배열은 List<T> 다', () => {
  assert.deepEqual(
    typesOf({ T: [['a', 'b'], ['int[]', 'string[]'], ['', ''], ['1', 'x']] }),
    ['List<int>', 'List<string>'],
  );
});

test('int[]? 와 int?[] 는 다르다', () => {
  assert.deepEqual(
    typesOf({ T: [['a', 'b'], ['int[]?', 'int?[]'], ['', ''], ['', '1']] }),
    ['List<int>', 'List<int?>'],
  );
});

// ── enum · ref ───────────────────────────────────────────────────────

test('enum 은 변환된 클래스명을 쓴다', () => {
  // 타입 표기의 식별자에는 공백·하이픈을 넣을 수 없으므로(notation.md §2),
  // enum 이름의 변환은 사실상 첫 글자 대문자화뿐이다.
  assert.deepEqual(
    typesOf({
      T: [['a', 'b'], ['enum:grade', 'enum:grade[]'], ['', ''], ['Normal', 'Normal']],
      'enum.grade': [['name'], ['string'], [''], ['Normal']],
    }),
    ['Grade', 'List<Grade>'],
  );
});

test('ref 는 대상 필드의 타입을 그대로 따른다', () => {
  assert.deepEqual(
    typesOf({
      Monster: [['id', 'drop', 'drops'], ['int', 'ref:Item.code', 'ref:Item.code[]'], ['', '', ''], ['1', 'A', 'A']],
      Item: [['id', 'code'], ['int', 'string'], ['', ''], ['2', 'A']],
    }),
    ['int', 'string', 'List<string>'],
  );
});

test('ref 대상이 없으면 string 으로 둔다', () => {
  // 값도 문자열로 남는다 (value-parser). E008 이 이미 내보내기를 막으므로
  // 여기서는 컴파일되는 무언가를 내면 된다.
  const ir = cleanIr({ Monster: [['id'], ['int'], [''], ['1']] });
  assert.equal(toCSharpType({ kind: 'ref', sheet: '없음', field: 'id' }, ir), 'string');
});

test('참조의 참조는 따라가지 않는다', () => {
  // 순환 참조가 허용되므로 끝까지 따라가면 멈추지 않는다 (notation.md §4.3).
  const ir = cleanIr({
    A: [['id', 'x'], ['int', 'ref:B.y'], ['', ''], ['1', '2']],
    B: [['id', 'y'], ['int', 'ref:A.id'], ['', ''], ['2', '1']],
  });
  assert.equal(toCSharpType(ir.sheets[0].fields[1].type, ir), 'string');
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('알 수 없는 타입은 string 으로 둔다', () => {
  const ir = cleanIr({ Monster: [['id'], ['int'], [''], ['1']] });
  assert.equal(toCSharpType({ kind: '없는종류' }, ir), 'string');
  assert.equal(toCSharpType(null, ir), 'string');
});
