// IR → C# 집계 로더 (GameDataTables.cs)
//
// 사양: docs/spec.md §6.3
//
// 워크북이 하나인 프로젝트를 위한 편의 클래스다. 호출부에서
// GameDataTable<Monster, int> 를 반복해 쓰지 않게 해 주는 것이 전부다.
//
// 조회 인덱스와 역직렬화는 runtime.js 가 낸 GameDataTable<T,TKey> 가 한다. 여기서
// 또 하면 두 곳이 갈라진다.
//
// **기본으로 내보내지 않는다.** 생성 파일 중 이 클래스만이 "이 워크북이 게임 데이터
// 전부다" 를 전제하고, §2.2 가 여러 워크북 병합을 제외했으므로 도구는 그것을 확인할
// 방법이 없다. 그래서 전제를 사용자가 명시하게 한다.
import { indexableKey } from './types.js';
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
 * 기본키를 Dictionary 의 키로 쓸 수 없는 시트는 GameDataTable 의 제약을 만족하지
 * 못하므로 목록으로만 노출한다.
 */
function describeTable(sheet, ir) {
  const key = indexableKey(sheet, ir);

  return {
    sheetName: sheet.name,
    className: sheet.className,
    property: `${sheet.className}Table`,
    parameter: `${lowerFirst(sheet.className)}Table`,
    // 인덱스를 만들 수 있으면 제네릭 테이블, 아니면 읽기 전용 목록이다.
    type:
      key === null
        ? `IReadOnlyList<${sheet.className}>`
        : `GameDataTable<${sheet.className}, ${key.csharpType}>`,
    loadExpression:
      key === null
        ? `GameDataJson.ReadRows<${sheet.className}>(readJson)`
        : `GameDataTable<${sheet.className}, ${key.csharpType}>.Load(readJson)`,
  };
}

function render(tables, namespace, loaderClass) {
  const one = INDENT;
  const two = INDENT.repeat(2);
  const three = INDENT.repeat(3);

  // 쓰지 않는 using 을 파일에 남기지 않는다. 역직렬화는 런타임이 하므로 여기에
  // Newtonsoft 는 필요 없다.
  const usings = ['using System;'];
  if (tables.some((table) => table.type.startsWith('IReadOnlyList<'))) {
    usings.push('using System.Collections.Generic;');
  }

  const body = [];

  for (const table of tables) {
    const summary = docComment(`${table.sheetName} 시트`, two);
    if (summary !== null) body.push(summary);
    body.push(`${two}public ${table.type} ${table.property} { get; }`);
    body.push('');
  }

  body.push(...constructor(tables, loaderClass, two, three));
  body.push('');
  body.push(...load(tables, loaderClass, two, three));

  return `${[
    ...usings,
    '',
    `namespace ${namespace}`,
    '{',
    `${one}/// <summary>생성된 데이터 테이블 모음입니다.</summary>`,
    `${one}public sealed class ${loaderClass}`,
    `${one}{`,
    ...body,
    `${one}}`,
    '}',
  ].join('\n')}\n`;
}

function constructor(tables, loaderClass, two, three) {
  if (tables.length === 0) return [`${two}private ${loaderClass}()`, `${two}{`, `${two}}`];

  const parameters = tables.map((table) => `${table.type} ${table.parameter}`);
  return [
    `${two}private ${loaderClass}(`,
    ...parameters.map(
      (parameter, index) => `${three}${parameter}${index === parameters.length - 1 ? ')' : ','}`,
    ),
    `${two}{`,
    ...tables.map((table) => `${three}${table.property} = ${table.parameter};`),
    `${two}}`,
  ];
}

function load(tables, loaderClass, two, three) {
  const lines = [
    `${two}/// <summary>테이블을 모두 읽어들입니다.</summary>`,
    `${two}/// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>`,
    `${two}public static ${loaderClass} Load(Func<string, string> readJson)`,
    `${two}{`,
    `${three}if (readJson == null) throw new ArgumentNullException(nameof(readJson));`,
    '',
  ];

  if (tables.length === 0) {
    lines.push(`${three}return new ${loaderClass}();`);
  } else {
    lines.push(`${three}return new ${loaderClass}(`);
    lines.push(
      ...tables.map(
        (table, index) =>
          `${three}${INDENT}${table.loadExpression}${index === tables.length - 1 ? ');' : ','}`,
      ),
    );
  }

  lines.push(`${two}}`);
  return lines;
}

/**
 * 첫 글자만 소문자로. 생성자 매개변수 이름에 쓴다.
 *
 * 한글은 대소문자가 없어 그대로 남는다 — `몬스터정보Table` 은 C# 식별자로 합법이다.
 */
function lowerFirst(text) {
  return text.length === 0 ? text : text[0].toLowerCase() + text.slice(1);
}
