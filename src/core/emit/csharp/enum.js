// IR → C# enum
//
// 사양: docs/spec.md §6.3
//
// 자동 증가로 계산된 값도 숫자로 명시한다. 멤버를 중간에 추가했을 때 뒤쪽 값이
// 밀리면 이미 저장된 세이브 데이터가 다른 의미가 된다 (spec.md §3.3).
import { DEFAULT_NAMESPACE, INDENT, docComment } from './writer.js';

/**
 * @param {object} ir
 * @param {{namespace?: string}} [options]
 * @returns {Array<{fileName: string, text: string}>}
 */
export function emitCSharpEnums(ir, options = {}) {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;

  return ir.enums.map((definition) => ({
    fileName: `${definition.className}.cs`,
    text: render(definition, namespace),
  }));
}

function render(definition, namespace) {
  const lines = [`namespace ${namespace}`, '{', `${INDENT}public enum ${definition.className}`, `${INDENT}{`];

  for (const member of definition.members) {
    const summary = docComment(member.comment, INDENT.repeat(2));
    if (summary !== null) lines.push(summary);
    lines.push(`${INDENT.repeat(2)}${member.name} = ${member.value},`);
  }

  lines.push(`${INDENT}}`, '}');
  return `${lines.join('\n')}\n`;
}
