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
