// IR → 시트별 CSV.
//
// 사양: docs/spec.md §6.2
//
// CSV 는 차이 확인과 다른 도구 연동용이다. 그래서 이 도구가 다시 읽을 수 있어야
// 한다 — 왕복이 깨지는 인코딩은 쓰지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { emitCsv } from '../src/core/emit/csv.js';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { buildWorkbook } from './fixtures/build.mjs';
import { assertGolden } from './support/golden.mjs';
import { cleanIr } from './support/ir.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

const lines = (sheets, options) => emitCsv(cleanIr(sheets), options)[0].text.split('\n');

// ── 기본 형태 ────────────────────────────────────────────────────────

test('헤더 한 줄과 데이터 행을 낸다', () => {
  assert.deepEqual(
    lines({
      Monster: [
        ['id', 'name', 'hp'],
        ['int', 'loc', 'int'],
        ['고유ID', '이름', '체력'],
        ['1001', 'MON_SLIME', '30'],
        ['1002', 'MON_GOBLIN', '40'],
      ],
    }),
    ['id,name,hp', '1001,MON_SLIME,30', '1002,MON_GOBLIN,40', ''],
  );
});

test('파일명은 클래스명에서 오고 enum 시트는 빠진다', () => {
  const files = emitCsv(
    cleanIr({
      '몬스터 정보': [['id'], ['int'], ['고유ID'], ['1001']],
      'enum.Grade': [['name'], ['string'], ['이름'], ['Normal']],
    }),
  );
  assert.deepEqual(files.map((file) => file.fileName), ['몬스터정보.csv']);
});

test('헤더는 변환된 식별자를 쓴다', () => {
  assert.equal(
    lines({
      Monster: [['몬스터 이름', '2nd'], ['string', 'int'], ['', ''], ['슬라임', '7']],
    })[0],
    '몬스터_이름,_2nd',
  );
});

test('데이터 행이 없어도 헤더는 낸다', () => {
  assert.deepEqual(lines({ Monster: [['id', 'hp'], ['int', 'int'], ['', '']] }), ['id,hp', '']);
});

test('열 순서는 시트 열 순서다', () => {
  assert.equal(
    lines({
      Stat: [['name', '1', '2'], ['string', 'int', 'int'], ['', '', ''], ['HP', '10', '20']],
    })[0],
    'name,_1,_2',
  );
});

// ── 값 표현 ──────────────────────────────────────────────────────────

test('빈 값은 빈 칸이다', () => {
  assert.deepEqual(
    lines({ Monster: [['id', 'memo'], ['int', 'string?'], ['', ''], ['1001', '']] }),
    ['id,memo', '1001,', ''],
  );
});

test('bool 은 TRUE·FALSE 로 낸다', () => {
  // 엑셀이 내놓는 표기이자 notation.md §3.1 이 받는 표기다. 왕복이 된다.
  assert.deepEqual(
    lines({
      Monster: [['id', 'alive'], ['int', 'bool'], ['', ''], ['1001', 'O'], ['1002', 'X']],
    }),
    ['id,alive', '1001,TRUE', '1002,FALSE', ''],
  );
});

test('datetime 은 UTC ISO 8601 문자열이다', () => {
  assert.deepEqual(
    lines({ Monster: [['id', 'at'], ['int', 'datetime'], ['', ''], ['1001', '46232']] })[1],
    '1001,2026-07-29T00:00:00.000Z',
  );
});

test('enum 은 멤버 이름이다', () => {
  assert.equal(
    lines({
      Monster: [['id', 'grade'], ['int', 'enum:Grade'], ['', ''], ['1001', 'Rare']],
      'enum.Grade': [['name', 'value'], ['string', 'int?'], ['', ''], ['Normal', '0'], ['Rare', '10']],
    })[1],
    '1001,Rare',
  );
});

// ── 이스케이프 (spec.md §6.2) ────────────────────────────────────────

test('배열은 구분자로 잇고 필드 전체를 큰따옴표로 감싼다', () => {
  assert.equal(
    lines({
      Monster: [['id', 'drop_ids'], ['int', 'int[]'], ['', ''], ['1001', '2001,2002']],
    })[1],
    '1001,"2001,2002"',
  );
});

test('빈 배열은 빈 칸이다', () => {
  assert.equal(
    lines({ Monster: [['id', 'tags'], ['int', 'string[]'], ['', ''], ['1001', '']] })[1],
    '1001,',
  );
});

