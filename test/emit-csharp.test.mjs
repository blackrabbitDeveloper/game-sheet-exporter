// IR → C# enum · 데이터 클래스.
//
// 사양: docs/spec.md §6.3
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { emitCSharpClasses } from '../src/core/emit/csharp/class.js';
import { emitCSharpEnums } from '../src/core/emit/csharp/enum.js';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { buildWorkbook } from './fixtures/build.mjs';
import { assertGolden } from './support/golden.mjs';
import { cleanIr } from './support/ir.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

const enumText = (sheets, options) => emitCSharpEnums(cleanIr(sheets), options)[0].text;
const classText = (sheets, options) => emitCSharpClasses(cleanIr(sheets), options)[0].text;

const GRADE = {
  'enum.Grade': [
    ['name', 'value', 'comment'],
    ['string', 'int?', 'string?'],
    ['이름', '값', '설명'],
    ['Normal', '0', '일반'],
    ['Rare', '10', '희귀'],
    ['Unique', '', '유니크'],
  ],
};

// ── enum (spec.md §6.3) ──────────────────────────────────────────────

test('사양의 enum 형태 그대로 낸다', () => {
  assert.equal(
    enumText(GRADE),
    [
      'namespace GameData',
      '{',
      '    public enum Grade',
      '    {',
      '        /// <summary>일반</summary>',
      '        Normal = 0,',
      '        /// <summary>희귀</summary>',
      '        Rare = 10,',
      '        /// <summary>유니크</summary>',
      '        Unique = 11,',
      '    }',
      '}',
      '',
    ].join('\n'),
  );
});

test('생략된 값도 계산된 숫자로 명시한다', () => {
  // 값을 명시해 두어야 멤버를 중간에 추가해도 저장된 세이브 데이터가 안 밀린다.
  assert.match(enumText(GRADE), /Unique = 11,/);
});

test('주석 없는 멤버는 문서 주석을 붙이지 않는다', () => {
  const text = enumText({ 'enum.Grade': [['name'], ['string'], [''], ['Normal']] });
  assert.equal(text.includes('<summary>'), false);
  assert.match(text, /^ {8}Normal = 0,$/m);
});

test('파일명은 클래스명에서 온다', () => {
  const files = emitCSharpEnums(cleanIr({ 'enum.grade': [['name'], ['string'], [''], ['A']] }));
  assert.deepEqual(files.map((file) => file.fileName), ['Grade.cs']);
});

test('멤버가 없어도 enum 은 난다', () => {
  assert.match(enumText({ 'enum.Grade': [['name'], ['string'], ['']] }), /public enum Grade\n {4}\{\n {4}\}/);
});

// ── 데이터 클래스 (spec.md §6.3) ─────────────────────────────────────

const MONSTER = {
  Monster: [
    ['id', 'name', 'hp', 'grade', 'drop_ids'],
    ['int', 'loc', 'int', 'enum:Grade', 'ref:Item.id[]'],
    ['고유ID', '이름', '체력', '등급', '드랍'],
    ['1001', 'MON_SLIME', '30', 'Normal', '2001'],
  ],
  Item: [['id'], ['int'], ['고유ID'], ['2001']],
  ...GRADE,
};

test('사양의 데이터 클래스 형태 그대로 낸다', () => {
  assert.equal(
    classText(MONSTER),
    [
      'using System;',
      'using System.Collections.Generic;',
      '',
      'namespace GameData',
      '{',
      '    /// <summary>Monster 시트의 한 행입니다.</summary>',
      '    [Serializable]',
      '    public sealed class Monster',
      '    {',
      '        /// <summary>고유ID</summary>',
      '        public int id;',
      '',
      '        /// <summary>이름 (로컬라이즈 키)</summary>',
      '        public string name;',
      '',
      '        /// <summary>체력</summary>',
      '        public int hp;',
      '',
      '        /// <summary>등급</summary>',
      '        public Grade grade;',
      '',
      '        /// <summary>드랍 (→ Item.id)</summary>',
      '        public List<int> drop_ids;',
      '    }',
      '}',
      '',
    ].join('\n'),
  );
});

test('List 를 쓰지 않으면 컬렉션 using 을 넣지 않는다', () => {
  const text = classText({ Item: [['id'], ['int'], ['고유ID'], ['2001']] });
  assert.equal(text.includes('System.Collections.Generic'), false);
  assert.match(text, /^using System;\n\nnamespace/);
});

