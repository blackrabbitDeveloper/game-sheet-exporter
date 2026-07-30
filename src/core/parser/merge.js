// 여러 워크북 → 하나
//
// 사양: docs/spec.md §3.5, §8
//
// 병합 지점이 buildIR 앞이다. 그래서 ref·E004·E012·enum 정의 찾기가 파일 경계를
// 그냥 넘고, 검증기와 에미터는 파일이 몇 개였는지 알 필요가 없다.
//
// 이 파일이 지켜야 할 것은 둘이다.
//
// 1. 순서가 흔들리지 않는다 — 드롭 순서를 쓰면 같은 파일들을 다른 순서로 넣었을 때
//    출력이 달라져 §8 이 깨진다.
// 2. 좌표가 애매해지는 조합을 거부한다 — 두 파일에 같은 이름의 시트가 있으면
//    'Common!A4' 가 어느 파일인지 말하지 못하고, 출력 파일도 서로를 덮는다.
import { diagnostic } from '../ir/diagnostic.js';
import { classifySheet } from '../ir/schema.js';

/**
 * @param {Array<{fileName: string, sheets: Array<{name: string, rows: string[][]}>}>} workbooks
 * @returns {{files: string[], sheets: Array<object>, sheetCount: number, diagnostics: Array<object>}}
 */
export function mergeWorkbooks(workbooks) {
  const ordered = [...workbooks].sort(byFileName);
  const diagnostics = [];

  const files = [];
  const sheets = [];
  const seenSheets = new Map();
  const seenFiles = new Set();

  for (const workbook of ordered) {
    if (seenFiles.has(workbook.fileName)) {
      diagnostics.push(
        diagnostic(
          'E016',
          workbook.fileName,
          `같은 이름의 파일이 두 번 들어왔습니다: ${workbook.fileName}`,
          '같은 파일을 두 번 넣었거나 다른 폴더의 동명 파일입니다. 오류 좌표가 겹칩니다',
        ),
      );
      continue;
    }
    seenFiles.add(workbook.fileName);
    files.push(workbook.fileName);

    for (const sheet of workbook.sheets) {
      // 무시 시트는 병합 전에 뺀다. 파일마다 #메모 가 있는 것은 정상이고,
      // 그것 때문에 E016 이 나면 규칙이 쓸모없어진다.
      if (classifySheet(sheet.name) === 'ignored') continue;

      const owner = seenSheets.get(sheet.name);
      if (owner !== undefined) {
        diagnostics.push(
          diagnostic(
            'E016',
            workbook.fileName,
            `여러 파일에 같은 이름의 시트가 있습니다: ${sheet.name}`,
            `${owner} 와 ${workbook.fileName}. 출력 파일이 서로를 덮고 오류 좌표가 어느 파일인지 말하지 못합니다`,
          ),
        );
        continue;
      }

      seenSheets.set(sheet.name, workbook.fileName);
      // 원본을 바꾸지 않는다. 같은 워크북으로 두 번 병합해도 같은 결과여야 한다.
      sheets.push({ ...sheet, sourceFile: workbook.fileName });
    }
  }

  return {
    files,
    sheets,
    sheetCount: sheets.length,
    diagnostics,
  };
}

/**
 * 파일명 순.
 *
 * localeCompare 를 쓰지 않는다 — 환경에 따라 순서가 달라져 §8 이 깨진다.
 */
function byFileName(left, right) {
  if (left.fileName === right.fileName) return 0;
  return left.fileName < right.fileName ? -1 : 1;
}
