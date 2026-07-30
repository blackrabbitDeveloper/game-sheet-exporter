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
import { mergeWorkbooks } from '../core/parser/merge.js';
import { readWorkbook } from '../core/parser/workbook-reader.js';
import { emitCsv } from '../core/emit/csv.js';
import { emitJson } from '../core/emit/json.js';
import { emitCSharpClasses } from '../core/emit/csharp/class.js';
import { emitCSharpEnums } from '../core/emit/csharp/enum.js';
import { emitCSharpLoader } from '../core/emit/csharp/loader.js';
import { emitCSharpRuntime } from '../core/emit/csharp/runtime.js';
import { csharpUsage } from '../core/emit/csharp/usage.js';
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
  // 집계 로더만이 "이 워크북이 게임 데이터 전부다" 를 전제한다 (spec §6.3).
  loader: false,
  loaderClassName: 'GameDataTables',
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
    loader: raw.loader === true || raw.loader === 'on',
    loaderClassName: isBlank(raw.loaderClassName)
      ? DEFAULT_SETTINGS.loaderClassName
      : String(raw.loaderClassName).trim(),
    // 켠 출력 형식. 안 넘기면 예전처럼 전부 낸다 — 형식 고르기는 UI 의 몫이고
    // 파이프라인을 직접 부르는 테스트가 매번 지정해야 하는 것은 아니다.
    formats: Array.isArray(raw.formats) ? [...raw.formats] : null,
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
  return runPipelineAll([{ bytes, fileName }], { settings });
}

/**
 * 여러 파일을 한 워크북처럼 읽는다 (사양 §3.5).
 *
 * 병합이 buildIR 앞이라 파일을 넘는 ref 도, 참조 무결성도, 유일성 검사도 그대로
 * 따라온다. 파일 순서는 파일명 정렬로 고정된다 — merge.js 가 한다.
 *
 * @param {Array<{bytes: ArrayBuffer|Uint8Array, fileName: string}>} inputs
 * @param {{settings?: Record<string, unknown>}} [options]
 * @returns {{ir: object, diagnostics: Array<object>, blocked: boolean, outputs: object}}
 */
export function runPipelineAll(inputs, { settings } = {}) {
  // 설정을 먼저 본다. 잘못된 설정으로 파일을 읽어봤자 버린다.
  const resolved = normalizeSettings(settings);

  const merged = mergeWorkbooks(
    inputs.map((item) => readWorkbook(item.bytes, { fileName: item.fileName })),
  );

  return run(merged, resolved, merged.diagnostics);
}

/**
 * 이미 2차원 문자열 배열로 펴진 워크북을 처리한다.
 *
 * 예시 데이터가 이 입구로 들어온다 (sample.js). xlsx 를 거치지 않으므로 UI 가
 * SheetJS 를 알 필요가 없고, 예시를 base64 덩어리로 소스에 박을 필요도 없다.
 *
 * @param {{fileName: string, sheets: Array<{name: string, rows: string[][]}>}} workbook
 * @param {{settings?: Record<string, unknown>}} [options] 폼에서 온 그대로의 설정
 * @returns {{ir: object, diagnostics: Array<object>, blocked: boolean, outputs: object}}
 */
export function runOnWorkbook(workbook, { settings } = {}) {
  return run(workbook, normalizeSettings(settings), []);
}

/**
 * 정규화가 끝난 설정으로 실제 작업을 한다.
 *
 * @param {Array<object>} earlier 병합 단계가 낸 진단 (E016)
 */
function run(workbook, resolved, earlier) {
  const { ir, diagnostics: parseDiagnostics } = buildIR(workbook, {
    layout: resolved.layout,
    arrayDelimiter: resolved.arrayDelimiter,
  });
  const diagnostics = validate(ir, [...earlier, ...parseDiagnostics]);

  return {
    ir,
    diagnostics,
    blocked: hasErrors(diagnostics),
    settings: resolved,
    // 생성 파일만 보면 호출부를 알 수 없다. 실제 시트명·기본키 타입이 들어간 예시를
    // 함께 낸다. 파일로 내보내지는 않는다.
    usage: csharpUsage(ir, {
      namespace: resolved.namespace,
      csv: resolved.formats !== null && resolved.formats.includes('csv'),
      loader: resolved.loader,
      loaderClassName: resolved.loaderClassName,
    }),
    outputs: {
      json: emitJson(ir, { minify: resolved.minify }),
      csv: emitCsv(ir, { arrayDelimiter: resolved.arrayDelimiter }),
      // 순서를 고정한다: 런타임 → enum → 클래스 → 집계. 미리보기 목록이 이 순서다.
      // 런타임이 먼저인 이유는 나머지가 그것에 의존하기 때문이다.
      csharp: emitCSharp(ir, resolved),
    },
  };
}

