// IR → 시트별 JSON.
//
// 사양: docs/spec.md §6.1, §8(결정성)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { emitJson } from '../src/core/emit/json.js';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { buildWorkbook } from './fixtures/build.mjs';
import { assertGolden } from './support/golden.mjs';
import { cleanIr } from './support/ir.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

/** 시트 하나짜리 IR 을 내보내고 텍스트만 돌려준다. */
function emitOne(sheets, options) {
  const files = emitJson(cleanIr(sheets), options);
  assert.equal(files.length, Object.keys(sheets).filter((name) => !name.startsWith('enum.')).length);
  return files[0].text;
}

// ── 사양 §6.1 의 예시 ────────────────────────────────────────────────

test('사양의 출력 형식 그대로 낸다', () => {
  const text = emitOne({
    Monster: [
      ['id', 'name', 'hp', 'grade', 'drop_ids'],
      ['int', 'loc', 'int', 'enum:Grade', 'ref:Item.id[]'],
      ['고유ID', '이름', '체력', '등급', '드랍'],
      ['1001', 'MON_SLIME', '30', 'Normal', '2001,2002'],
    ],
    Item: [['id'], ['int'], ['고유ID'], ['2001'], ['2002']],
    'enum.Grade': [['name'], ['string'], ['이름'], ['Normal']],
  });

  assert.equal(
    text,
    [
      '{',
      '  "rows": [',
      '    {',
      '      "id": 1001,',
      '      "name": "MON_SLIME",',
      '      "hp": 30,',
      '      "grade": "Normal",',
      '      "drop_ids": [2001, 2002]',
      '    }',
      '  ]',
      '}',
      '',
    ].join('\n'),
  );
});

test('파일명은 시트명에서 온다', () => {
  const files = emitJson(
    cleanIr({
      '몬스터 정보': [['id'], ['int'], ['고유ID'], ['1001']],
      Item: [['id'], ['int'], ['고유ID'], ['2001']],
    }),
  );
  assert.deepEqual(files.map((file) => file.fileName), ['몬스터 정보.json', 'Item.json']);
});

test('enum 정의 시트는 JSON 으로 내보내지 않는다', () => {
  // 런타임이 읽는 것은 데이터 시트뿐이다. enum 은 C# 코드로 나간다 (§6.3).
  const files = emitJson(
    cleanIr({
      Monster: [['id'], ['int'], ['고유ID'], ['1001']],
      'enum.Grade': [['name'], ['string'], ['이름'], ['Normal']],
    }),
  );
  assert.deepEqual(files.map((file) => file.fileName), ['Monster.json']);
});

// ── 키 순서 (spec.md §6.1) ───────────────────────────────────────────

test('키 순서는 시트 열 순서다', () => {
  const text = emitOne({
    Monster: [['zzz', 'aaa', 'mmm'], ['int', 'int', 'int'], ['', '', ''], ['1', '2', '3']],
  });
  assert.match(text, /"zzz": 1,\n\s+"aaa": 2,\n\s+"mmm": 3/, '알파벳 정렬하면 안 된다');
});

test('숫자로만 이뤄진 필드명도 열 순서를 지킨다', () => {
  // JSON.stringify 에 객체를 그대로 넘기면 JavaScript 가 숫자꼴 키를 앞으로
  // 당긴다. 레벨별 스탯처럼 1·2·3 열을 쓰는 시트에서 순서가 통째로 깨진다.
  const text = emitOne({
    Stat: [['name', '1', '2'], ['string', 'int', 'int'], ['', '', ''], ['HP', '10', '20']],
  });
  assert.deepEqual(text.split('\n').slice(2, 6), [
    '    {',
    '      "name": "HP",',
    '      "1": 10,',
    '      "2": 20',
  ]);
});

// ── 값 표현 ──────────────────────────────────────────────────────────

test('빈 값은 null 이고 키를 빼지 않는다', () => {
  // spec.md §11.1 확정: Newtonsoft 전제이므로 null 을 그대로 낸다.
  const text = emitOne({
    Monster: [['id', 'memo'], ['int', 'string?'], ['', ''], ['1001', '']],
  });
  assert.match(text, /"memo": null/);
});

