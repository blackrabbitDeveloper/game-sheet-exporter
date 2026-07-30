// IR → C# 집계 로더.
//
// 사양: docs/spec.md §6.3
//
// 이 클래스만이 "이 워크북이 게임 데이터 전부다" 를 전제하므로 기본으로 내보내지
// 않는다. 조회와 역직렬화는 GameDataRuntime.cs 가 하고, 여기는 테이블을 모아 들고
// 다니는 편의 클래스다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { emitCSharpLoader } from '../src/core/emit/csharp/loader.js';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { buildWorkbook } from './fixtures/build.mjs';
import { assertGolden } from './support/golden.mjs';
import { cleanIr } from './support/ir.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

const loaderText = (sheets, options) => emitCSharpLoader(cleanIr(sheets), options)[0].text;

const TWO_SHEETS = {
  Monster: [['id', 'hp'], ['int', 'int'], ['고유ID', '체력'], ['1001', '30']],
  Item: [['id'], ['int'], ['고유ID'], ['2001']],
};

// ── 구조 (spec.md §6.3) ──────────────────────────────────────────────

test('파일 하나를 낸다', () => {
  const files = emitCSharpLoader(cleanIr(TWO_SHEETS));

  assert.equal(files.length, 1);
  assert.equal(files[0].fileName, 'GameDataTables.cs');
});

test('시트마다 제네릭 테이블 프로퍼티를 낸다', () => {
  const text = loaderText(TWO_SHEETS);

  assert.match(text, /public GameDataTable<Monster, int> MonsterTable \{ get; \}/);
  assert.match(text, /public GameDataTable<Item, int> ItemTable \{ get; \}/);
});

test('조회와 역직렬화를 직접 하지 않는다', () => {
  // GameDataRuntime.cs 가 한다. 여기서 또 하면 두 곳이 갈라진다.
  const text = loaderText(TWO_SHEETS);

  assert.doesNotMatch(text, /Dictionary</, '인덱스를 직접 만들지 않는다');
  assert.doesNotMatch(text, /JsonConvert/, '역직렬화를 직접 하지 않는다');
  assert.doesNotMatch(text, /class RowsWrapper/, 'rows 래퍼를 다시 내지 않는다');
});

test('Load 는 런타임의 Load 에 위임한다', () => {
  const text = loaderText(TWO_SHEETS);

  assert.match(text, /public static GameDataTables Load\(Func<string, string> readJson\)/);
  assert.match(text, /GameDataTable<Monster, int>\.Load\(readJson\)/);
  assert.match(text, /GameDataTable<Item, int>\.Load\(readJson\)/);
});

test('readJson 이 null 이면 즉시 알린다', () => {
  assert.match(loaderText(TWO_SHEETS), /throw new ArgumentNullException\(nameof\(readJson\)\)/);
});

test('기본키 타입을 두 번째 타입 인자로 쓴다', () => {
  const text = loaderText({
    Monster: [['code', 'hp'], ['string', 'int'], ['', ''], ['A', '30']],
  });

  assert.match(text, /GameDataTable<Monster, string> MonsterTable/);
});

test('enum 기본키도 타입 인자가 된다', () => {
  const text = loaderText({
    Monster: [['grade'], ['enum:Grade'], [''], ['Normal']],
    'enum.Grade': [['name', 'value'], ['string', 'int?'], ['', ''], ['Normal', '0']],
  });

  assert.match(text, /GameDataTable<Monster, Grade> MonsterTable/);
});

test('기본키가 배열이면 목록으로만 노출한다', () => {
  // IGameData 를 붙일 수 없으니 GameDataTable 의 제약을 만족하지 못한다 (spec §6.3).
  const text = loaderText({
    Loot: [['ids', 'hp'], ['int[]', 'int'], ['', ''], ['1,2', '30']],
  });

  assert.match(text, /public IReadOnlyList<Loot> LootTable \{ get; \}/);
  assert.match(text, /GameDataJson\.ReadRows<Loot>\(readJson\)/);
  assert.doesNotMatch(text, /GameDataTable<Loot/);
});

test('한글 클래스명에도 규칙이 그대로 적용된다', () => {
  const text = loaderText({
    '몬스터 정보': [['고유 ID', 'hp'], ['int', 'int'], ['', ''], ['1001', '30']],
  });

  assert.match(text, /public GameDataTable<몬스터정보, int> 몬스터정보Table \{ get; \}/);
});

// ── using (spec.md §6.3) ─────────────────────────────────────────────

test('쓰지 않는 using 을 남기지 않는다', () => {
  const text = loaderText(TWO_SHEETS);

  assert.match(text, /^using System;$/m, 'Func 와 ArgumentNullException 에 필요하다');
  // 역직렬화는 런타임이 하므로 Newtonsoft 가 필요 없다.
  assert.doesNotMatch(text, /Newtonsoft/);
  // 모든 시트가 인덱스를 만들 수 있으면 IReadOnlyList 도 List 도 나오지 않는다.
  assert.doesNotMatch(text, /System\.Collections\.Generic/);
});

test('배열 기본키가 있으면 컬렉션 using 을 낸다', () => {
  const text = loaderText({ Loot: [['ids'], ['int[]'], [''], ['1,2']] });
  assert.match(text, /^using System\.Collections\.Generic;$/m);
});

// ── 옵션 ─────────────────────────────────────────────────────────────

test('네임스페이스와 클래스명을 바꾼다', () => {
  const text = loaderText(TWO_SHEETS, { namespace: 'My.Game', loaderClassName: 'Tables' });

  assert.match(text, /namespace My\.Game/);
  assert.match(text, /public sealed class Tables/);
  assert.match(text, /public static Tables Load/);
  assert.doesNotMatch(text, /GameDataTables/);
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('데이터 시트가 없어도 로더는 난다', () => {
  const text = emitCSharpLoader({ sheets: [], enums: [] })[0].text;

  assert.match(text, /public sealed class GameDataTables/);
  assert.match(text, /public static GameDataTables Load/);
});

// ── 결정성 (spec.md §8) ──────────────────────────────────────────────

test('줄바꿈은 LF 이고 파일 끝에 개행이 있다', () => {
  const text = loaderText(TWO_SHEETS);

  assert.doesNotMatch(text, /\r/);
  assert.ok(text.endsWith('\n'));
  assert.doesNotMatch(text, /\n\n$/);
});

test('출력에 현재 날짜가 섞이지 않는다', () => {
  const year = String(new Date().getFullYear());
  assert.equal(loaderText(TWO_SHEETS).includes(year), false, `${year} 가 섞였다`);
});

test('두 번 내보내면 바이트가 같다', () => {
  assert.equal(loaderText(TWO_SHEETS), loaderText(TWO_SHEETS));
});

// ── 골든 ─────────────────────────────────────────────────────────────

test('basic 픽스처가 골든 로더와 일치한다', () => {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  const { ir } = buildIR(readWorkbook(bytes, { fileName: 'basic.xlsx' }));

  assertGolden('basic.GameDataTables.cs', emitCSharpLoader(ir)[0].text);
});
