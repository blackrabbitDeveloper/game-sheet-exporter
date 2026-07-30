// IR → C# 런타임 (GameDataRuntime.cs)
//
// 사양: docs/spec.md §6.3
//
// 이 파일의 핵심 성질은 "시트를 모른다" 다. 워크북이 무엇이든 같은 바이트가 나와야
// 두 워크북을 차례로 내보내도 덮어쓰기 사고가 없다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emitCSharpRuntime } from '../src/core/emit/csharp/runtime.js';
import { cleanIr } from './support/ir.mjs';
import { assertGolden } from './support/golden.mjs';

const MONSTER = {
  Monster: [
    ['id', 'hp'],
    ['int', 'int'],
    ['고유ID', '체력'],
    ['1001', '30'],
  ],
};

const QUEST = {
  Quest: [
    ['code', 'title'],
    ['string', 'loc'],
    ['코드', '제목'],
    ['Q1', 'QUEST_ONE'],
  ],
};

const emit = (sheets, options) => emitCSharpRuntime(cleanIr(sheets), options)[0];

test('파일 하나를 낸다', () => {
  const files = emitCSharpRuntime(cleanIr(MONSTER));

  assert.equal(files.length, 1);
  assert.equal(files[0].fileName, 'GameDataRuntime.cs');
});

test('워크북이 달라도 바이트가 같다', () => {
  // 이 성질이 이 파일의 존재 이유다. 시트 목록을 담으면 두 번째 내보내기가
  // 첫 번째를 덮는다 (spec §6.3).
  assert.equal(emit(MONSTER).text, emit(QUEST).text);
});

test('시트가 없어도 같은 바이트가 나온다', () => {
  assert.equal(emitCSharpRuntime({ sheets: [], enums: [] })[0].text, emit(MONSTER).text);
});

test('네임스페이스만 바뀐다', () => {
  const text = emit(MONSTER, { namespace: 'My.Game' }).text;

  assert.match(text, /namespace My\.Game/);
  assert.equal(text, emit(MONSTER).text.replace('namespace GameData', 'namespace My.Game'));
});

test('IGameData 인터페이스를 낸다', () => {
  const text = emit(MONSTER).text;

  assert.match(text, /public interface IGameData<TKey>/);
  assert.match(text, /TKey Key \{ get; \}/);
});

test('제네릭 테이블과 제약을 낸다', () => {
  const text = emit(MONSTER).text;

  assert.match(text, /public sealed class GameDataTable<T, TKey> where T : IGameData<TKey>/);
  assert.match(text, /public IReadOnlyList<T> Rows \{ get; \}/);
  assert.match(text, /public T Get\(TKey key\)/);
  assert.match(text, /public bool TryGet\(TKey key, out T value\)/);
});

test('테이블 이름을 typeof(T).Name 으로 얻는다', () => {
  // §6.4 가 "클래스명 = JSON 파일명" 을 보장하므로 인자도 어트리뷰트도 필요 없다.
  assert.match(emit(MONSTER).text, /typeof\(T\)\.Name/);
});

test('Load 는 테이블 이름을 받는 함수를 인자로 받는다', () => {
  const text = emit(MONSTER).text;

  assert.match(text, /public static GameDataTable<T, TKey> Load\(Func<string, string> readJson\)/);
  assert.match(text, /throw new ArgumentNullException\(nameof\(readJson\)\)/);
});

test('기본키가 배열인 시트를 위한 읽기 경로를 함께 낸다', () => {
  // 그런 시트는 IGameData 를 붙일 수 없어 GameDataTable 을 쓸 수 없다.
  const text = emit(MONSTER).text;

  assert.match(text, /public static class GameDataJson/);
  assert.match(text, /public static List<T> ReadRows<T>\(Func<string, string> readJson\)/);
});

test('rows 래퍼를 풀어낼 타입을 낸다', () => {
  // 사양 §6.1 이 최상위를 { "rows": [...] } 로 감쌌다.
  const text = emit(MONSTER).text;

  assert.match(text, /class RowsWrapper<TRow>/);
  assert.match(text, /public List<TRow> rows;/);
});

