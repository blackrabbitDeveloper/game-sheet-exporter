// E011 — 식별자 변환 불가
//
// 사양: docs/spec.md §5.2, §6.4
//
// 변환 결과에 밑줄 말고 아무것도 남지 않는 경우다. `!!!` 는 `___` 가 되는데, C# 문법상
// 합법이지만 이름이 없는 것과 같다.
import { diagnostic } from '../../ir/diagnostic.js';
import { isUsableIdentifier } from '../../ir/naming.js';
import { sheetRef } from '../../util/a1.js';

export const code = 'E011';
export const title = '식별자 변환 불가';

export function check(ir) {
  const found = [];

  for (const sheet of ir.sheets) {
    if (!isUsableIdentifier(sheet.className)) {
      found.push(report(sheetRef(sheet.name), '시트명', sheet.name, sheet.className));
    }
    for (const field of sheet.fields) {
      if (isUsableIdentifier(field.identifier)) continue;
      found.push(report(field.cell, '필드명', field.name, field.identifier));
    }
  }

  for (const item of ir.enums) {
    if (isUsableIdentifier(item.className)) continue;
    found.push(report(sheetRef(item.sheet), 'enum 이름', item.name, item.className));
  }

  return found;
}

function report(cell, what, name, identifier) {
  return diagnostic(
    code,
    cell,
    `${what}을 C# 식별자로 바꿀 수 없습니다: "${name}" → "${identifier}"`,
    '문자나 숫자를 하나 이상 넣으십시오',
  );
}
