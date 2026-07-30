// IR + 설정 → C# 호출부 예시
//
// 사양: docs/spec.md §6.3
//
// 생성된 파일은 "무엇이 있는지" 를 보여주지만 "무엇을 써야 하는지" 는 보여주지
// 않는다. GameDataTable<T, TKey> 를 보고 호출부를 짐작하게 두는 대신, 실제 시트명과
// 기본키 타입으로 옮겨 붙일 수 있는 예시를 만든다.
//
// 파일로 내보내지 않는다. 화면과 집계 로더의 머리말이 이것을 쓴다 — 둘이 갈라지지
// 않게 한 곳에서 만든다.
import { indexableKey } from './types.js';
import { DEFAULT_NAMESPACE } from './writer.js';

const DEFAULT_LOADER_CLASS = 'GameDataTables';

/**
 * @param {object} ir
 * @param {{namespace?: string, csv?: boolean, loader?: boolean, loaderClassName?: string}} [options]
 * @returns {string} C# 코드. 데이터 시트가 없으면 빈 문자열
 */
export function csharpUsage(ir, options = {}) {
  const sheet = ir.sheets[0];
  if (sheet === undefined) return '';

  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const key = indexableKey(sheet, ir);
  const csv = options.csv === true;
  const extension = csv ? 'csv' : 'json';

  const lines = [
    'using System;',
    'using System.Collections.Generic;',
    'using System.IO;',
    `using ${namespace};`,
    '',
    '// 1. 읽는 방법을 정합니다. Resources · Addressables · StreamingAssets 중',
    '//    무엇을 쓸지는 프로젝트가 정합니다.',
    `Func<string, string> read = name => File.ReadAllText($"Assets/GameData/{name}.${extension}");`,
    '',
  ];

  if (options.loader === true) {
    lines.push(...loaderUsage(sheet, key, options));
  } else {
    lines.push(...tableUsage(sheet, key, csv));
  }

  lines.push(
    '',
    '// 전체를 훑습니다. 순서는 시트의 행 순서 그대로입니다.',
    `foreach (var row in ${key === null ? 'rows' : 'table.Rows'})`,
    '{',
    `    // row.${sheet.fields[0].identifier}`,
    '}',
  );

  return `${lines.join('\n')}\n`;
}

/** 집계 로더를 켠 경우. 표를 한 번에 들고 다닌다. */
function loaderUsage(sheet, key, options) {
  const loaderClass = options.loaderClassName ?? DEFAULT_LOADER_CLASS;
  const lines = [
    '// 2. 표를 모두 읽습니다.',
    `var tables = ${loaderClass}.Load(read);`,
    '',
  ];

  if (key === null) {
    lines.push('// 3. 기본키가 배열이라 조회 인덱스가 없습니다. 목록으로 씁니다.');
    lines.push(`var rows = tables.${sheet.className}Table;`);
    return lines;
  }

  lines.push(`var table = tables.${sheet.className}Table;`);
  lines.push('');
  lines.push('// 3. 기본키로 찾습니다. 없으면 KeyNotFoundException 입니다.');
  lines.push(`${sheet.className} found = table.Get(${sample(sheet, key)});`);
  return lines;
}

/** 집계 로더 없이 표 하나만 쓰는 경우. */
function tableUsage(sheet, key, csv) {
  // 파일 이름은 클래스명과 같다 (spec §6.4). 인자로 넘기지 않는다.
  const note = `// 2. 표를 읽습니다. 파일 이름은 클래스명과 같습니다 (${sheet.className}.${csv ? 'csv' : 'json'}).`;

  if (key === null) {
    return [
      note,
      '//    기본키가 배열이라 조회 인덱스를 만들 수 없어 목록으로만 씁니다.',
      csv
        ? `List<${sheet.className}> rows = GameDataCsv.ReadRows<${sheet.className}>(read);`
        : `List<${sheet.className}> rows = GameDataJson.ReadRows<${sheet.className}>(read);`,
    ];
  }

  const type = `GameDataTable<${sheet.className}, ${key.csharpType}>`;
  const lines = [note];

  if (csv) {
    // CSV 는 읽기와 표 만들기가 나뉜다 — GameDataTable.Load 는 JSON 경로다.
    lines.push(`List<${sheet.className}> rows = GameDataCsv.ReadRows<${sheet.className}>(read);`);
    lines.push(`var table = new ${type}(rows);`);
  } else {
    lines.push(`var table = ${type}.Load(read);`);
  }

  lines.push('');
  lines.push('// 3. 기본키로 찾습니다. 없으면 KeyNotFoundException 입니다.');
  lines.push(`${sheet.className} found = table.Get(${sample(sheet, key)});`);
  lines.push('');
  lines.push('// 없을 수 있으면 TryGet 을 씁니다.');
  lines.push(`${sheet.className} other;`);
  lines.push(`if (table.TryGet(${sample(sheet, key)}, out other))`);
  lines.push('{');
  lines.push('}');
  return lines;
}

/**
 * 조회 예시에 쓸 기본키 값.
 *
 * 실제 첫 행의 값을 쓴다 — 옮겨 붙여 바로 돌려볼 수 있어야 한다. 행이 없으면
 * 타입에 맞는 자리표시자를 쓴다. 빈 인자는 컴파일되지 않는다.
 */
function sample(sheet, key) {
  const value = sheet.rows[0]?.values[key.field.name];

  if (value === undefined || value === null) {
    return key.csharpType === 'string' ? '"..."' : `default(${key.csharpType})`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}
