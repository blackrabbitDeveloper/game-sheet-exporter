// W105 — 식별자 변환됨
//
// 사양: docs/spec.md §5.3, §6.4
//
// 오류가 아니라 알림이다. 생성 코드의 이름이 시트와 다르다는 것을 알아야 나중에
// "내 열이 어디 갔지" 를 겪지 않는다.
import { diagnostic } from '../../ir/diagnostic.js';
import { isUsableIdentifier } from '../../ir/naming.js';
import { sheetRef } from '../../util/a1.js';

export const code = 'W105';
export const title = '식별자 변환됨';

export function check(ir) {
  const found = [];

  for (const sheet of ir.sheets) {
    if (changed(sheet.name, sheet.className)) {
      found.push(report(sheetRef(sheet.name), '시트명', sheet.name, sheet.className));
    }
    for (const field of sheet.fields) {
      if (!changed(field.name, field.identifier)) continue;
      found.push(report(field.cell, '필드명', field.name, field.identifier));
    }
  }

  for (const item of ir.enums) {
    if (!changed(item.name, item.className)) continue;
    found.push(report(sheetRef(item.sheet), 'enum 이름', item.name, item.className));
  }

  return found;
}

function changed(name, identifier) {
  // 변환이 아예 실패한 이름은 E011 이 잡는다. 한 문제로 두 번 울지 않는다.
  return isUsableIdentifier(identifier) && name !== identifier;
}

function report(cell, what, name, identifier) {
  return diagnostic(
    code,
    cell,
    `${what}이 변환되었습니다: "${name}" → "${identifier}"`,
    '생성 코드와 JSON 키는 변환된 이름을 씁니다',
  );
}
