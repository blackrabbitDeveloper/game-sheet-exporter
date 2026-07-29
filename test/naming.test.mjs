// 식별자 변환.
//
// 사양: docs/spec.md §6.4
//
// 변환이 두 곳에서 일어나면 JSON 키와 C# 필드명이 조용히 어긋나고, 증상은
// "런타임에 필드가 전부 기본값" 으로 나타나 원인을 찾기 어렵다. 이 파일 하나만 한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RESERVED_WORDS,
  isReservedWord,
  isUsableIdentifier,
  toClassName,
  toFieldIdentifier,
} from '../src/core/ir/naming.js';

// ── 필드명: 최소 변환 (spec.md §6.4) ─────────────────────────────────

test('쓸 수 있는 이름은 건드리지 않는다', () => {
  for (const name of ['id', 'drop_ids', 'hp', '_private', 'level2']) {
    assert.equal(toFieldIdentifier(name), name, name);
  }
});

test('대소문자를 바꾸지 않는다', () => {
  // drop_ids 를 DropIds 로 바꾸면 시트를 쓴 사람이 생성 코드에서 자기 열을 못 찾는다.
  assert.equal(toFieldIdentifier('drop_ids'), 'drop_ids');
  assert.equal(toFieldIdentifier('DropIds'), 'DropIds');
  assert.equal(toFieldIdentifier('HP'), 'HP');
});

test('한글 필드명을 그대로 둔다', () => {
  // C# 명세상 유니코드 식별자는 합법이고 Unity 에서도 컴파일된다. 로마자로 옮기는
  // 것은 원본과의 연결을 끊는 일이다.
  assert.equal(toFieldIdentifier('체력'), '체력');
  assert.equal(toFieldIdentifier('공격력_최대'), '공격력_최대');
});

test('식별자로 쓸 수 없는 문자를 밑줄로 바꾼다', () => {
  assert.equal(toFieldIdentifier('몬스터 이름'), '몬스터_이름');
  assert.equal(toFieldIdentifier('drop-ids'), 'drop_ids');
  assert.equal(toFieldIdentifier('hp(최대)'), 'hp_최대_');
  assert.equal(toFieldIdentifier('a.b'), 'a_b');
});

test('숫자로 시작하면 밑줄을 앞에 붙인다', () => {
  assert.equal(toFieldIdentifier('2nd'), '_2nd');
  assert.equal(toFieldIdentifier('1'), '_1');
});

test('유니코드를 NFC 로 정규화한다', () => {
  // 엑셀과 macOS 를 오가면 한글이 분해형으로 들어오는 일이 있다. 정규화하지 않으면
  // 눈에 같아 보이는 두 필드명이 다른 키가 된다.
  const decomposed = String.fromCodePoint(0x1112, 0x1161, 0x11ab); // 초성 + 중성 + 종성
  const composed = String.fromCodePoint(0xd55c); // 한
  assert.notEqual(decomposed, composed, '두 표현이 같으면 이 테스트는 아무것도 안 본다');
  assert.equal(toFieldIdentifier(decomposed), composed);
  assert.equal(toClassName(decomposed), composed);
});

test('밑줄만 남는 이름을 알아본다', () => {
  // spec.md §6.4: 2번이 치환이지 삭제가 아니므로 !!! 는 ___ 가 된다.
  assert.equal(toFieldIdentifier('!!!'), '___');
  assert.equal(isUsableIdentifier('___'), false);
  assert.equal(isUsableIdentifier('_'), false);
  assert.equal(isUsableIdentifier(''), false);
  assert.equal(isUsableIdentifier('_1'), true);
  assert.equal(isUsableIdentifier('id'), true);
});

// ── 시트명: PascalCase (spec.md §6.4) ────────────────────────────────

