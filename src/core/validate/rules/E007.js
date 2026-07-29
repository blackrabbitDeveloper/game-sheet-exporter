// E007 — C# 예약어 충돌
//
// 사양: docs/spec.md §5.2, §6.4
//
// 자동으로 이름을 바꾸지 않는다. 바꾸면 시트를 쓴 사람이 생성 코드에서 자기 열을
// 못 찾고, 무엇보다 도구가 말없이 데이터 계약을 바꾸는 셈이 된다.
//
// 클래스명은 PascalCase 로 올라가면서 첫 글자가 대문자가 되므로 예약어가 될 수 없다.
// 필드명만 본다.
import { diagnostic } from '../../ir/diagnostic.js';
import { isReservedWord } from '../../ir/naming.js';

export const code = 'E007';
export const title = 'C# 예약어 충돌';

export function check(ir) {
  const found = [];

  for (const sheet of ir.sheets) {
    for (const field of sheet.fields) {
      if (!isReservedWord(field.identifier)) continue;
      found.push(
        diagnostic(
          code,
          field.cell,
          `C# 예약어와 겹칩니다: ${field.identifier}`,
          `열 이름을 바꾸십시오. 도구가 대신 바꾸지 않습니다 (C# 에서 @${field.identifier} 로 쓸 수는 있지만 JSON 키까지 흔들립니다)`,
        ),
      );
    }
  }

  return found;
}
