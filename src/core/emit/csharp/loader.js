// IR → C# 로더 (GameDataTables.cs)
//
// 사양: docs/spec.md §6.3
//
// Load 가 파일 읽기를 직접 하지 않고 함수를 받는 이유는, Resources·Addressables·
// StreamingAssets·테스트용 문자열 중 무엇을 쓸지는 프로젝트가 정할 일이기 때문이다.
// core/ 가 ports.js 로 외부 기능을 주입받는 것과 같은 발상이다.
import { toCSharpType } from './types.js';
import { DEFAULT_NAMESPACE, INDENT, docComment } from './writer.js';

const DEFAULT_LOADER_CLASS = 'GameDataTables';

/**
 * @param {object} ir
 * @param {{namespace?: string, loaderClassName?: string}} [options]
 * @returns {Array<{fileName: string, text: string}>} 항상 파일 하나
 */
export function emitCSharpLoader(ir, options = {}) {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const loaderClass = options.loaderClassName ?? DEFAULT_LOADER_CLASS;
  const tables = ir.sheets.map((sheet) => describeTable(sheet, ir));

  return [{ fileName: `${loaderClass}.cs`, text: render(tables, namespace, loaderClass) }];
}

/**
 * 시트 하나를 로더가 쓸 형태로 정리한다.
 *
 * 기본키가 배열이면 조회 인덱스를 만들지 않는다 — Dictionary 의 키로 List<T> 를
 * 쓸 수 없다. 그런 시트는 목록으로만 노출한다.
 */
function describeTable(sheet, ir) {
  const key = sheet.fields.find((field) => field.name === sheet.primaryKey) ?? null;
  const keyType = key === null ? null : toCSharpType(key.type, ir);
  const indexable = keyType !== null && !keyType.startsWith('List<');

  return {
    sheetName: sheet.name,
    className: sheet.className,
    property: `${sheet.className}Table`,
    rowsParameter: `${lowerFirst(sheet.className)}Rows`,
    indexField: `_${lowerFirst(sheet.className)}ById`,
    key: indexable ? { type: keyType, member: key.identifier } : null,
  };
}

function render(tables, namespace, loaderClass) {
  const lines = [
    'using System;',
    'using System.Collections.Generic;',
    // §11.1 이 확정한 전제. manifest.json 에 com.unity.nuget.newtonsoft-json 한 줄이 필요하다.
    'using Newtonsoft.Json;',
    '',
    `namespace ${namespace}`,
    '{',
    `${INDENT}/// <summary>생성된 데이터 테이블 모음입니다.</summary>`,
    `${INDENT}public sealed class ${loaderClass}`,
    `${INDENT}{`,
  ];

  const body = [
    ...properties(tables),
    ...indexFields(tables),
    ...constructor(tables, loaderClass),
    ...lookups(tables),
    ...load(tables, loaderClass),
    ...readTable(),
    ...rowsWrapper(),
  ];

  lines.push(...body, `${INDENT}}`, '}');
  return `${lines.join('\n')}\n`;
}

function properties(tables) {
  const lines = [];
  for (const table of tables) {
    if (lines.length > 0) lines.push('');
    const summary = docComment(`${table.sheetName} 시트`, INDENT.repeat(2));
    if (summary !== null) lines.push(summary);
    lines.push(
      `${INDENT.repeat(2)}public IReadOnlyList<${table.className}> ${table.property} { get; }`,
    );
  }
  return lines;
}

function indexFields(tables) {
  const indexed = tables.filter((table) => table.key !== null);
  if (indexed.length === 0) return [];

  return [
    '',
    ...indexed.map(
      (table) =>
        `${INDENT.repeat(2)}private readonly Dictionary<${table.key.type}, ${table.className}> ${table.indexField};`,
    ),
  ];
}

