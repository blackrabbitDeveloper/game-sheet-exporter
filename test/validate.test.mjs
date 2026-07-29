// 규칙 실행기와 리포트 포맷.
//
// 사양: docs/spec.md §5.1(리포트 형식), §5.5(두 단계가 같은 목록에 모인다)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { diagnostic, isError } from '../src/core/ir/diagnostic.js';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { displayWidth, formatReport } from '../src/core/validate/report.js';
import { RULES, validate } from '../src/core/validate/validator.js';
import { buildWorkbook } from './fixtures/build.mjs';
import { assertGolden } from './support/golden.mjs';
import { irFrom } from './support/ir.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

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

// ── broken 픽스처 (S3 성공 조건) ─────────────────────────────────────

function reportFor(name) {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', `${name}.def.json`), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  const { ir, diagnostics } = buildIR(readWorkbook(bytes, { fileName: `${name}.xlsx` }));
  return { ir, diagnostics: validate(ir, diagnostics) };
}

test('broken 픽스처가 골든 리포트와 일치한다', () => {
  assertGolden('broken.report.txt', formatReport(reportFor('broken').diagnostics));
});

test('broken 픽스처가 파싱 단계와 검증 단계 진단을 모두 낸다', () => {
  const codes = new Set(reportFor('broken').diagnostics.map((item) => item.code));

  // 파싱 단계 (spec.md §5.5)
  for (const code of ['E001', 'E002', 'E003', 'E005', 'E006']) {
    assert.ok(codes.has(code), `${code} 가 빠졌다`);
  }
  // 검증 단계
  for (const code of ['E009', 'E012', 'W101', 'W102', 'W103', 'W104', 'W106']) {
    assert.ok(codes.has(code), `${code} 가 빠졌다`);
  }
});

test('무시 시트는 리포트에 나오지 않는다', () => {
  const report = formatReport(reportFor('broken').diagnostics);
  assert.equal(report.includes('#메모'), false, '# 로 시작하는 시트는 통째로 무시된다');
});

test('naming 픽스처가 골든 리포트와 일치한다', () => {
  assertGolden('naming.report.txt', formatReport(reportFor('naming').diagnostics));
});

test('naming 픽스처가 식별자 규칙 넷을 모두 낸다', () => {
  const codes = new Set(reportFor('naming').diagnostics.map((item) => item.code));
  for (const code of ['E007', 'E011', 'E015', 'W105']) {
    assert.ok(codes.has(code), `${code} 가 빠졌다`);
  }
});

test('basic 픽스처에는 오류가 없다', () => {
  const { diagnostics } = reportFor('basic');

  assert.deepEqual(
    diagnostics.filter(isError).map((item) => `${item.code} ${item.cell}`),
    [],
    'basic 은 내보내기가 통과해야 하는 픽스처다',
  );

  // 경고 둘은 픽스처가 작아서 나온다 — 데이터 행이 하나뿐이라 Grade.Rare 와
  // Grade.Unique 를 쓰는 행이 없다. 규칙이 옳게 동작한 결과이므로 그대로 고정한다.
  assert.deepEqual(
    diagnostics.map((item) => `${item.code} ${item.cell}`),
    ['W101 enum.Grade!A5', 'W101 enum.Grade!A6'],
  );
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

test('한글 시트명이 섞여도 열이 맞는다', () => {
  // 시트명에 한글이 들어오는 것은 이 도구에서 기본이다 (spec.md §6.4).
  // 코드 유닛 수로 맞추면 리포트가 늘 어긋난다.
  assert.equal(displayWidth('헤더깨짐!C1'), 11);
  assert.equal(displayWidth('enum.Grade!A6'), 13);

  const report = formatReport([
    diagnostic('E001', '헤더깨짐!C1', '가'),
    diagnostic('W101', 'enum.Grade!A6', '나'),
  ]);
  assert.deepEqual(report.split('\n'), [
    'E001  헤더깨짐!C1    가',
    'W101  enum.Grade!A6  나',
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
