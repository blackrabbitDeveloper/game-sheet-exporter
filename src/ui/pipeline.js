// 바이트 → IR → 진단 → 출력.
//
// 사양: docs/spec.md §7.1(설정), §3.1(헤더 행은 설정값), §5.1(E 가 있으면 내보내기 중단)
//
// core 를 부르는 곳은 여기 하나다. File 이 아니라 바이트를 받으므로 DOM 없이 Node 에서
// 그대로 돌아가고, 그래서 UI 작업에서도 테스트로 덮을 수 있다. 사양 §7.4 가 요구하는
// Worker 로 옮길 때 바뀌는 파일도 이 하나다.
import { DEFAULT_ARRAY_DELIMITER, DEFAULT_LAYOUT, normalizeLayout } from '../core/ir/schema.js';
import { hasErrors } from '../core/ir/diagnostic.js';
import { buildIR } from '../core/parser/build-ir.js';
import { readWorkbook } from '../core/parser/workbook-reader.js';
import { emitCsv } from '../core/emit/csv.js';
import { emitJson } from '../core/emit/json.js';
import { emitCSharpClasses } from '../core/emit/csharp/class.js';
import { emitCSharpEnums } from '../core/emit/csharp/enum.js';
import { emitCSharpLoader } from '../core/emit/csharp/loader.js';
import { DEFAULT_NAMESPACE } from '../core/emit/csharp/writer.js';
import { validate } from '../core/validate/validator.js';

export const DEFAULT_SETTINGS = Object.freeze({
  nameRow: DEFAULT_LAYOUT.nameRow,
  typeRow: DEFAULT_LAYOUT.typeRow,
  commentRow: DEFAULT_LAYOUT.commentRow,
  dataStartRow: DEFAULT_LAYOUT.dataStartRow,
  arrayDelimiter: DEFAULT_ARRAY_DELIMITER,
  namespace: DEFAULT_NAMESPACE,
  minify: false,
});

/**
 * 폼에서 온 값을 core 가 받는 옵션으로 바꾼다.
 *
 * 잘못된 설정은 진단이 아니라 예외로 알린다 — 시트 데이터의 문제가 아니라 설정의
 * 문제이고, 붙일 셀 좌표가 없다. schema.normalizeLayout 과 같은 방침이다.
 *
 * @param {Record<string, unknown>} [raw] 폼 값. 전부 문자열로 와도 된다
 * @returns {{layout: object, arrayDelimiter: string, namespace: string, minify: boolean}}
 */
export function normalizeSettings(raw = {}) {
  return {
    // 겹치는 행·데이터 시작 행 검사는 normalizeLayout 이 한다. 여기서 통과시켜
    // buildIR 까지 미루면 사용자가 파일을 고른 뒤에야 설정 오류를 보게 된다.
    layout: normalizeLayout({
      nameRow: readRow(raw.nameRow, '필드명 행', DEFAULT_SETTINGS.nameRow),
      typeRow: readRow(raw.typeRow, '타입 행', DEFAULT_SETTINGS.typeRow),
      commentRow: readCommentRow(raw),
      dataStartRow: readRow(raw.dataStartRow, '데이터 시작 행', DEFAULT_SETTINGS.dataStartRow),
    }),
    arrayDelimiter: readDelimiter(raw.arrayDelimiter),
    namespace: isBlank(raw.namespace) ? DEFAULT_SETTINGS.namespace : String(raw.namespace).trim(),
    minify: raw.minify === true || raw.minify === 'on',
  };
}

/**
 * 워크북 바이트를 읽어 진단과 출력을 낸다.
 *
 * 진단이 있어도 출력은 만든다. 사용자가 무엇이 나올지 보면서 오류를 고칠 수 있어야
 * 하고, 내보내기를 막는 판단은 `blocked` 로 따로 전한다.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {{fileName: string, settings?: Record<string, unknown>}} options
 * @returns {{ir: object, diagnostics: Array<object>, blocked: boolean, outputs: object}}
 */
export function runPipeline(bytes, { fileName, settings } = {}) {
  const resolved = normalizeSettings(settings);

  const workbook = readWorkbook(bytes, { fileName });
  const { ir, diagnostics: parseDiagnostics } = buildIR(workbook, {
    layout: resolved.layout,
    arrayDelimiter: resolved.arrayDelimiter,
  });
  const diagnostics = validate(ir, parseDiagnostics);

  return {
    ir,
    diagnostics,
    blocked: hasErrors(diagnostics),
    settings: resolved,
    outputs: {
      json: emitJson(ir, { minify: resolved.minify }),
      csv: emitCsv(ir, { arrayDelimiter: resolved.arrayDelimiter }),
      // 순서를 고정한다: enum → 클래스 → 로더. 미리보기 탭이 이 순서로 보인다.
      csharp: [
        ...emitCSharpEnums(ir, { namespace: resolved.namespace }),
        ...emitCSharpClasses(ir, { namespace: resolved.namespace }),
        ...emitCSharpLoader(ir, { namespace: resolved.namespace }),
      ],
    },
  };
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * 주석 행만 빈 값의 뜻이 다르다.
 *
 * 키가 없으면 "안 정했다" 이므로 기본값 3 이고, 키가 있는데 비어 있으면 "주석 행이
 * 없다" 이므로 null 이다. 사양 §3.1 이 주석 행을 없앨 수 있게 했고, 폼에는 칸이
 * 항상 있으므로 비운 것은 의도다. 둘을 뭉개면 주석 행을 없앨 방법이 사라진다.
 */
function readCommentRow(raw) {
  if (!('commentRow' in raw)) return DEFAULT_SETTINGS.commentRow;
  return isBlank(raw.commentRow) ? null : readRow(raw.commentRow, '주석 행', null);
}

/**
 * 행 번호 하나를 읽는다.
 *
 * @param {unknown} value
 * @param {string} what 오류 메시지에 쓸 이름
 * @param {number|null} fallback 빈 값일 때 쓸 값. null 이면 빈 값을 거부한다
 */
function readRow(value, what, fallback) {
  if (isBlank(value)) {
    if (fallback === null) throw new Error(`${what}을 입력하십시오`);
    return fallback;
  }

  const text = String(value).trim();
  // Number('') 는 0 이고 Number('1.5') 는 1.5 다. 전각 숫자('１')도 걸러야 하므로
  // 정규식으로 형태를 먼저 확인한다.
  if (!/^[0-9]+$/.test(text)) {
    throw new Error(`${what}은 1 이상의 정수여야 합니다: ${text}`);
  }

  const row = Number(text);
  if (row < 1) throw new Error(`${what}은 1 이상의 정수여야 합니다: ${text}`);
  return row;
}

function readDelimiter(value) {
  if (isBlank(value)) return DEFAULT_SETTINGS.arrayDelimiter;

  // 앞뒤 공백을 다듬지 않는다. 공백을 구분자로 쓰겠다는 설정일 수 있다.
  const delimiter = String(value);
  if (delimiter.includes('"')) {
    throw new Error('배열 구분자로 큰따옴표를 쓸 수 없습니다 — 원소 인용에 이미 쓰입니다');
  }
  return delimiter;
}
