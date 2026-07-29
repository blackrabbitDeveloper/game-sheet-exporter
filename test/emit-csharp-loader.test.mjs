// IR → C# 로더.
//
// 사양: docs/spec.md §6.3
//
// Load 가 파일 읽기를 직접 하지 않고 함수를 받는 이유는, Resources·Addressables·
// StreamingAssets·테스트용 문자열 중 무엇을 쓸지는 프로젝트가 정할 일이기 때문이다.
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

test('시트마다 읽기 전용 테이블 프로퍼티를 낸다', () => {
  const text = loaderText(TWO_SHEETS);
  assert.match(text, / {8}public IReadOnlyList<Monster> MonsterTable \{ get; \}/);
  assert.match(text, / {8}public IReadOnlyList<Item> ItemTable \{ get; \}/);
});

test('기본키 조회 메서드 둘을 낸다', () => {
  const text = loaderText(TWO_SHEETS);
  assert.match(text, / {8}public Monster GetMonster\(int id\)/);
  assert.match(text, / {8}public bool TryGetMonster\(int id, out Monster value\)/);
});

test('Load 는 테이블 이름을 받는 함수를 인자로 받는다', () => {
  const text = loaderText(TWO_SHEETS);
  assert.match(text, / {8}public static GameDataTables Load\(Func<string, string> readJson\)/);
  assert.match(text, /ReadTable<Monster>\(readJson, "Monster"\)/);
  assert.match(text, /ReadTable<Item>\(readJson, "Item"\)/);
});

test('rows 래퍼를 풀어낼 내부 타입을 함께 낸다', () => {
  // JSON 최상위가 { "rows": [...] } 이므로 (§6.1) 받을 그릇이 필요하다.
  const text = loaderText(TWO_SHEETS);
  assert.match(text, /private sealed class Table<T>/);
  assert.match(text, / {12}public List<T> rows;/);
});

test('필요한 using 을 낸다', () => {
  const text = loaderText(TWO_SHEETS);
  assert.match(
    text,
    /^using System;\nusing System\.Collections\.Generic;\nusing Newtonsoft\.Json;\n\nnamespace/,
  );
});

test('조회 인덱스를 생성자에서 한 번 만든다', () => {
  const text = loaderText(TWO_SHEETS);
  assert.match(text, /private readonly Dictionary<int, Monster> _monsterById;/);
  assert.match(text, /foreach \(var row in monsterRows\) _monsterById\[row\.id\] = row;/);
});

// ── 기본키 (spec.md §3.4) ────────────────────────────────────────────

test('기본키 타입을 그대로 따른다', () => {
  const text = loaderText({
    Item: [['code', 'name'], ['string', 'string'], ['', ''], ['A', '포션']],
  });
  assert.match(text, /public Item GetItem\(string code\)/);
  assert.match(text, /Dictionary<string, Item>/);
});

test('기본키가 변환된 필드면 식별자로 접근한다', () => {
  const text = loaderText({
    Monster: [['고유 ID', 'hp'], ['int', 'int'], ['', ''], ['1', '2']],
  });
  assert.match(text, /_monsterById\[row\.고유_ID\] = row;/);
});

test('기본키가 배열이면 조회 인덱스를 만들지 않는다', () => {
  // Dictionary 의 키로 List<T> 를 쓸 수 없다.
  const text = loaderText({
    Monster: [['ids', 'hp'], ['int[]', 'int'], ['', ''], ['1,2', '30']],
  });
  assert.match(text, /public IReadOnlyList<Monster> MonsterTable \{ get; \}/);
  assert.equal(text.includes('GetMonster'), false);
  assert.equal(text.includes('Dictionary'), false);
});

// ── 한글 시트 ────────────────────────────────────────────────────────

test('한글 클래스명에도 규칙이 그대로 적용된다', () => {
  const text = loaderText({
    '몬스터 정보': [['id'], ['int'], ['고유ID'], ['1001']],
  });
  assert.match(text, /public IReadOnlyList<몬스터정보> 몬스터정보Table \{ get; \}/);
  assert.match(text, /public 몬스터정보 Get몬스터정보\(int id\)/);
});

// ── 경계 ─────────────────────────────────────────────────────────────

test('데이터 시트가 없어도 로더는 난다', () => {
  const text = loaderText({ 'enum.Grade': [['name'], ['string'], [''], ['Normal']] });
  assert.match(text, /public sealed class GameDataTables/);
  assert.match(text, /public static GameDataTables Load\(Func<string, string> readJson\)/);
});

test('readJson 이 null 이면 즉시 알린다', () => {
  assert.match(loaderText(TWO_SHEETS), /throw new ArgumentNullException\(nameof\(readJson\)\)/);
});

test('테이블이 비어 있어도 빈 목록을 낸다', () => {
  // 파일이 아직 없는 상태로 게임을 켜는 일이 흔하다. 여기서 죽으면 원인을 찾기 어렵다.
  assert.match(loaderText(TWO_SHEETS), /return table\?\.rows \?\? new List<T>\(\);/);
});

// ── 옵션 ─────────────────────────────────────────────────────────────

test('네임스페이스와 클래스명을 바꾼다', () => {
  const text = loaderText(TWO_SHEETS, { namespace: 'MyGame.Data', loaderClassName: 'Tables' });
  assert.match(text, /^namespace MyGame\.Data$/m);
  assert.match(text, /public sealed class Tables/);
  assert.match(text, /public static Tables Load/);
  assert.equal(emitCSharpLoader(cleanIr(TWO_SHEETS), { loaderClassName: 'Tables' })[0].fileName, 'Tables.cs');
});

// ── 형식과 결정성 ────────────────────────────────────────────────────

test('줄바꿈은 LF 이고 파일 끝에 개행이 있다', () => {
  const text = loaderText(TWO_SHEETS);
  assert.equal(text.includes('\r'), false);
  assert.equal(text.endsWith('\n'), true);
});

test('출력에 현재 날짜가 섞이지 않는다', () => {
  assert.equal(loaderText(TWO_SHEETS).includes(new Date().toISOString().slice(0, 10)), false);
});

// ── 골든 ─────────────────────────────────────────────────────────────

function basicIr() {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  return buildIR(readWorkbook(bytes, { fileName: 'basic.xlsx' })).ir;
}

test('basic 픽스처가 골든 로더와 일치한다', () => {
  const [file] = emitCSharpLoader(basicIr());
  assertGolden(`basic.${file.fileName}`, file.text);
});

test('두 번 내보내면 바이트가 같다', () => {
  const ir = basicIr();
  assert.deepEqual(emitCSharpLoader(ir), emitCSharpLoader(structuredClone(ir)));
});
