// IR → C# 데이터 클래스
//
// 사양: docs/spec.md §6.3
//
// 필드명은 변환된 식별자를 쓰고 주석은 원본을 보존한다. 그래야 생성 코드를 보는
// 사람이 시트의 어느 열인지 찾아갈 수 있다.
import { toCsvReadExpression } from './csv-read.js';
import { indexableKey, toCSharpType } from './types.js';
import { DEFAULT_NAMESPACE, INDENT, docComment } from './writer.js';

/**
 * @param {object} ir
 * @param {{namespace?: string, csv?: boolean, arrayDelimiter?: string}} [options]
 *   csv 를 켜면 ICsvReadable 구현이 함께 난다
 * @returns {Array<{fileName: string, text: string}>}
 */
export function emitCSharpClasses(ir, options = {}) {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;

  return ir.sheets.map((sheet) => ({
    fileName: `${sheet.className}.cs`,
    text: render(sheet, ir, namespace, options),
  }));
}

function render(sheet, ir, namespace, options) {
  const members = sheet.fields.map((field) => ({
    field,
    csharpType: toCSharpType(field.type, ir),
  }));

  // 쓰지 않는 네임스페이스를 파일에 남기지 않는다.
  const usings = ['using System;'];
  if (members.some((member) => member.csharpType.includes('List<'))) {
    usings.push('using System.Collections.Generic;');
  }

  // 기본키를 Dictionary 의 키로 쓸 수 있는 시트만 IGameData 를 구현한다. 배열
   // 기본키는 인덱스를 만들 수 없어 GameDataTable 의 제약을 만족하지 못한다.
  const key = indexableKey(sheet, ir);
  const withCsv = options.csv === true;

  const interfaces = [
    ...(key === null ? [] : [`IGameData<${key.csharpType}>`]),
    ...(withCsv ? ['ICsvReadable'] : []),
  ];
  const inherits = interfaces.length === 0 ? '' : ` : ${interfaces.join(', ')}`;

  const body = [
    // 클래스 요약은 원본 시트명을 쓴다. 생성 코드에서 시트를 찾아갈 수 있어야 한다.
    `${INDENT}/// <summary>${sheet.name} 시트의 한 행입니다.</summary>`,
    `${INDENT}[Serializable]`,
    `${INDENT}public sealed class ${sheet.className}${inherits}`,
    `${INDENT}{`,
  ];

  for (const [index, member] of members.entries()) {
    if (index > 0) body.push('');
    const summary = docComment(describe(member.field), INDENT.repeat(2));
    if (summary !== null) body.push(summary);
    body.push(`${INDENT.repeat(2)}public ${member.csharpType} ${member.field.identifier};`);
  }

  if (key !== null) {
    // 명시적 구현이라 시트에 Key 열이 있어도 필드와 부딪히지 않는다 (spec §6.3).
    // 필드 뒤에 두어 "필드 순서 = 시트 열 순서" 를 흐트리지 않는다.
    body.push('');
    body.push(`${INDENT.repeat(2)}/// <summary>기본키입니다 (${sheet.primaryKey}).</summary>`);
    body.push(
      `${INDENT.repeat(2)}${key.csharpType} IGameData<${key.csharpType}>.Key => ${key.field.identifier};`,
    );
  }

  if (withCsv) {
    // 명시적 구현이라 시트에 ReadCsvRow 라는 열이 있어도 부딪히지 않는다.
    // 대입 순서는 시트 열 순서다 — 읽는 사람이 헤더와 나란히 볼 수 있어야 한다.
    body.push('');
    body.push(`${INDENT.repeat(2)}/// <summary>CSV 한 행을 읽습니다 (spec §6.2).</summary>`);
    body.push(`${INDENT.repeat(2)}void ICsvReadable.ReadCsvRow(GameDataCsvRow row)`);
    body.push(`${INDENT.repeat(2)}{`);
    for (const member of members) {
      body.push(
        `${INDENT.repeat(3)}${member.field.identifier} = ${toCsvReadExpression(member.field, ir, options)};`,
      );
    }
    body.push(`${INDENT.repeat(2)}}`);
  }

  body.push(`${INDENT}}`);

  return `${[...usings, '', `namespace ${namespace}`, '{', ...body, '}'].join('\n')}\n`;
}

/**
 * 주석 본문. 표기가 알려주는 것을 괄호로 덧붙인다 (spec.md §6.3).
 *
 * `loc` 은 셀에 번역문이 아니라 키가 들어간다는 사실을, `ref` 는 어느 시트를
 * 가리키는지를 생성 코드만 보고도 알 수 있게 한다.
 */
function describe(field) {
  const annotation = annotate(field.type);
  if (annotation === null) return field.comment;
  return field.comment === '' ? annotation : `${field.comment} (${annotation})`;
}

function annotate(type) {
  for (let current = type; current; current = current.of) {
    if (current.kind === 'loc') return '로컬라이즈 키';
    if (current.kind === 'ref') return `→ ${current.sheet}.${current.field}`;
  }
  return null;
}