/**
 * C# 출력 묶음.
 *
 * CSV 를 함께 내보낼 때만 CSV 리더가 들어간다 — JSON 만 쓰는 프로젝트에 쓰지 않는
 * 파서를 넣지 않는다. C# 자체를 끄면 아무것도 내지 않는다.
 */
function emitCSharp(ir, resolved) {
  // 출력은 셋 다 만든다. 화면이 탭을 바꿀 때마다 다시 실행하지 않아도 되고, 켜기
  // 전에 무엇이 나올지 볼 수 있어야 한다. 거르는 일은 UI 가 한다.
  //
  // CSV 리더만 형식 선택을 따른다 — 집계 로더와 같은 이유로 옵트인이다.
  const csv = resolved.formats !== null && resolved.formats.includes('csv');
  const shared = { namespace: resolved.namespace, csv, arrayDelimiter: resolved.arrayDelimiter };

  return [
    ...emitCSharpRuntime(ir, shared),
    ...emitCSharpEnums(ir, { namespace: resolved.namespace }),
    ...emitCSharpClasses(ir, shared),
    ...(resolved.loader
      ? emitCSharpLoader(ir, {
          namespace: resolved.namespace,
          loaderClassName: resolved.loaderClassName,
        })
      : []),
  ];
}

/**
 * 출력 형식 조합이 어긋나는 곳을 찾는다.
 *
 * 진단이 아니라 문자열 목록이다 — 시트의 문제가 아니라 설정의 문제이고, 붙일 셀
 * 좌표가 없다. 내보내기를 막지도 않는다: 이미 JSON 이 프로젝트에 있고 C# 만 다시
 * 보려는 경우가 있다. 막는 판단은 진단의 E 만 한다 (사양 §5.1).
 *
 * @param {Array<string>} formats 체크된 출력 형식
 * @param {{loader?: boolean}} [settings]
 * @returns {Array<string>} 사람이 읽는 알림. 없으면 빈 배열
 */
export function checkOutputSettings(formats, settings = {}) {
  const issues = [];
  const has = (format) => formats.includes(format);

  // 생성된 C# 은 JSON 이나 CSV 를 읽는다. 둘 다 없으면 읽을 데이터가 없다.
  // CSV 리더는 CSV 를 켰을 때만 생성되므로, 여기서 둘 다 확인해야 한다.
  if (has('csharp') && !has('json') && !has('csv')) {
    issues.push(
      'C# 이 읽을 데이터가 없습니다. JSON 이나 CSV 를 함께 내보내십시오.',
    );
  }

  if (settings.loader === true && !has('csharp')) {
    issues.push('집계 로더는 C# 출력입니다. C# 을 켜지 않으면 나오지 않습니다.');
  }

  return issues;
}

/**
 * 출력 파일마다 "이게 무엇인가" 와 크기를 붙인다.
 *
 * 파일명만 보여주면 Grade.cs 가 enum 인지 클래스인지, GameDataTables.cs 가 무엇인지
 * 알 수 없다. 순서는 outputs 의 순서를 그대로 지킨다 (사양 §8).
 *
 * @param {object} ir
 * @param {Record<string, Array<{fileName: string, text: string}>>} outputs
 * @returns {Array<{format: string, fileName: string, description: string, bytes: number}>}
 */
export function describeOutputs(ir, outputs) {
  const sheets = new Map(ir.sheets.map((sheet) => [sheet.className, sheet]));
  const enums = new Map(ir.enums.map((item) => [item.className, item]));

  const described = [];
  for (const format of Object.keys(outputs)) {
    for (const file of outputs[format]) {
      described.push({
        format,
        fileName: file.fileName,
        description: describeFile(file.fileName, sheets, enums, ir),
        bytes: byteLength(file.text),
      });
    }
  }
  return described;
}

function describeFile(fileName, sheets, enums, ir) {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1);
  const base = fileName.slice(0, fileName.lastIndexOf('.'));

  const sheet = sheets.get(base);
  if (sheet !== undefined) {
    // 리포트와 같은 이유로 원본 시트명을 쓴다. 사람이 시트에서 찾을 이름이 그쪽이다.
    if (extension === 'cs') {
      return `${sheet.name} 데이터 클래스 · 필드 ${sheet.fields.length}개`;
    }
    return `${sheet.name} 시트 · ${sheet.rows.length}행`;
  }

  const definition = enums.get(base);
  if (definition !== undefined) {
    return `enum ${definition.name} · 멤버 ${definition.members.length}개`;
  }

  if (fileName === 'GameDataRuntime.cs') {
    // 시트와 무관하게 항상 같은 내용이므로 프로젝트에 하나만 있으면 된다.
    return '런타임 · 프로젝트에 한 번만 넣습니다';
  }

  return `집계 로더 · 테이블 ${ir.sheets.length}개`;
}

/**
 * UTF-8 바이트 수.
 *
 * 문자 수를 쓰면 한글 주석이 든 파일의 크기가 실제의 3분의 1로 보인다.
 */
function byteLength(text) {
  return new TextEncoder().encode(text).length;
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
