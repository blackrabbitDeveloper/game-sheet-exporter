// render.js 의 순수 계산.
//
// DOM 을 만드는 함수는 눈으로 확인하는 수밖에 없지만, 배지 개수와 요약 문장은
// 계산이므로 여기서 고정한다. 배지 숫자가 틀리면 사용자가 어느 시트를 봐야 하는지
// 잘못 안다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnostic } from '../src/core/ir/diagnostic.js';
import { countDiagnostics, summarize } from '../src/ui/render.js';

const error = (cell) => diagnostic('E004', cell, '참조 대상이 없습니다: Item.id = 1');
const warning = (cell) => diagnostic('W105', cell, '필드명이 변환되었습니다');

test('시트별로 오류와 경고를 나눠 센다', () => {
  const counts = countDiagnostics([
    error('Monster!A4'),
    error('Monster!B5'),
    warning('Monster!C1'),
    warning('Item!A1'),
  ]);

  assert.deepEqual(counts.get('Monster'), { errors: 2, warnings: 1 });
  assert.deepEqual(counts.get('Item'), { errors: 0, warnings: 1 });
});

test('시트 전체에 걸린 진단도 그 시트로 센다', () => {
  // 사양 §5.1 — 시트 전체면 'Monster!' 까지 표기한다.
  const counts = countDiagnostics([warning('Empty!')]);
  assert.deepEqual(counts.get('Empty'), { errors: 0, warnings: 1 });
});

test('시트를 가리키지 않는 진단은 어느 시트에도 넣지 않는다', () => {
  // 파일 전체에 걸린 진단은 좌표가 파일명이다.
  const counts = countDiagnostics([error('gamedata.xlsx')]);
  assert.equal(counts.size, 0);
});

test('진단이 없으면 빈 Map 이다', () => {
  assert.equal(countDiagnostics([]).size, 0);
});

test('한글 시트명도 센다', () => {
  const counts = countDiagnostics([error('몬스터 정보!A4')]);
  assert.deepEqual(counts.get('몬스터 정보'), { errors: 1, warnings: 0 });
});

// ── 요약 문장 ────────────────────────────────────────────────────────

test('오류가 있으면 내보낼 수 없다고 말한다', () => {
  const text = summarize([error('Monster!A4'), warning('Monster!B1')]);

  assert.match(text, /오류 1건/);
  assert.match(text, /경고 1건/);
  assert.match(text, /고쳐야/);
});

test('경고만 있으면 내보낼 수 있다고 말한다', () => {
  const text = summarize([warning('Monster!B1'), warning('Item!A1')]);

  assert.match(text, /경고 2건/);
  assert.match(text, /내보낼 수 있습니다/);
  assert.doesNotMatch(text, /오류/);
});

test('진단이 없으면 그렇게 말한다', () => {
  assert.match(summarize([]), /찾지 못했습니다/);
});