test('주석이 없으면 문서 주석 줄을 넣지 않는다', () => {
  const text = classText({ Monster: [['id'], ['int'], [''], ['1']] });
  assert.match(text, / {8}public int id;/);
  assert.equal(text.includes('<summary>고유'), false);
});

test('주석이 없어도 loc·ref 표시는 남긴다', () => {
  const text = classText({
    Monster: [['id', 'name'], ['int', 'loc'], ['', ''], ['1', 'KEY']],
  });
  assert.match(text, /\/\/\/ <summary>로컬라이즈 키<\/summary>/);
});

test('필드명은 변환된 식별자를 쓰고 주석은 원본을 보존한다', () => {
  const text = classText({
    Monster: [['몬스터 이름'], ['string'], ['표시 이름'], ['슬라임']],
  });
  assert.match(text, /\/\/\/ <summary>표시 이름<\/summary>\n {8}public string 몬스터_이름;/);
});

test('클래스 요약은 원본 시트명을 쓴다', () => {
  // 생성 코드에서 원본 시트를 찾아갈 수 있어야 한다.
  const text = classText({ 'item-drop': [['id'], ['int'], [''], ['1']] });
  assert.match(text, /<summary>item-drop 시트의 한 행입니다\.<\/summary>/);
  assert.match(text, /public sealed class ItemDrop/);
});

test('데이터 행이 없어도 클래스는 난다', () => {
  assert.match(classText({ Monster: [['id'], ['int'], ['고유ID']] }), /public int id;/);
});

test('파일명은 클래스명에서 온다', () => {
  const files = emitCSharpClasses(
    cleanIr({ 'item-drop': [['id'], ['int'], [''], ['1']], Item: [['id'], ['int'], [''], ['2']] }),
  );
  assert.deepEqual(files.map((file) => file.fileName), ['ItemDrop.cs', 'Item.cs']);
});

// ── XML 문서 주석 이스케이프 ─────────────────────────────────────────

test('주석의 XML 특수문자를 이스케이프한다', () => {
  // 이스케이프하지 않으면 생성 파일이 컴파일 경고를 내고 문서가 깨진다.
  const text = classText({
    Monster: [['id'], ['int'], ['a < b & c > d "e"'], ['1']],
  });
  assert.match(text, /<summary>a &lt; b &amp; c &gt; d "e"<\/summary>/);
});

test('여러 줄 주석을 한 줄로 만든다', () => {
  const text = classText({ Monster: [['id'], ['int'], ['첫 줄\n둘째 줄'], ['1']] });
  assert.match(text, /<summary>첫 줄 둘째 줄<\/summary>/);
});

// ── 옵션 ─────────────────────────────────────────────────────────────

test('네임스페이스를 바꾼다', () => {
  assert.match(classText(MONSTER, { namespace: 'MyGame.Data' }), /^namespace MyGame\.Data$/m);
  assert.match(enumText(GRADE, { namespace: 'MyGame.Data' }), /^namespace MyGame\.Data$/m);
});

// ── 형식 (spec.md §8) ────────────────────────────────────────────────

test('줄바꿈은 LF 이고 파일 끝에 개행이 있다', () => {
  for (const text of [classText(MONSTER), enumText(GRADE)]) {
    assert.equal(text.includes('\r'), false);
    assert.equal(text.endsWith('\n'), true);
  }
});

test('출력에 현재 날짜가 섞이지 않는다', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(classText(MONSTER).includes(today), false);
  assert.equal(enumText(GRADE).includes(today), false);
});

// ── 골든 ─────────────────────────────────────────────────────────────

function basicIr() {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  return buildIR(readWorkbook(bytes, { fileName: 'basic.xlsx' })).ir;
}

test('basic 픽스처가 골든 .cs 와 일치한다', () => {
  const ir = basicIr();
  for (const file of [...emitCSharpEnums(ir), ...emitCSharpClasses(ir)]) {
    assertGolden(`basic.${file.fileName}`, file.text);
  }
});

test('두 번 내보내면 바이트가 같다', () => {
  const ir = basicIr();
  assert.deepEqual(emitCSharpEnums(ir), emitCSharpEnums(structuredClone(ir)));
  assert.deepEqual(emitCSharpClasses(ir), emitCSharpClasses(structuredClone(ir)));
});
