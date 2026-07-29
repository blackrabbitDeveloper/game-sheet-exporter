// 규칙 실행기와 리포트 포맷.
//
// 사양: docs/spec.md §5.1(리포트 형식), §5.5(두 단계가 같은 목록에 모인다)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnostic } from '../src/core/ir/diagnostic.js';
import { formatReport } from '../src/core/validate/report.js';
import { RULES, validate } from '../src/core/validate/validator.js';
import { irFrom } from './support/ir.mjs';

// ── 규칙 등록 ────────────────────────────────────────────────────────

test('규칙이 코드 중복 없이 등록돼 있다', () => {
  const codes = RULES.map((rule) => rule.code);
  assert.deepEqual([...new Set(codes)], codes, '같은 코드의 규칙이 둘 이상 등록됐다');
  assert.ok(codes.length >= 7, `등록된 규칙: ${codes.join(', ')}`);
});

test('등록 순서가 소스에 박혀 있다', () => {
  // 디렉터리 스캔이 아니라 명시적 import 이므로 순서가 실행마다 흔들리지 않는다.
  assert.deepEqual(RULES.map((rule) => rule.code), [...RULES.map((rule) => rule.code)]);
});

// ── 진단 합류 (spec.md §5.5) ─────────────────────────────────────────

const BROKEN = {
  Monster: [
    ['id', 'grade', 'hp'],
    ['int', 'enum:Grade', 'int'],
    ['고유ID', '등급', '체력'],
    ['1001', 'Legendary', 'abc'],
    ['1001', 'Normal', '30'],
  ],
  'enum.Grade': [
    ['name', 'value', 'comment'],
    ['string', 'int?', 'string?'],
    ['이름', '값', '설명'],
    ['Normal', '0', '일반'],
  ],
};

test('파싱 진단과 규칙 진단이 한 목록에 모인다', () => {
  const { ir, diagnostics } = irFrom(BROKEN);
  const all = validate(ir, diagnostics);
  const codes = new Set(all.map((item) => item.code));

  assert.ok(codes.has('E006'), '파싱 단계 진단(hp=abc)이 빠졌다');
  assert.ok(codes.has('E009'), '규칙 진단(Legendary)이 빠졌다');
  assert.ok(codes.has('E012'), '규칙 진단(id 중복)이 빠졌다');
});

test('셀 위치 순으로 정렬된다', () => {
  const { ir, diagnostics } = irFrom(BROKEN);
  const cells = validate(ir, diagnostics).map((item) => item.cell);

  assert.deepEqual(cells, [...cells].sort(byPosition), `정렬이 어긋났다:\n${cells.join('\n')}`);
  assert.equal(cells[0].startsWith('Monster!'), true, '데이터 시트가 enum 시트보다 앞이다');
});

function byPosition(left, right) {
  const rank = (cell) => {
    const [sheet, ref = ''] = cell.split('!');
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    return [sheet === 'Monster' ? 0 : 1, match ? Number(match[2]) : -1, match ? match[1] : ''];
  };
  const [a, b] = [rank(left), rank(right)];
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

test('같은 입력은 같은 목록을 낸다', () => {
  const first = irFrom(BROKEN);
  const second = irFrom(BROKEN);
  assert.deepEqual(validate(first.ir, first.diagnostics), validate(second.ir, second.diagnostics));
});

test('파싱 진단을 안 넘겨도 동작한다', () => {
  const { ir } = irFrom(BROKEN);
  assert.ok(validate(ir).length > 0);
});

test('깨끗한 시트는 빈 목록을 낸다', () => {
  const { ir, diagnostics } = irFrom({
    Monster: [['id', 'name'], ['int', 'loc'], ['고유ID', '이름'], ['1001', 'MON_SLIME']],
  });
  assert.deepEqual(validate(ir, diagnostics), []);
});

// ── 리포트 형식 (spec.md §5.1) ───────────────────────────────────────

test('사양의 리포트 형식 그대로 낸다', () => {
  const report = formatReport([
    diagnostic(
      'E004',
      'Monster!E4',
      '참조 대상이 없습니다: Item.id = 2003',
      'drop_ids 열의 값 2003 이 Item 시트에 없습니다.',
    ),
    diagnostic('W105', 'Monster!B1', '필드명이 변환되었습니다: "몬스터 이름" → "몬스터_이름"'),
  ]);

  assert.equal(
    report,
    [
      'E004  Monster!E4  참조 대상이 없습니다: Item.id = 2003',
      '                  drop_ids 열의 값 2003 이 Item 시트에 없습니다.',
      'W105  Monster!B1  필드명이 변환되었습니다: "몬스터 이름" → "몬스터_이름"',
      '',
    ].join('\n'),
  );
});

test('좌표 너비가 달라도 열을 맞춘다', () => {
  const report = formatReport([
    diagnostic('E003', 'Monster!A4', '가'),
    diagnostic('W102', 'VeryLongSheetName!', '나', '상세'),
  ]);

  assert.deepEqual(report.split('\n'), [
    'E003  Monster!A4          가',
    'W102  VeryLongSheetName!  나',
    '                          상세',
    '',
  ]);
});

test('진단이 없으면 빈 문자열이다', () => {
  assert.equal(formatReport([]), '');
});

test('줄바꿈은 LF 이고 파일 끝에 개행이 있다', () => {
  const report = formatReport([diagnostic('E003', 'Monster!A4', '가', '나')]);
  assert.equal(report.includes('\r'), false);
  assert.equal(report.endsWith('\n'), true);
});