function constructor(tables, loaderClass) {
  const parameters = tables
    .map((table) => `List<${table.className}> ${table.rowsParameter}`)
    .join(', ');
  const lines = ['', `${INDENT.repeat(2)}private ${loaderClass}(${parameters})`, `${INDENT.repeat(2)}{`];

  for (const table of tables) {
    lines.push(`${INDENT.repeat(3)}${table.property} = ${table.rowsParameter};`);
  }

  for (const table of tables) {
    if (table.key === null) continue;
    lines.push(
      '',
      `${INDENT.repeat(3)}${table.indexField} = new Dictionary<${table.key.type}, ${table.className}>(${table.rowsParameter}.Count);`,
      // 인덱서로 담는다. 중복 키는 E012 가 내보내기 단계에서 이미 막으므로,
      // 출시된 게임이 데이터 문제로 죽는 것보다 마지막 값을 쓰는 편이 낫다.
      `${INDENT.repeat(3)}foreach (var row in ${table.rowsParameter}) ${table.indexField}[row.${table.key.member}] = row;`,
    );
  }

  lines.push(`${INDENT.repeat(2)}}`);
  return lines;
}

function lookups(tables) {
  const lines = [];

  for (const table of tables) {
    if (table.key === null) continue;
    const { type, member } = table.key;
    lines.push(
      '',
      // 조사를 라틴 식별자가 아니라 한국어 낱말에 붙인다. "Monster 를" 은 읽는
      // 방식에 따라 을/를이 갈리고 어느 쪽을 골라도 절반은 틀린다.
      `${INDENT.repeat(2)}/// <summary>${table.className} 행을 기본키로 찾습니다. 없으면 KeyNotFoundException 입니다.</summary>`,
      `${INDENT.repeat(2)}public ${table.className} Get${table.className}(${type} ${member})`,
      `${INDENT.repeat(2)}{`,
      `${INDENT.repeat(3)}return ${table.indexField}[${member}];`,
      `${INDENT.repeat(2)}}`,
      '',
      `${INDENT.repeat(2)}/// <summary>${table.className} 행을 기본키로 찾습니다. 없으면 false 입니다.</summary>`,
      `${INDENT.repeat(2)}public bool TryGet${table.className}(${type} ${member}, out ${table.className} value)`,
      `${INDENT.repeat(2)}{`,
      `${INDENT.repeat(3)}return ${table.indexField}.TryGetValue(${member}, out value);`,
      `${INDENT.repeat(2)}}`,
    );
  }

  return lines;
}

function load(tables, loaderClass) {
  const arguments_ = tables.map(
    (table) => `${INDENT.repeat(4)}ReadTable<${table.className}>(readJson, "${table.className}")`,
  );

  return [
    '',
    `${INDENT.repeat(2)}/// <summary>테이블을 읽어들입니다.</summary>`,
    `${INDENT.repeat(2)}/// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>`,
    `${INDENT.repeat(2)}public static ${loaderClass} Load(Func<string, string> readJson)`,
    `${INDENT.repeat(2)}{`,
    `${INDENT.repeat(3)}if (readJson == null) throw new ArgumentNullException(nameof(readJson));`,
    '',
    `${INDENT.repeat(3)}return new ${loaderClass}(`,
    `${arguments_.join(',\n')});`,
    `${INDENT.repeat(2)}}`,
  ];
}

function readTable() {
  return [
    '',
    `${INDENT.repeat(2)}private static List<T> ReadTable<T>(Func<string, string> readJson, string name)`,
    `${INDENT.repeat(2)}{`,
    `${INDENT.repeat(3)}var table = JsonConvert.DeserializeObject<Table<T>>(readJson(name));`,
    // 파일이 아직 없는 상태로 게임을 켜는 일이 흔하다. 여기서 죽으면 원인을 찾기 어렵다.
    `${INDENT.repeat(3)}return table?.rows ?? new List<T>();`,
    `${INDENT.repeat(2)}}`,
  ];
}

function rowsWrapper() {
  return [
    '',
    // 생성 코드의 주석에서 이 저장소의 사양을 참조하지 않는다. 이 파일을 받는
    // 사람에게 그 문서는 없다.
    `${INDENT.repeat(2)}/// <summary>JSON 최상위의 rows 래퍼입니다.</summary>`,
    `${INDENT.repeat(2)}private sealed class Table<T>`,
    `${INDENT.repeat(2)}{`,
    `${INDENT.repeat(3)}public List<T> rows;`,
    `${INDENT.repeat(2)}}`,
  ];
}

function lowerFirst(text) {
  const [first, ...rest] = [...text];
  return first === undefined ? '' : first.toLowerCase() + rest.join('');
}
