// 셀 문자열 + TypeNode → 값
//
// 사양: docs/notation.md §3(스칼라), §3.2(datetime), §3.3(long), §5(셀 값 규칙)
//
// "숫자처럼 생겼으니 숫자" 는 없다. 캐스팅은 타입 표기가 지시하는 대로만 일어난다.
// 빈 셀에 기본값을 조용히 채우지 않는다 — 비어 있는 int 열이 0 으로 나가면
// 밸런스 데이터에서 가장 찾기 어려운 버그가 된다.
import { diagnostic } from '../ir/diagnostic.js';
import { DEFAULT_ARRAY_DELIMITER } from '../ir/schema.js';
import { formatIdentifier } from './type-notation.js';

const INTEGER = /^-?[0-9]+$/;
const DECIMAL = /^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const BOOL_TRUE = new Set(['true', '1', 'y', 'o']);
const BOOL_FALSE = new Set(['false', '0', 'n', 'x']);

// 엑셀 시리얼 1 = 1900-01-01. 1900 년을 윤년으로 잘못 처리하는 호환성 버그 때문에
// 기준점은 1899-12-30 이고, 그 보정이 유효한 구간은 시리얼 61 부터다.
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const EXCEL_LEAP_BUG_LAST_SERIAL = 60;
const MS_PER_DAY = 86400000;

/**
 * @param {string|undefined|null} cellText 시트에서 읽은 문자열
 * @param {object} type TypeNode
 * @param {{cell: string, delimiter?: string, resolveRef?: Function}} context
 * @returns {{value: *, diagnostics: Array<object>}}
 */
export function parseValue(cellText, type, context) {
  const ctx = {
    delimiter: DEFAULT_ARRAY_DELIMITER,
    resolveRef: () => null,
    ...context,
  };
  if (typeof ctx.delimiter !== 'string' || ctx.delimiter.length !== 1) {
    throw new Error(`배열 구분자는 한 글자여야 합니다: ${JSON.stringify(ctx.delimiter)}`);
  }

  const diagnostics = [];
  const text = typeof cellText === 'string' ? cellText.trim() : '';
  const value = parseNode(text, type, ctx, diagnostics, text === '');
  return { value, diagnostics };
}

/**
 * 타입 표기를 사람이 읽는 문자열로 되돌린다. 진단 메시지에 쓴다.
 *
 * @param {object} node TypeNode
 * @returns {string}
 */
export function formatType(node) {
  switch (node?.kind) {
    case 'scalar':
      return node.name;
    case 'nullable':
      return `${formatType(node.of)}?`;
    case 'array':
      return `${formatType(node.of)}[]`;
    case 'loc':
      return 'loc';
    case 'enum':
      return `enum:${formatIdentifier(node.name)}`;
    case 'ref':
      return `ref:${formatIdentifier(node.sheet)}.${formatIdentifier(node.field)}`;
    default:
      return '알 수 없는 타입';
  }
}

/**
 * @param {boolean} blank 이 값이 "빈 값" 인지. 배열 원소는 따옴표 여부가 이를 바꾼다
 */
function parseNode(text, type, ctx, diagnostics, blank) {
  if (blank) return parseBlank(type, ctx, diagnostics);

  switch (type.kind) {
    case 'nullable':
      return parseNode(text, type.of, ctx, diagnostics, false);
    case 'array':
      return parseArray(text, type.of, ctx, diagnostics);
    case 'scalar':
      return parseScalar(text, type, ctx, diagnostics);
    case 'loc':
    case 'enum':
      // 키 형식(W106)과 멤버 존재(E009) 확인은 IR 이 만들어진 뒤에 한다.
      return text;
    case 'ref':
      return parseRef(text, type, ctx, diagnostics);
    default:
      diagnostics.push(fail('E006', ctx, `처리할 수 없는 타입입니다: ${formatType(type)}`));
      return null;
  }
}

/** notation.md §5.2 의 표 그대로다. */
function parseBlank(type, ctx, diagnostics) {
  if (type.kind === 'nullable') return null;
  if (type.kind === 'array') return [];

  diagnostics.push(
    fail(
      'E003',
      ctx,
      `필수 값이 비었습니다: ${formatType(type)}`,
      '비워도 되는 열이면 타입 표기에 ? 를 붙이십시오',
    ),
  );
  return null;
}

function parseArray(text, elementType, ctx, diagnostics) {
  const { parts, unterminated } = splitElements(text, ctx.delimiter);

  if (unterminated) {
    diagnostics.push(fail('E006', ctx, '큰따옴표가 닫히지 않았습니다', text));
    return [];
  }

  const values = [];
  for (const part of parts) {
    // 따옴표로 감싼 원소는 안쪽 공백을 보존한다. CSV 와 같은 규칙이다.
    const elementText = part.quoted ? part.text : part.text.trim();
    const blank = !part.quoted && elementText === '';

    if (blank && elementType.kind !== 'nullable') {
      // 2001,,2003 은 대개 오타다. 의도적으로 비우려면 원소 nullable 을 명시한다.
      diagnostics.push(
        fail('E006', ctx, '배열에 빈 원소가 있습니다', `의도한 것이면 ${formatType(elementType)}?[] 로 적으십시오`),
      );
      continue;
    }

    values.push(parseNode(elementText, elementType, ctx, diagnostics, blank));
  }

  return values;
}

/**
 * 셀 안의 배열을 원소로 나눈다.
 *
 * split(delimiter) 로는 안 된다. notation.md §5.3 이 `"a,b",c` 를 두 원소로,
 * `"say ""hi"""` 를 따옴표가 든 한 원소로 규정하기 때문이다. 따옴표 사용 여부를
 * 함께 돌려주는 이유는 `""`(명시적 빈 문자열)와 빈 원소를 구분할 단서가 그것뿐이기
 * 때문이다.
 */
