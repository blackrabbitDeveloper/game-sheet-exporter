// 픽스처 생성기 자체의 계약을 고정한다.
// 사양(docs/spec.md)이 없어도 검증 가능한 범위만 다룬다: 시트 순서, 셀 값 왕복, 결정성.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { buildWorkbook } from './fixtures/build.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

function toBuffer(workbook) {
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function readBack(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = {};
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true });
  }
  return { order: workbook.SheetNames, sheets };
}

test('시트 순서는 정의 파일의 키 순서를 따른다', () => {
  const workbook = buildWorkbook({ Zebra: [['a']], Apple: [['b']], Monster: [['c']] });
  assert.deepEqual(readBack(toBuffer(workbook)).order, ['Zebra', 'Apple', 'Monster']);
});

test('셀 값이 그대로 왕복한다', () => {
  const definition = {
    Monster: [
      ['id', 'name', 'hp'],
      ['int', 'loc', 'int'],
      [1001, 'MON_SLIME', 30],
    ],
  };
  assert.deepEqual(readBack(toBuffer(buildWorkbook(definition))).sheets.Monster, definition.Monster);
});

test('같은 정의는 같은 바이트를 낸다', () => {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const first = toBuffer(buildWorkbook(definition));
  const second = toBuffer(buildWorkbook(structuredClone(definition)));
  assert.ok(first.equals(second), '픽스처 생성이 결정적이지 않다');
});

test('basic 정의의 모든 시트가 같은 헤더 행 수를 갖는다', () => {
  // 헤더 행 구성은 설정값이므로 워크북 하나 안에서는 일관되어야 한다.
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const dataStart = 3; // 필드명 / 타입 / 주석
  for (const [sheet, rows] of Object.entries(definition)) {
    assert.ok(rows.length > dataStart, `${sheet}: 헤더 ${dataStart}행 뒤에 데이터 행이 없다`);
    const width = rows[0].length;
    for (const [index, row] of rows.entries()) {
      assert.equal(row.length, width, `${sheet}: ${index + 1}행의 열 수가 헤더와 다르다`);
    }
  }
});

test('잘못된 정의는 이유를 밝히며 거부한다', () => {
  assert.throws(() => buildWorkbook(null), /객체여야 한다/);
  assert.throws(() => buildWorkbook([['a']]), /객체여야 한다/);
  assert.throws(() => buildWorkbook({}), /시트가 하나도 없다/);
  assert.throws(() => buildWorkbook({ Monster: 'nope' }, { name: 'x.def.json' }), /x\.def\.json!Monster/);
  assert.throws(() => buildWorkbook({ Monster: ['nope'] }), /배열의 배열/);
});
