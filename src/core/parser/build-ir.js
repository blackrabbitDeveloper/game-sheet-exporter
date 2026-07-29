// 워크북 → IR
//
// 사양: docs/spec.md §3.2(시트 종류), §3.3(enum 정의), §3.4(기본키), §4(IR)
//
// 2패스로 조립한다. ref:Item.id 의 값을 캐스팅하려면 Item.id 의 타입을 알아야 하고
// 그 타입은 다른 시트의 헤더에 있으므로, 헤더를 전부 읽은 뒤에 값을 캐스팅한다
// (notation.md §4.3).
import { diagnostic } from '../ir/diagnostic.js';
import {
  DEFAULT_ARRAY_DELIMITER,
  IR_VERSION,
  classifySheet,
  normalizeLayout,
} from '../ir/schema.js';
import { cellRef, sheetRef } from '../util/a1.js';
import { parseHeader } from './header-parser.js';
import { formatType, parseValue } from './value-parser.js';

const ENUM_SHEET_PREFIX = 'enum.';
const ENUM_COLUMNS = ['name', 'value', 'comment'];
const INTEGER = /^-?[0-9]+$/;

/**
 * @param {{fileName: string, sheets: Array<{name: string, rows: string[][]}>}} workbook
 * @param {{layout?: object, arrayDelimiter?: string}} [options]
 * @returns {{ir: object, diagnostics: Array<object>}}
 */
export function buildIR(workbook, options = {}) {
  const layout = normalizeLayout(options.layout);
  const delimiter = options.arrayDelimiter ?? DEFAULT_ARRAY_DELIMITER;
  const diagnostics = [];

  // ── pass 1: 헤더와 enum 정의 ──────────────────────────────────────
  const enums = [];
  const dataSheets = [];

  for (const sheet of workbook.sheets) {
    const kind = classifySheet(sheet.name);
    if (kind === 'ignored') continue;

    if (kind === 'enum') {
      const built = buildEnum(sheet, layout, diagnostics);
      if (built) enums.push(built);
      continue;
    }

    const header = parseHeader(sheet.name, sheet.rows, { layout });
    diagnostics.push(...header.diagnostics);
    dataSheets.push({ name: sheet.name, rows: sheet.rows, fields: header.fields });
  }

  // 이 시점에 "Item.id 는 int" 를 알게 된다.
  const fieldTypes = new Map();
  for (const sheet of dataSheets) {
    for (const field of sheet.fields) {
      fieldTypes.set(referenceKey(sheet.name, field.name), field.type);
    }
  }
  const enumNames = new Set(enums.map((item) => item.name));
  const resolveRef = (sheetName, fieldName) =>
    fieldTypes.get(referenceKey(sheetName, fieldName)) ?? null;

  // E008 은 필드마다 한 번만 낸다. 행마다 내면 10,000행 시트에서 같은 오류가
  // 10,000개 쌓여 리포트가 쓸모없어진다.
  for (const sheet of dataSheets) {
    for (const field of sheet.fields) {
      checkTargets(field, fieldTypes, enumNames, diagnostics);
    }
  }

  // ── pass 2: 데이터 행 캐스팅 ──────────────────────────────────────
  const sheets = dataSheets.map((sheet) => ({
    name: sheet.name,
    primaryKey: sheet.fields[0]?.name ?? null,
    fields: sheet.fields,
    rows: buildRows(sheet, layout, delimiter, resolveRef, diagnostics),
  }));

  return {
    ir: {
      irVersion: IR_VERSION,
      // 원본 파일에 대한 정보이므로 무시 시트를 뺀 수가 아니다.
      source: { fileName: workbook.fileName, sheetCount: workbook.sheets.length },
      layout,
      enums,
      sheets,
    },
    diagnostics,
  };
}

function buildRows(sheet, layout, delimiter, resolveRef, diagnostics) {
  const rows = [];
  const columns = sheet.fields.map((field) => field.column);

  for (let rowNumber = layout.dataStartRow; rowNumber <= sheet.rows.length; rowNumber += 1) {
    const cells = sheet.rows[rowNumber - 1];

    // 필드 열이 전부 비었으면 데이터가 없는 행이다. 무시 열의 값은 보지 않는다 —
    // "# 여기부터 신규" 같은 구분선을 데이터 행으로 읽으면 E003 이 무더기로 난다.
    if (isBlankAt(cells, columns)) continue;

    const values = {};
    const cellRefs = {};

    for (const field of sheet.fields) {
      const cell = cellRef(sheet.name, rowNumber, field.column);
      const parsed = parseValue(cells?.[field.column], field.type, { cell, delimiter, resolveRef });
      diagnostics.push(...parsed.diagnostics);
      // 키 순서는 시트 열 순서다. 다만 소비자는 이 객체의 키 순서가 아니라
      // fields 배열을 돌아야 한다 — 숫자로만 이뤄진 필드명은 JavaScript 객체가
      // 앞으로 당겨 넣기 때문이다.
      values[field.name] = parsed.value;
      cellRefs[field.name] = cell;
    }

    rows.push({ row: rowNumber, values, cells: cellRefs });
  }

  return rows;
}

