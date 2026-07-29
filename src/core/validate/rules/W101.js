// W101 — 미사용 enum 멤버
//
// 사양: docs/spec.md §5.3
//
// 오타로 만든 멤버를 잡는다. Nomal 을 정의해 두고 시트에는 Normal 을 쓰면 E009 와
// W101 이 짝으로 나오고, 둘을 나란히 보면 원인이 바로 보인다.
import { diagnostic } from '../../ir/diagnostic.js';
import { forEachValue } from '../traverse.js';

export const code = 'W101';
export const title = '미사용 enum 멤버';

export function check(ir) {
  const used = new Map();

  forEachValue(ir, ({ type, value }) => {
    if (type.kind !== 'enum') return;
    if (!used.has(type.name)) used.set(type.name, new Set());
    used.get(type.name).add(value);
  });

  const found = [];
  for (const definition of ir.enums) {
    const names = used.get(definition.name);
    for (const member of definition.members) {
      if (names?.has(member.name)) continue;
      found.push(
        diagnostic(
          code,
          member.cell,
          `쓰이지 않는 enum 멤버입니다: ${definition.name}.${member.name}`,
          '어느 시트에서도 이 값을 쓰지 않습니다',
        ),
      );
    }
  }

  return found;
}
