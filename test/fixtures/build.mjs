// *.def.json → generated/*.xlsx
//
// xlsx 는 바이너리라 사람도 Claude Code 도 텍스트로 못 다룬다. 정의를 JSON 으로 두고
// 여기서 생성한다. 정의 파일만 커밋하고 생성물은 .gitignore 대상이다.
//
//   npm run fixtures
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as XLSX from '../../vendor/sheetjs/xlsx.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDirectory = join(here, 'generated');

// 결정적 출력을 위해 고정한다. CLAUDE.md 규칙 6에 따라 생성 경로에서 현재 시각을 읽지 않는다.
const FIXED_CREATED_DATE = new Date(Date.UTC(2020, 0, 1));

export function buildWorkbook(definition, { name = '<inline>' } = {}) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error(`${name}: 최상위는 { 시트명: 행배열 } 형태의 객체여야 한다`);
  }

  const sheetNames = Object.keys(definition);
  if (sheetNames.length === 0) throw new Error(`${name}: 시트가 하나도 없다`);

  const workbook = XLSX.utils.book_new();
  workbook.Props = { CreatedDate: FIXED_CREATED_DATE };

  // 키 순서 = 시트 순서. 알파벳 정렬하지 않는다.
  for (const sheetName of sheetNames) {
    const rows = definition[sheetName];
    if (!Array.isArray(rows) || !rows.every(Array.isArray)) {
      throw new Error(`${name}!${sheetName}: 행은 배열의 배열이어야 한다`);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }

  return workbook;
}

function main() {
  const definitions = readdirSync(here)
    .filter((entry) => entry.endsWith('.def.json'))
    .sort();

  if (definitions.length === 0) {
    console.log('생성할 *.def.json 이 없습니다.');
    return;
  }

  mkdirSync(outputDirectory, { recursive: true });

  // 삭제된 정의의 잔여물이 남지 않도록 생성물만 정리한다.
  for (const stale of readdirSync(outputDirectory).filter((entry) => entry.endsWith('.xlsx'))) {
    rmSync(join(outputDirectory, stale));
  }

  for (const file of definitions) {
    const name = basename(file, '.def.json');
    const definition = JSON.parse(readFileSync(join(here, file), 'utf8'));
    const workbook = buildWorkbook(definition, { name: file });
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const target = join(outputDirectory, `${name}.xlsx`);
    writeFileSync(target, buffer);
    console.log(`${file} → generated/${name}.xlsx (${Object.keys(definition).length}개 시트, ${buffer.length} bytes)`);
  }
}

if (existsSync(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) main();
