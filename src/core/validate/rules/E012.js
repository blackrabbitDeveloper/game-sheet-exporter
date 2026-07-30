// E012 — 유일성 위반
//
// 사양: docs/spec.md §3.4, §5.2 · docs/notation.md §4.3
//
// 유일해야 하는 필드는 두 종류다: 각 시트의 기본키, 그리고 ref 가 가리키는 대상 필드.
// 참조 대상이 아닌 필드의 중복은 문제 삼지 않는다 — 등급이나 분류 열은 겹치는 게 정상이다.
import { diagnostic } from '../../ir/diagnostic.js';
import { fieldKey, refTargetKeys } from '../traverse.js';

export const code = 'E012';
export const title = '유일성 위반';

export function check(ir) {
  // 참조 대상은 E004 와 같은 집합을 본다. 여기서 따로 모으면 둘이 갈라진다.
  const required = refTargetKeys(ir);

  for (const sheet of ir.sheets) {
    if (sheet.primaryKey !== null) required.add(fieldKey(sheet.name, sheet.primaryKey));
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
              // 라틴 식별자 뒤의 조사는 읽는 방식에 따라 갈리므로 붙이지 않는다.
              `유일해야 하는 필드입니다: ${sheet.name}.${field.name} — 처음 나온 곳 ${first.get(key)}`,
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

function format(value) {
  return Array.isArray(value) ? value.join(', ') : String(value);
}