test('enum 은 멤버 이름 문자열로 낸다', () => {
  const text = emitOne({
    Monster: [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['1001', 'Rare']],
    'enum.Grade': [
      ['name', 'value'],
      ['string', 'int?'],
      ['', ''],
      ['Normal', '0'],
      ['Rare', '10'],
    ],
  });
  assert.match(text, /"grade": "Rare"/, '정수 10 이 아니라 이름이다');
});

test('bool 과 datetime 을 낸다', () => {
  const text = emitOne({
    Monster: [
      ['id', 'alive', 'at'],
      ['int', 'bool', 'datetime'],
      ['', '', ''],
      ['1001', 'O', '46232'],
    ],
  });
  assert.match(text, /"alive": true/);
  assert.match(text, /"at": "2026-07-29T00:00:00.000Z"/);
});

test('문자열의 특수문자를 이스케이프한다', () => {
  const text = emitOne({
    Monster: [['id', 'memo'], ['int', 'string'], ['', ''], ['1001', '따옴표 " 와 역슬래시 \\']],
  });
  assert.match(text, /"memo": "따옴표 \\" 와 역슬래시 \\\\"/);
  assert.equal(JSON.parse(text).rows[0].memo, '따옴표 " 와 역슬래시 \\');
});

test('한글을 이스케이프하지 않는다', () => {
  const text = emitOne({
    Monster: [['id', 'memo'], ['int', 'string'], ['', ''], ['1001', '슬라임']],
  });
  assert.match(text, /"memo": "슬라임"/);
});

test('배열은 한 줄로 낸다', () => {
  const text = emitOne({
    Monster: [['id', 'tags'], ['int', 'string[]'], ['', ''], ['1001', 'a,b,c']],
  });
  assert.match(text, /"tags": \["a", "b", "c"\]/);
});

test('빈 배열은 대괄호 둘이다', () => {
  const text = emitOne({
    Monster: [['id', 'tags'], ['int', 'string[]'], ['', ''], ['1001', '']],
  });
  assert.match(text, /"tags": \[\]/);
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('데이터 행이 없어도 파일을 낸다', () => {
  const text = emitOne({ Monster: [['id'], ['int'], ['고유ID']] });
  assert.equal(text, '{\n  "rows": []\n}\n');
});

test('무시 열은 나오지 않는다', () => {
  const text = emitOne({
    Monster: [['id', '#계산용'], ['int', ''], ['', ''], ['1001', '임시']],
  });
  assert.equal(text.includes('계산용'), false);
  assert.equal(text.includes('임시'), false);
});

test('줄바꿈은 LF 이고 파일 끝에 개행이 있다', () => {
  const text = emitOne({ Monster: [['id'], ['int'], [''], ['1001']] });
  assert.equal(text.includes('\r'), false);
  assert.equal(text.endsWith('\n'), true);
});

// ── minify ───────────────────────────────────────────────────────────

test('minify 는 공백을 없앤다', () => {
  const text = emitOne(
    {
      Monster: [['id', 'tags'], ['int', 'string[]'], ['', ''], ['1001', 'a,b']],
    },
    { minify: true },
  );
  assert.equal(text, '{"rows":[{"id":1001,"tags":["a","b"]}]}\n');
});

test('minify 여부와 무관하게 같은 값을 낸다', () => {
  const sheets = {
    Monster: [['id', 'memo'], ['int', 'string?'], ['', ''], ['1001', '가']],
  };
  const pretty = JSON.parse(emitOne(sheets));
  const minified = JSON.parse(emitOne(sheets, { minify: true }));
  assert.deepEqual(pretty, minified);
});

// ── 골든 (spec.md §8) ────────────────────────────────────────────────

function basicIr() {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  return buildIR(readWorkbook(bytes, { fileName: 'basic.xlsx' })).ir;
}

test('basic 픽스처가 골든 JSON 과 일치한다', () => {
  for (const file of emitJson(basicIr())) {
    assertGolden(`basic.${file.fileName}`, file.text);
  }
});

test('두 번 내보내면 바이트가 같다', () => {
  const first = emitJson(basicIr());
  const second = emitJson(basicIr());
  assert.deepEqual(first, second);
});

test('출력에 현재 날짜가 섞이지 않는다', () => {
  const text = emitJson(basicIr()).map((file) => file.text).join('');
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(text.includes(today), false, '출력 경로에서 현재 시각을 읽으면 안 된다');
});
