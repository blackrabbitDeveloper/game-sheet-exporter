// IR 순회 헬퍼.
//
// 규칙 파일들이 공유한다. 배열·nullable 을 푸는 코드를 규칙마다 다시 쓰면
// 넷이 조용히 갈라지고, 갈라진 순간 어떤 규칙은 배열 원소를 못 본다.
//
// 개발가이드 §2 의 파일 목록에는 없다. 규칙이 늘수록 이득이 커지는 자리라
// 여기서 만들어 둔다.

/**
 * 접미사(`?`, `[]`)를 벗겨 잎 타입을 낸다.
 *
 * @param {object} type TypeNode
 * @returns {object} scalar | loc | enum | ref
 */
export function baseType(type) {
  let current = type;
  while (current && (current.kind === 'nullable' || current.kind === 'array')) {
    current = current.of;
  }
  return current;
}

/**
 * 시트명 + 필드명을 하나의 키로 만든다.
 *
 * 원본 이름에는 공백·한글·특수문자가 들어오므로 구분자를 골라 이어 붙이면 어떤
 * 문자를 골라도 충돌할 수 있다.
 *
 * @param {string} sheetName 원본 시트명
 * @param {string} fieldName 원본 필드명
 * @returns {string}
 */
export function fieldKey(sheetName, fieldName) {
  return JSON.stringify([sheetName, fieldName]);
}

/**
 * `ref:` 가 가리키는 대상 필드의 키 집합.
 *
 * E004(대상 값이 있는지)와 E012(대상이 유일한지)가 같은 집합을 봐야 한다. 두 곳에서
 * 따로 모으면 갈라지는 순간 E004 가 검사하는 필드에 E012 가 유일성을 걸지 않고,
 * 그러면 참조가 어느 행을 가리키는지 모호해진 것을 아무도 알려주지 않는다.
 *
 * @param {object} ir
 * @returns {Set<string>} fieldKey 의 집합
 */
export function refTargetKeys(ir) {
  const keys = new Set();
  for (const sheet of ir.sheets) {
    for (const field of sheet.fields) {
      const leaf = baseType(field.type);
      if (leaf?.kind === 'ref') keys.add(fieldKey(leaf.sheet, leaf.field));
    }
  }
  return keys;
}

/**
 * 모든 데이터 시트의 잎 값을 순서대로 방문한다.
 *
 * 배열은 원소 단위로 풀어서 준다. 빈 값(null)은 건너뛴다 — nullable 이 비었거나
 * 캐스팅이 실패한 자리이고, 어느 규칙도 그 자리를 검사하지 않는다.
 *
 * @param {object} ir
 * @param {(visit: {sheet: object, field: object, row: object, cell: string, value: *, type: object, index: number|null}) => void} visit
 */
export function forEachValue(ir, visit) {
  for (const sheet of ir.sheets) {
    for (const row of sheet.rows) {
      for (const field of sheet.fields) {
        const cell = row.cells[field.name];
        const type = baseType(field.type);
        const value = row.values[field.name];

        if (Array.isArray(value)) {
          for (const [index, element] of value.entries()) {
            if (element === null || element === undefined) continue;
            visit({ sheet, field, row, cell, value: element, type, index });
          }
          continue;
        }

        if (value === null || value === undefined) continue;
        visit({ sheet, field, row, cell, value, type, index: null });
      }
    }
  }
}