function splitElements(text, delimiter) {
  const parts = [];
  let current = '';
  let quoted = false;
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      quoted = true;
    } else if (char === delimiter) {
      parts.push({ text: current, quoted });
      current = '';
      quoted = false;
    } else {
      current += char;
    }
  }

  parts.push({ text: current, quoted });
  return { parts, unterminated: inQuotes };
}

function parseScalar(text, type, ctx, diagnostics) {
  switch (type.name) {
    case 'int':
      return parseInteger(text, type, ctx, diagnostics, INT32_MIN, INT32_MAX, '32비트 정수 범위');
    case 'long':
      // notation.md §3.3: JavaScript 의 수는 2^53 까지만 정확하다.
      return parseInteger(
        text,
        type,
        ctx,
        diagnostics,
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        '안전 정수 범위',
      );
    case 'float':
    case 'double':
      return parseDecimal(text, type, ctx, diagnostics);
    case 'bool':
      return parseBool(text, ctx, diagnostics);
    case 'string':
      return text;
    case 'datetime':
      return parseDateTime(text, ctx, diagnostics);
    default:
      diagnostics.push(fail('E006', ctx, `알 수 없는 스칼라 타입입니다: ${type.name}`));
      return null;
  }
}

function parseInteger(text, type, ctx, diagnostics, min, max, rangeLabel) {
  if (!INTEGER.test(text)) {
    diagnostics.push(castFailure(ctx, text, type, '정수여야 합니다'));
    return null;
  }

  const value = Number(text);
  if (value < min || value > max) {
    diagnostics.push(castFailure(ctx, text, type, `${rangeLabel}(${min} ~ ${max})를 벗어납니다`));
    return null;
  }
  return value;
}

function parseDecimal(text, type, ctx, diagnostics) {
  if (!DECIMAL.test(text)) {
    diagnostics.push(castFailure(ctx, text, type, '소수여야 합니다'));
    return null;
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    diagnostics.push(castFailure(ctx, text, type, '표현할 수 있는 범위를 벗어납니다'));
    return null;
  }
  return value;
}

function parseBool(text, ctx, diagnostics) {
  const lowered = text.toLowerCase();
  if (BOOL_TRUE.has(lowered)) return true;
  if (BOOL_FALSE.has(lowered)) return false;

  diagnostics.push(
    fail(
      'E006',
      ctx,
      `bool 로 읽을 수 없습니다: ${text}`,
      '참은 TRUE·true·1·Y·O, 거짓은 FALSE·false·0·N·X 입니다',
    ),
  );
  return null;
}

/**
 * 엑셀 시리얼 또는 ISO 8601 → UTC ISO 8601 문자열.
 *
 * Date 를 인자와 함께 만드는 것은 결정적이다. CLAUDE.md 규칙 6 이 막는 것은
 * 현재 시각을 읽는 Date.now() 와 인자 없는 new Date() 다.
 */
function parseDateTime(text, ctx, diagnostics) {
  if (DECIMAL.test(text)) {
    const serial = Number(text);
    if (serial <= EXCEL_LEAP_BUG_LAST_SERIAL) {
      diagnostics.push(
        fail(
          'E006',
          ctx,
          `엑셀 날짜 시리얼 ${serial} 은 받지 않습니다`,
          '엑셀이 1900년을 윤년으로 잘못 처리하는 구간(시리얼 60 이하)이라 하루가 어긋납니다',
        ),
      );
      return null;
    }
    return new Date(EXCEL_EPOCH_UTC + Math.round(serial * MS_PER_DAY)).toISOString();
  }

  const isoDate = parseIso(text);
  if (isoDate === null) {
    diagnostics.push(
      fail(
        'E006',
        ctx,
        `날짜로 읽을 수 없습니다: ${text}`,
        '엑셀 날짜 셀이거나 ISO 8601(2026-07-29 또는 2026-07-29T12:00:00Z)이어야 합니다',
      ),
    );
    return null;
  }
  return isoDate;
}

function parseIso(text) {
  const match = ISO_DATETIME.exec(text);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '0', zone] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;

  const milliseconds = Number(fraction.padEnd(3, '0'));
  let time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );

  // 2026-02-30 처럼 실재하지 않는 날짜는 Date.UTC 가 조용히 다음 달로 넘긴다.
  const check = new Date(time);
  if (
    check.getUTCFullYear() !== Number(year) ||
    check.getUTCMonth() !== Number(month) - 1 ||
    check.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  if (zone && zone !== 'Z') {
    const offsetMinutes = Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6));
    time += (zone[0] === '-' ? 1 : -1) * offsetMinutes * 60000;
  }

  return new Date(time).toISOString();
}

/**
 * ref 의 값은 대상 필드의 타입으로 캐스팅한다 (notation.md §4.3).
 *
 * 대상을 못 찾아도 여기서는 진단하지 않는다. E008 은 헤더 단계에서 필드마다
 * 한 번 나오고, 여기서 또 내면 데이터 행 수만큼 같은 오류가 쌓인다.
 */
function parseRef(text, type, ctx, diagnostics) {
  const target = ctx.resolveRef(type.sheet, type.field);

  // 참조의 참조는 따라가지 않는다. 순환 참조가 허용되므로 끝까지 따라가면
  // 멈추지 않는다.
  if (!target || target.kind === 'ref') return text;

  return parseNode(text, target, ctx, diagnostics, false);
}

function castFailure(ctx, text, type, reason) {
  return fail('E006', ctx, `${formatType(type)} 로 읽을 수 없습니다: ${text}`, reason);
}

function fail(code, ctx, message, detail) {
  return diagnostic(code, ctx.cell, message, detail);
}