/**
 * enum 정의 시트를 읽는다 (spec.md §3.3).
 *
 * 열은 필드명으로 찾고 타입 행은 읽지 않는다. 이 시트의 스키마는 도구가 정하는
 * 것이라 사용자가 바꿀 수 없다.
 */
function buildEnum(sheet, layout, diagnostics) {
  const name = sheet.name.slice(ENUM_SHEET_PREFIX.length);
  const columns = findEnumColumns(rowAt(sheet.rows, layout.nameRow));

  if (columns.name === null) {
    diagnostics.push(
      diagnostic(
        'E010',
        sheetRef(sheet.name),
        `enum 정의 시트에 name 열이 없습니다: ${sheet.name}`,
        `${layout.nameRow}행에 name · value · comment 열을 두십시오`,
      ),
    );
    return null;
  }

  const members = [];
  const seenNames = new Set();
  const seenValues = new Set();
  const used = [columns.name, columns.value, columns.comment].filter((index) => index !== null);
  let previous = null;

  for (let rowNumber = layout.dataStartRow; rowNumber <= sheet.rows.length; rowNumber += 1) {
    const cells = sheet.rows[rowNumber - 1];
    if (isBlankAt(cells, used)) continue;

    const memberName = text(cells?.[columns.name]);
    const nameCell = cellRef(sheet.name, rowNumber, columns.name);

    if (memberName === '') {
      diagnostics.push(diagnostic('E010', nameCell, 'enum 멤버 이름이 비었습니다', `${sheet.name} 시트`));
      continue;
    }
    if (seenNames.has(memberName)) {
      diagnostics.push(
        diagnostic('E010', nameCell, `enum 멤버 이름이 중복되었습니다: ${memberName}`, `${sheet.name} 시트`),
      );
      continue;
    }

    const valueText = columns.value === null ? '' : text(cells?.[columns.value]);
    const valueCell = columns.value === null ? nameCell : cellRef(sheet.name, rowNumber, columns.value);
    let value;

    if (valueText === '') {
      // 생략하면 이전 멤버 + 1, 첫 멤버면 0.
      value = previous === null ? 0 : previous + 1;
    } else if (!INTEGER.test(valueText)) {
      diagnostics.push(
        diagnostic('E010', valueCell, `enum 값은 정수여야 합니다: ${valueText}`, `${memberName} 멤버`),
      );
      continue;
    } else {
      value = Number(valueText);
    }

    if (seenValues.has(value)) {
      // 값이 겹치면 저장된 세이브 데이터가 다른 의미가 된다.
      diagnostics.push(
        diagnostic('E010', valueCell, `enum 값이 중복되었습니다: ${value}`, `${memberName} 멤버`),
      );
      continue;
    }

    seenNames.add(memberName);
    seenValues.add(value);
    previous = value;
    members.push({
      name: memberName,
      value,
      comment: columns.comment === null ? '' : text(cells?.[columns.comment]),
      cell: nameCell,
    });
  }

  return { name, sheet: sheet.name, members };
}

function findEnumColumns(nameCells) {
  const found = { name: null, value: null, comment: null };
  for (let column = 0; column < nameCells.length; column += 1) {
    const label = text(nameCells[column]).toLowerCase();
    if (ENUM_COLUMNS.includes(label) && found[label] === null) found[label] = column;
  }
  return found;
}

/** 타입 안의 ref·enum 이 실제로 존재하는지 확인한다 (E008). */
function checkTargets(field, fieldTypes, enumNames, diagnostics) {
  for (const node of flatten(field.type)) {
    if (node.kind === 'ref' && !fieldTypes.has(referenceKey(node.sheet, node.field))) {
      diagnostics.push(
        diagnostic(
          'E008',
          field.cell,
          `참조 대상이 없습니다: ${node.sheet}.${node.field}`,
          `${field.name} 열의 타입 ${formatType(field.type)}`,
        ),
      );
    }
    if (node.kind === 'enum' && !enumNames.has(node.name)) {
      diagnostics.push(
        diagnostic(
          'E008',
          field.cell,
          `enum 정의 시트가 없습니다: ${ENUM_SHEET_PREFIX}${node.name}`,
          `${field.name} 열의 타입 ${formatType(field.type)}`,
        ),
      );
    }
  }
}

function flatten(node) {
  const nodes = [];
  for (let current = node; current; current = current.of) nodes.push(current);
  return nodes;
}

// 시트명과 필드명에 한글·공백·특수문자·점이 다 들어오므로 단순히 이어붙이면
// 'A.b' + 'c' 와 'A' + 'b.c' 가 같은 키가 된다. JSON 배열로 감싸 애매함을 없앤다.
function referenceKey(sheetName, fieldName) {
  return JSON.stringify([sheetName, fieldName]);
}

function rowAt(rows, rowNumber) {
  const row = rows?.[rowNumber - 1];
  return Array.isArray(row) ? row : [];
}

function isBlankAt(cells, columns) {
  return columns.every((column) => text(cells?.[column]) === '');
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
