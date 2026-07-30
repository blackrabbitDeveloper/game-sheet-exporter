// E004 — 참조 대상 값 없음
//
// 사양: docs/spec.md §5.1(리포트 형식), §5.2 · docs/notation.md §4.3
//
// 이 도구의 존재 이유에 가장 가까운 규칙이다. 잘못된 참조 ID 는 빌드를 통과하고
// 런타임에 NullReference 로 나타나므로, 내보내기 전에 잡아야 한다.
//
// 값은 파서가 이미 대상 필드의 타입으로 캐스팅해 뒀다 (spec §4.1). 그래서 여기서는
// 문자열이 아니라 캐스팅된 값끼리 비교하고, "2001" 과 2001 로 어긋날 여지가 없다.
import { diagnostic } from '../../ir/diagnostic.js';
import { fieldKey, forEachValue, refTargetKeys } from '../traverse.js';

export const code = 'E004';
export const title = '참조 대상 값 없음';

export function check(ir) {
  const targets = collectTargetValues(ir);

  const found = [];
  forEachValue(ir, ({ type, value, cell, field }) => {
    if (type.kind !== 'ref') return;

    const existing = targets.get(fieldKey(type.sheet, type.field));
    // 대상 시트나 필드 자체가 없으면 E008 이 헤더 단계에서 필드마다 한 번 냈다.
    // 여기서 또 내면 같은 문제로 행 수만큼 운다.
    if (existing === undefined || existing.has(valueKey(value))) return;

    found.push(
      diagnostic(
        code,
        cell,
        `참조 대상이 없습니다: ${type.sheet}.${type.field} = ${value}`,
        // 값 뒤의 조사는 숫자를 한국어로 읽어야 정해지므로 붙이지 않는다.
        `${field.name} 열. ${type.sheet} 시트의 ${type.field} 필드에 이 값이 없습니다`,
      ),
    );
  });

  return found;
}

/**
 * 참조 대상이 되는 필드마다 그 필드에 실제로 있는 값의 집합을 만든다.
 *
 * 참조되지 않는 필드는 담지 않는다. 대상이 없는 경우와 대상이 비어 있는 경우를
 * `undefined` 와 빈 Set 으로 구분해야 E008 과 겹치지 않는다.
 */
function collectTargetValues(ir) {
  const wanted = refTargetKeys(ir);
  const targets = new Map();

  for (const sheet of ir.sheets) {
    for (const field of sheet.fields) {
      const key = fieldKey(sheet.name, field.name);
      if (!wanted.has(key)) continue;

      const values = new Set();
      for (const row of sheet.rows) {
        const value = row.values[field.name];
        // 빈 값과 캐스팅 실패한 값은 참조할 수 있는 키가 아니다.
        if (value === null || value === undefined) continue;
        values.add(valueKey(value));
      }
      targets.set(key, values);
    }
  }

  return targets;
}

// 집합의 멤버십 판정에만 쓴다. 순회하지 않으므로 결정성에 영향이 없다.
function valueKey(value) {
  return JSON.stringify(value);
}