test('쉼표·큰따옴표·줄바꿈이 든 문자열을 감싼다', () => {
  const [, comma, quote] = lines({
    Monster: [
      ['id', 'memo'],
      ['int', 'string'],
      ['', ''],
      ['1001', '가, 나'],
      ['1002', '따옴표 " 하나'],
    ],
  });
  assert.equal(comma, '1001,"가, 나"');
  assert.equal(quote, '1002,"따옴표 "" 하나"');
});

test('구분자가 든 배열 원소는 원소 단위로도 감싼다', () => {
  // 이렇게 해야 이 도구가 다시 읽을 때 원소 경계가 살아난다 (notation.md §5.3).
  assert.equal(
    lines({
      Monster: [['id', 'tags'], ['int', 'string[]'], ['', ''], ['1001', '"a,b",c']],
    })[1],
    '1001,"""a,b"",c"',
  );
});

test('구분자를 바꾸면 배열도 그 구분자로 잇는다', () => {
  // §6.2 는 쉼표로 적었지만, 구분자를 바꾼 시트를 쉼표로 내보내면 다시 읽을 때
  // 원소가 갈라진다.
  const ir = cleanIr(
    { Monster: [['id', 'tags'], ['int', 'string[]'], ['', ''], ['1001', 'a;b']] },
    { arrayDelimiter: ';' },
  );
  assert.equal(emitCsv(ir, { arrayDelimiter: ';' })[0].text.split('\n')[1], '1001,"a;b"');
});

test('출력 구분자를 시트 구분자와 다르게 두면 원소가 감싸진다', () => {
  // 설정이 어긋나도 값이 조용히 갈라지지는 않는다.
  const ir = cleanIr({ Monster: [['id', 'tags'], ['int', 'string[]'], ['', ''], ['1001', 'a,b']] });
  assert.equal(emitCsv(ir, { arrayDelimiter: ';' })[0].text.split('\n')[1], '1001,"a;b"');
});

// ── 형식 (spec.md §6.2) ──────────────────────────────────────────────

test('줄바꿈은 LF 이고 BOM 이 없다', () => {
  const [file] = emitCsv(cleanIr({ Monster: [['id'], ['int'], [''], ['1001']] }));
  assert.equal(file.text.includes('\r'), false);
  assert.equal(file.text.charCodeAt(0) === 0xfeff, false);
  assert.equal(file.text.endsWith('\n'), true);
});

test('무시 열은 나오지 않는다', () => {
  assert.equal(
    lines({ Monster: [['id', '#계산용'], ['int', ''], ['', ''], ['1001', '임시']] })[0],
    'id',
  );
});

// ── 이스케이프 왕복 ──────────────────────────────────────────────────

test('표준 CSV 파서로 다시 읽으면 원래 셀이 그대로 나온다', () => {
  // 이 CSV 를 그대로 이 도구에 다시 넣을 수는 없다 — 타입 행이 없다 (§6.2).
  // 확인할 것은 이스케이프다: 셀 경계가 살아나고, 배열 셀의 문자열이
  // value-parser 가 받는 형태(notation.md §5.3)로 남아야 한다.
  const [file] = emitCsv(
    cleanIr({
      Monster: [
        ['id', 'name', 'hp', 'tags'],
        ['int', 'string', 'int', 'string[]'],
        ['고유ID', '이름', '체력', '태그'],
        ['1001', '가, 나', '30', '"a,b",c'],
      ],
    }),
  );

  const { sheets } = readWorkbook(file.text, { fileName: file.fileName });
  assert.deepEqual(sheets[0].rows, [
    ['id', 'name', 'hp', 'tags'],
    ['1001', '가, 나', '30', '"a,b",c'],
  ]);
});

// ── 골든 (spec.md §8) ────────────────────────────────────────────────

function basicIr() {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  return buildIR(readWorkbook(bytes, { fileName: 'basic.xlsx' })).ir;
}

test('basic 픽스처가 골든 CSV 와 일치한다', () => {
  for (const file of emitCsv(basicIr())) {
    assertGolden(`basic.${file.fileName}`, file.text);
  }
});

test('두 번 내보내면 바이트가 같다', () => {
  assert.deepEqual(emitCsv(basicIr()), emitCsv(basicIr()));
});
