// 같은 입력은 바이트 단위로 같은 출력을 낸다.
//
// 사양: docs/spec.md §8
//
// 생성 코드를 저장소에 커밋하는 이상, 이게 깨지면 데이터를 안 바꿔도 diff 가 생기고
// 코드 리뷰가 무의미해진다. 모듈별 테스트에도 2회 실행 비교가 있지만, 결정성을
// 깨뜨리는 것은 대개 모듈 하나가 아니라 그 사이의 연결이라 파이프라인 전체를 본다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { emitCsv } from '../src/core/emit/csv.js';
import { emitJson } from '../src/core/emit/json.js';
import { buildIR } from '../src/core/parser/build-ir.js';
import { readWorkbook } from '../src/core/parser/workbook-reader.js';
import { formatReport } from '../src/core/validate/report.js';
import { validate } from '../src/core/validate/validator.js';
import { buildWorkbook } from './fixtures/build.mjs';
import { toGoldenJson } from './support/golden.mjs';
import { stripCommentsAndStrings } from './support/source.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = ['basic', 'broken'];

/** 정의 파일 하나를 끝까지 통과시켜 모든 산출물을 문자열로 모은다. */
function pipeline(name) {
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', `${name}.def.json`), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  const { ir, diagnostics } = buildIR(readWorkbook(bytes, { fileName: `${name}.xlsx` }));

  return {
    ir: toGoldenJson(ir),
    report: formatReport(validate(ir, diagnostics)),
    json: emitJson(ir),
    csv: emitCsv(ir),
    minified: emitJson(ir, { minify: true }),
  };
}

// ── 2회 실행 비교 (spec.md §8) ───────────────────────────────────────

for (const name of FIXTURES) {
  test(`${name} 픽스처를 두 번 돌리면 모든 산출물이 같다`, () => {
    assert.deepEqual(pipeline(name), pipeline(name));
  });
}

test('IR 을 복제해서 내보내도 같은 바이트가 나온다', () => {
  // structuredClone 은 객체를 다시 만들므로, 어딘가에서 객체 정체성이나
  // 삽입 순서에 기대고 있으면 여기서 드러난다.
  const definition = JSON.parse(readFileSync(join(here, 'fixtures', 'basic.def.json'), 'utf8'));
  const bytes = XLSX.write(buildWorkbook(definition), { type: 'buffer', bookType: 'xlsx' });
  const { ir } = buildIR(readWorkbook(bytes, { fileName: 'basic.xlsx' }));

  assert.deepEqual(emitJson(structuredClone(ir)), emitJson(ir));
  assert.deepEqual(emitCsv(structuredClone(ir)), emitCsv(ir));
});

// ── 현재 시각이 섞이지 않는다 ────────────────────────────────────────

test('출력 어디에도 오늘 날짜가 없다', () => {
  const today = new Date().toISOString().slice(0, 10);

  for (const name of FIXTURES) {
    const result = pipeline(name);
    const texts = [
      result.ir,
      result.report,
      ...result.json.map((file) => file.text),
      ...result.csv.map((file) => file.text),
    ];
    for (const text of texts) {
      assert.equal(text.includes(today), false, `${name}: 출력 경로에서 현재 시각을 읽었다`);
    }
  }
});

test('core 의 어느 파일도 인자 없는 Date 를 만들지 않는다', () => {
  // 런타임 테스트로는 잡히지 않는다. 오늘 날짜가 우연히 골든과 겹치지 않는 한
  // 통과해 버리기 때문이다 — 정적 검사만이 유효하다 (spec.md §9 와 같은 이유).
  const offenders = [];
  for (const file of listJsFiles(join(here, '..', 'src', 'core'))) {
    // 규칙을 설명하는 주석이 규칙 위반으로 잡히지 않게 먼저 지운다.
    const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    if (/\bDate\.now\s*\(/.test(code) || /\bnew\s+Date\s*\(\s*\)/.test(code)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `현재 시각은 옵션으로 주입한다 (CLAUDE.md 규칙 6):\n${offenders.join('\n')}`,
  );
});

function listJsFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listJsFiles(path));
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

// ── 줄바꿈 (spec.md §8) ──────────────────────────────────────────────

test('모든 산출물의 줄바꿈이 LF 이고 끝에 개행이 있다', () => {
  for (const name of FIXTURES) {
    const result = pipeline(name);
    const texts = [result.ir, ...result.json.map((f) => f.text), ...result.csv.map((f) => f.text)];
    for (const text of texts) {
      assert.equal(text.includes('\r'), false, `${name}: CR 이 섞였다`);
      assert.equal(text.endsWith('\n'), true, `${name}: 파일 끝 개행이 없다`);
    }
  }
});

test('커밋된 골든 파일에 CR 이 없다', () => {
  // .gitattributes 가 eol=lf 를 강제하지만, 작업 사본이 어긋나면 여기서 잡힌다.
  const goldenDirectory = join(here, 'golden');
  const files = readdirSync(goldenDirectory).filter((name) => name !== '.gitkeep');

  assert.ok(files.length > 0, '골든 파일이 하나도 없다');
  for (const file of files) {
    const text = readFileSync(join(goldenDirectory, file), 'utf8');
    assert.equal(text.includes('\r'), false, `test/golden/${file} 에 CR 이 있다`);
  }
});
