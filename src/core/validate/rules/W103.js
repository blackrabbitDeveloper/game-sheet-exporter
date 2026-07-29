// W103 — 빈 열
//
// 사양: docs/spec.md §5.3
//
// 쓰다 만 열이거나, 타입만 정해두고 아직 채우지 않은 열이다.
import { diagnostic } from '../../ir/diagnostic.js';

export const code = 'W103';
export const title = '빈 열';

export function check(ir) {
  const found = [];

  for (const sheet of ir.sheets) {
    // 데이터 행이 없으면 모든 열이 비어 있다. 그건 W102 가 시트 하나로 알린다 —
    // 여기서 또 내면 한 시트에서 경고가 열 수만큼 늘어난다.
    if (sheet.rows.length === 0) continue;

    for (const field of sheet.fields) {
      if (!sheet.rows.every((row) => isEmpty(row.values[field.name]))) continue;
      found.push(
        diagnostic(
          code,
          field.cell,
          `모든 데이터 행에서 비어 있는 열입니다: ${field.name}`,
          '쓰지 않는 열이면 지우거나 # 를 앞에 붙이십시오',
        ),
      );
    }
  }

  return found;
}

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  return Array.isArray(value) && value.length === 0;
}
