// 헤더 행 → 필드 정의 목록
//
// 사양: docs/spec.md §3.1(헤더 구성), §3.2(무시 열), §4(IR), §5.5(파싱 단계 진단)
//
// 2차원 문자열 배열만 받는다. SheetJS 도 DOM 도 모른다.
import { diagnostic } from '../ir/diagnostic.js';
import { toFieldIdentifier } from '../ir/naming.js';
import { isIgnoredFieldName, normalizeLayout } from '../ir/schema.js';
import { cellRef, columnLetter } from '../util/a1.js';
import { parseTypeNotation } from './type-notation.js';

/**
 * @param {string} sheetName 원본 시트명
 * @param {string[][]} rows 시트 전체 (0번 원소가 1행)
 * @param {{layout?: object}} [options]
 * @returns {{fields: Array<object>, diagnostics: Array<object>}}
 */
export function parseHeader(sheetName, rows, { layout } = {}) {
  const resolved = normalizeLayout(layout);
  const fields = [];
  const diagnostics = [];

  const nameCells = rowAt(rows, resolved.nameRow);
  const typeCells = rowAt(rows, resolved.typeRow);
  const commentCells = resolved.commentRow === null ? [] : rowAt(rows, resolved.commentRow);

  // 필드명 행보다 타입 행이 넓을 수 있다. 그 열은 "타입은 있는데 필드명이 빔"
  // 이므로 E001 로 잡아야 하고, 그러려면 두 행의 너비를 함께 봐야 한다.
  const width = Math.max(nameCells.length, typeCells.length);
  const seen = new Set();

  for (let column = 0; column < width; column += 1) {
    const name = text(nameCells[column]);
    const typeText = text(typeCells[column]);
    const nameCell = cellRef(sheetName, resolved.nameRow, column);
    const typeCell = cellRef(sheetName, resolved.typeRow, column);

    if (isIgnoredFieldName(name)) {
      // # 로 시작하는 열은 의도적으로 비워둔 계산용 열이라 타입이 있어도 넘어간다.
      // 필드명이 통째로 빈 채 타입만 있는 것은 열을 지우다 만 흔적이다.
      if (name === '' && typeText !== '') {
        diagnostics.push(
          diagnostic('E001', nameCell, '타입은 있는데 필드명이 비었습니다', `타입 표기: ${typeText}`),
        );
      }
      continue;
    }

    if (seen.has(name)) {
      // 뒤엣것을 버린다. 남겨두면 JSON 키와 C# 필드명이 충돌한다.
      diagnostics.push(
        diagnostic('E001', nameCell, `필드명이 중복되었습니다: ${name}`, '이 열은 무시됩니다'),
      );
      continue;
    }

    if (typeText === '') {
      diagnostics.push(
        diagnostic('E002', typeCell, `타입 표기가 없습니다: ${name}`, '필드명이 있으면 타입도 있어야 합니다'),
      );
      continue;
    }

    let type;
    try {
      type = parseTypeNotation(typeText);
    } catch (error) {
      diagnostics.push(diagnostic('E005', typeCell, error.message, `${name} 열`));
      continue;
    }

    // 파서는 임의 깊이를 파싱하지만 v1 에미터는 깊이 1까지다 (notation.md §2.2).
    if (arrayDepth(type) > 1) {
      diagnostics.push(
        diagnostic('E013', typeCell, `지원하지 않는 타입입니다: ${typeText}`, '배열 중첩은 한 겹까지입니다'),
      );
      continue;
    }

    seen.add(name);
    fields.push({
      name,
      // 리포트는 사람이 시트에서 찾을 수 있게 name 을, 출력은 identifier 를 쓴다.
      // 하나만 들고 있으면 둘 중 하나가 깨진다 (spec.md §4.1).
      // 쓸 수 없는 식별자(E011)와 예약어(E007)는 검증 단계가 잡는다 — 여기서
      // 이름을 바꾸지 않는다.
      identifier: toFieldIdentifier(name),
      column,
      columnLetter: columnLetter(column),
      type,
      comment: text(commentCells[column]),
      cell: nameCell,
    });
  }

  return { fields, diagnostics };
}

/** 엑셀 행 번호(1부터)로 행을 꺼낸다. */
function rowAt(rows, rowNumber) {
  const row = rows?.[rowNumber - 1];
  return Array.isArray(row) ? row : [];
}

/** 헤더 셀의 앞뒤 공백을 없앤다. 값 셀의 공백 정책은 value-parser 소관이다. */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function arrayDepth(node) {
  let depth = 0;
  for (let current = node; current; current = current.of) {
    if (current.kind === 'array') depth += 1;
  }
  return depth;
}
