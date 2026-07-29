// E009 — enum 멤버 없음
//
// 사양: docs/spec.md §5.2 · docs/notation.md §4.2
//
// 값에서 enum 을 자동 수집하지 않으므로, 정의에 없는 값은 오타이거나 지워진 멤버다.
import { diagnostic } from '../../ir/diagnostic.js';
import { forEachValue } from '../traverse.js';

export const code = 'E009';
export const title = 'enum 멤버 없음';

export function check(ir) {
  const defined = new Map(
    ir.enums.map((definition) => [
      definition.name,
      new Set(definition.members.map((member) => member.name)),
    ]),
  );

  const found = [];
  forEachValue(ir, ({ type, value, cell, field }) => {
    if (type.kind !== 'enum') return;

    const members = defined.get(type.name);
    // 정의 시트 자체가 없으면 E008 이 헤더 단계에서 이미 냈다. 여기서 또 내면
    // 같은 문제로 행 수만큼 운다.
    if (!members || members.has(value)) return;

    found.push(
      diagnostic(
        code,
        cell,
        `enum 멤버가 아닙니다: ${type.name}.${value}`,
        `${field.name} 열. enum.${type.name} 에 정의된 멤버: ${[...members].join(' · ')}`,
      ),
    );
  });

  return found;
}