test('공백·하이픈·점·밑줄을 단어 경계로 본다', () => {
  assert.equal(toClassName('item-drop'), 'ItemDrop');
  assert.equal(toClassName('item_drop'), 'ItemDrop');
  assert.equal(toClassName('item.drop'), 'ItemDrop');
  assert.equal(toClassName('item drop'), 'ItemDrop');
  assert.equal(toClassName('item  drop'), 'ItemDrop');
});

test('이미 PascalCase 면 그대로 둔다', () => {
  assert.equal(toClassName('Monster'), 'Monster');
  assert.equal(toClassName('MonsterDrop'), 'MonsterDrop');
});

test('첫 글자를 대문자로 올린다', () => {
  assert.equal(toClassName('monster'), 'Monster');
});

test('약어의 대문자를 무너뜨리지 않는다', () => {
  // ITEM 을 Item 으로 낮추면 NPC·UI 같은 약어가 전부 망가진다.
  assert.equal(toClassName('ITEM'), 'ITEM');
  assert.equal(toClassName('npc-data'), 'NpcData');
  assert.equal(toClassName('NPC-data'), 'NPCData');
});

test('한글 시트명은 단어 경계만 없앤다', () => {
  assert.equal(toClassName('몬스터 정보'), '몬스터정보');
  assert.equal(toClassName('몬스터'), '몬스터');
});

test('시트명에도 식별자 규칙을 적용한다', () => {
  assert.equal(toClassName('2nd-sheet'), '_2ndSheet');
  assert.equal(toClassName('item!drop'), 'Item_drop');
});

test('빈 시트명은 빈 문자열이다', () => {
  assert.equal(toClassName('   '), '');
  assert.equal(isUsableIdentifier(toClassName('---')), false);
});

// ── 예약어 (spec.md §6.4) ────────────────────────────────────────────

test('C# 예약 키워드를 알아본다', () => {
  for (const word of ['class', 'event', 'params', 'object', 'string', 'int', 'namespace', 'ref']) {
    assert.equal(isReservedWord(word), true, word);
  }
});

test('문맥 키워드는 예약어가 아니다', () => {
  // public int value; 는 컴파일된다. value 는 프로퍼티 setter 안에서만 특별하다.
  // 합법인 이름을 막으면, 자동 개명을 하지 않는 이상 사용자가 시트를 고쳐야 한다.
  for (const word of ['value', 'var', 'record', 'dynamic', 'async', 'await', 'nameof', 'yield']) {
    assert.equal(isReservedWord(word), false, word);
  }
});

test('예약어 판정은 대소문자를 구분한다', () => {
  // C# 키워드는 전부 소문자다. Class 는 합법인 식별자다.
  assert.equal(isReservedWord('Class'), false);
  assert.equal(isReservedWord('INT'), false);
});

test('예약어 목록은 77개이고 전부 소문자다', () => {
  assert.equal(RESERVED_WORDS.size, 77);
  for (const word of RESERVED_WORDS) {
    assert.equal(word, word.toLowerCase(), word);
    assert.match(word, /^[a-z]+$/, word);
  }
});

test('예약어를 자동으로 바꾸지 않는다', () => {
  // 이름을 바꾸는 대신 E007 로 보고한다 (spec.md §6.4).
  assert.equal(toFieldIdentifier('class'), 'class');
  assert.equal(toFieldIdentifier('event'), 'event');
});

// ── 입력 검증 ────────────────────────────────────────────────────────

test('문자열이 아닌 입력은 빈 문자열이 된다', () => {
  for (const bad of [null, undefined, 3, {}]) {
    assert.equal(toFieldIdentifier(bad), '', JSON.stringify(bad));
    assert.equal(toClassName(bad), '', JSON.stringify(bad));
  }
});

test('같은 입력은 같은 결과를 낸다', () => {
  assert.equal(toFieldIdentifier('몬스터 이름'), toFieldIdentifier('몬스터 이름'));
  assert.equal(toClassName('item-drop'), toClassName('item-drop'));
});
