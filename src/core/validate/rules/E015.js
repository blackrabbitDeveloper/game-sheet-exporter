// E015 — 클래스명 충돌
//
// 사양: docs/spec.md §5.2, §6.4
//
// PascalCase 변환은 단어 경계를 없애므로 `item-drop` 과 `Item Drop` 이 둘 다
// `ItemDrop` 이 된다. 데이터 시트와 enum 정의 시트는 같은 네임스페이스에 들어가므로
// 함께 본다 — `Grade` 시트와 `enum.Grade` 가 겹치면 C# 이 컴파일되지 않는다.
import { diagnostic } from '../../ir/diagnostic.js';
import { sheetRef } from '../../util/a1.js';

export const code = 'E015';
export const title = '클래스명 충돌';

export function check(ir) {
  const found = [];
  const first = new Map();

  for (const item of [...ir.sheets, ...ir.enums]) {
    const sheetName = item.sheet ?? item.name;
    const { className } = item;
    if (className === '') continue; // E011 이 잡는다

    if (first.has(className)) {
      found.push(
        diagnostic(
          code,
          sheetRef(sheetName),
          `클래스명이 겹칩니다: ${className}`,
          `먼저 나온 시트: ${first.get(className)}`,
        ),
      );
      continue;
    }
    first.set(className, sheetName);
  }

  return found;
}
