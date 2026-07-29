// E012 — 유일성 위반
//
// 사양: docs/spec.md §3.4, §5.2 · docs/notation.md §4.3
//
// 유일해야 하는 필드는 두 종류다: 각 시트의 기본키, 그리고 ref 가 가리키는 대상 필드.
// 참조 대상이 아닌 필드의 중복은 문제 삼지 않는다 — 등급이나 분류 열은 겹치는 게 정상이다.
import { diagnostic } from '../../ir/diagnostic.js';
import { baseType } from '../traverse.js';

export const code = 'E012';
export const title = '유일성 위반';

export function check(ir) {
  const required = new Set();

  for (const sheet of ir.sheets) {
    if (sheet.primaryKey !== null) required.add(fieldKey(sheet.name, sheet.primaryKey));
    for (const field of sheet.fields) {
      const leaf = baseType(field.type);
      if (leaf?.kind === 'ref') required.add(fieldKey(leaf.sheet, leaf.field));
    }
  }

  const found = [];
  for (const sheet of ir.sheets) {
    for (const field of sheet.fields) {
      if (!required.has(fieldKey(sheet.name, field.name))) continue;

      // 값 → 처음 나온 좌표. 값이 배열일 수도 있어 JSON 으로 키를 만든다.
      const first = new Map();
      for (const row of sheet.rows) {
        const value = row.values[field.name];
        if (value === null || value === undefined) continue;

        const key = JSON.stringify(value);
        const cell = row.cells[field.name];

        if (first.has(key)) {
          found.push(
            diagnostic(
              code,
              cell,
              `값이 중복되었습니다: ${format(value)}`,
              `${sheet.name}.${field.name} 은 유일해야 합니다. 처음 나온 곳: ${first.get(key)}`,
            ),
          );
          continue;
        }
        first.set(key, cell);
      }
    }
  }

  return found;
}

function fieldKey(sheetName, fieldName) {
  return JSON.stringify([sheetName, fieldName]);
}

function format(value) {
  return Array.isArray(value) ? value.join(', ') : String(value);
}