test('필요한 using 을 낸다', () => {
  const text = emit(MONSTER).text;

  assert.match(text, /^using System;$/m);
  assert.match(text, /^using System\.Collections\.Generic;$/m);
  // §11.1 이 확정한 Newtonsoft 전제.
  assert.match(text, /^using Newtonsoft\.Json;$/m);
});

test('줄바꿈은 LF 이고 파일 끝에 개행이 있다', () => {
  const text = emit(MONSTER).text;

  assert.doesNotMatch(text, /\r/);
  assert.ok(text.endsWith('\n'));
  assert.doesNotMatch(text, /\n\n$/);
});

test('출력에 현재 날짜가 섞이지 않는다', () => {
  // 사양 §8 — 타임스탬프는 옵션으로 주입한다.
  const text = emit(MONSTER).text;
  const year = String(new Date().getFullYear());

  assert.equal(text.includes(year), false, `${year} 가 섞였다`);
});

test('골든과 일치한다', () => {
  assertGolden('GameDataRuntime.cs', emit(MONSTER).text);
});

// ── CSV 읽기 (spec.md §6.2) ──────────────────────────────────────────

test('CSV 읽기는 기본으로 들어가지 않는다', () => {
  // JSON 만 쓰는 프로젝트에 쓰지 않는 파서를 넣지 않는다.
  const text = emit(MONSTER).text;

  assert.doesNotMatch(text, /GameDataCsv/);
  assert.doesNotMatch(text, /GameDataParse/);
  assert.doesNotMatch(text, /ICsvReadable/);
});

const csv = (sheets = MONSTER) => emit(sheets, { csv: true }).text;

test('켜면 CSV 읽기가 들어간다', () => {
  const text = csv();

  assert.match(text, /public interface ICsvReadable/);
  assert.match(text, /void ReadCsvRow\(GameDataCsvRow row\)/);
  assert.match(text, /public static class GameDataCsv/);
  assert.match(text, /public static class GameDataParse/);
  assert.match(text, /public sealed class GameDataCsvRow/);
});

test('CSV 를 켜도 워크북이 달라도 바이트가 같다', () => {
  assert.equal(csv(MONSTER), csv(QUEST));
});

test('행 접근자 열 가지를 낸다', () => {
  // csv-read.js 가 내는 표현식이 이것들을 부른다. 하나라도 빠지면 컴파일되지 않는다.
  const text = csv();

  for (const signature of [
    'public T Value<T>(string column, Func<string, T> parse)',
    'public T? ValueOrNull<T>(string column, Func<string, T> parse)',
    'public string Text(string column)',
    'public string TextOrNull(string column)',
    'public List<T> ValueList<T>(string column, Func<string, T> parse, string delimiter)',
    'public List<T> ValueListOrNull<T>(string column, Func<string, T> parse, string delimiter)',
    'public List<T?> NullableList<T>(string column, Func<string, T> parse, string delimiter)',
    'public List<T?> NullableListOrNull<T>(string column, Func<string, T> parse, string delimiter)',
    'public List<string> TextList(string column, string delimiter)',
    'public List<string> TextListOrNull(string column, string delimiter)',
  ]) {
    assert.ok(text.includes(signature), `없다: ${signature}`);
  }
});

test('스칼라 파서 일곱 가지를 낸다', () => {
  const text = csv();

  for (const signature of [
    'public static int Int(string text)',
    'public static long Long(string text)',
    'public static float Float(string text)',
    'public static double Double(string text)',
    'public static bool Bool(string text)',
    'public static DateTime Date(string text)',
    'public static TEnum Enum<TEnum>(string text)',
  ]) {
    assert.ok(text.includes(signature), `없다: ${signature}`);
  }
});

test('숫자 파싱에 InvariantCulture 를 쓴다', () => {
  // 한국어 Windows 는 소수점이 쉼표인 로케일이 아니지만, 유럽 로케일에서 1.5 가
  // 15 로 읽히는 것을 막아야 한다. 결정성은 출력만의 문제가 아니다.
  const text = csv();

  assert.match(text, /CultureInfo\.InvariantCulture/);
  assert.match(text, /^using System\.Globalization;$/m);
});

test('bool 은 시트 표기를 모두 받는다', () => {
  // notation §3.1 — TRUE true 1 Y O ↔ FALSE false 0 N X. CSV 에는 TRUE/FALSE 가
  // 들어가지만 사람이 손으로 고친 파일도 읽혀야 한다.
  const text = csv();

  for (const token of ['"TRUE"', '"Y"', '"O"', '"FALSE"', '"N"', '"X"']) {
    assert.ok(text.includes(token), `${token} 을 받지 않는다`);
  }
});

test('빈 셀 규칙을 타입별로 지킨다', () => {
  // notation §5.2 — 필수 값이 비면 오류, nullable 은 null, T[] 는 빈 목록.
  const text = csv();

  assert.ok(text.includes('public T Value<T>('), '필수 값은 제네릭으로 받는다');
  assert.ok(text.includes('필수 값이 비었습니다'), '빈 필수 값이 조용히 통과한다');
  assert.ok(text.includes('return cell == null ? (T?)null : parse(cell);'), 'T? 가 null 이 안 된다');
  assert.ok(text.includes('if (cell == null) return found;'), 'T[] 의 빈 셀이 빈 목록이 안 된다');
  assert.ok(
    text.includes('return Raw(column) == null ? null : ValueList(column, parse, delimiter);'),
    'T[]? 의 빈 셀이 null 이 안 된다',
  );
});

test('원소 인용을 풀어낸다', () => {
  // notation §5.3 — 원소가 구분자나 큰따옴표를 담으면 원소 단위로 인용된다.
  // CSV 에미터의 encodeElement 와 같은 규칙을 C# 에서 되돌려야 한다.
  const text = csv();

  assert.match(text, /SplitElements/);
});

test('CSV 를 켜도 JSON 경로가 남는다', () => {
  // 두 형식을 함께 쓸 수 있어야 한다.
  const text = csv();

  assert.match(text, /GameDataJson/);
  assert.match(text, /GameDataTable<T, TKey>/);
});

test('CSV 골든과 일치한다', () => {
  assertGolden('GameDataRuntime.csv.cs', csv());
});

// ── 사용법 머리말 (spec.md §6.3) ─────────────────────────────────────

test('머리말에 호출부 예시를 단다', () => {
  // 이 파일은 무엇이 있는지는 보여주지만 무엇을 써야 하는지는 안 보여준다.
  const text = emit(MONSTER).text;

  assert.match(text, /^\/\/ 사용법$/m);
  assert.match(text, /GameDataTable<Monster, int>\.Load\(read\)/);
  assert.match(text, /table\.Get\(1001\)/);
  assert.match(text, /foreach \(var row in table\.Rows\)/);
});

test('예시가 고정 이름을 써서 워크북 무관 성질이 유지된다', () => {
  // 실제 시트명을 쓰면 워크북마다 파일이 달라져 덮어쓰기 문제가 되살아난다.
  assert.equal(emit(MONSTER).text, emit(QUEST).text);
  assert.equal(csv(MONSTER), csv(QUEST));
});

test('CSV 를 켜면 CSV 호출부도 보여준다', () => {
  const text = csv();

  assert.match(text, /GameDataCsv\.ReadRows<Monster>\(read\)/);
  assert.match(text, /new GameDataTable<Monster, int>\(rows\)/);
});

test('예시는 주석이라 컴파일에 영향이 없다', () => {
  const text = emit(MONSTER).text;
  const header = text.slice(0, text.indexOf('using System;'));

  for (const line of header.split('\n').filter((item) => item.trim() !== '')) {
    assert.match(line, /^\/\//, `주석이 아닌 줄이 있다: ${line}`);
  }
});
