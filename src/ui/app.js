// 화면 배선.
//
// 사양: docs/spec.md §7.1(화면 구성), §5.1(E 가 있으면 내보내기 중단)
//
// 파싱·검증·출력은 pipeline.js 가, DOM 생성은 render.js 가 한다. 이 파일은 이벤트를
// 받아 둘을 잇고 패널을 여닫는 일만 한다.
import { formatBytes, validateFile } from './file-intake.js';
import { describeOutputs, runOnWorkbook, runPipeline } from './pipeline.js';
import {
  clear,
  renderFileList,
  renderGuideTable,
  renderReport,
  renderSheetList,
  renderTabs,
  summarize,
} from './render.js';
import { SAMPLE_WORKBOOK, guideRows } from './sample.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  guide: $('#guide'), guideTable: $('#guide-table'),
  dropzone: $('#dropzone'), fileInput: $('#file-input'), fileSummary: $('#file-summary'),
  fileName: $('#file-name'), fileSize: $('#file-size'), fileRemove: $('#file-remove'),
  sampleButton: $('#sample-button'),
  form: $('#settings-form'), runButton: $('#run-button'),
  progressPanel: $('#progress-panel'), progressMessage: $('#progress-message'),
  progressBar: $('#progress-bar'),
  errorPanel: $('#error-panel'), errorMessage: $('#error-message'), errorClose: $('#error-close'),
  outputPanel: $('#output-panel'), sheetList: $('#sheet-list'), sheetsSummary: $('#sheets-summary'),
  reportList: $('#report-list'), reportSummary: $('#report-summary'),
  formatTabs: $('#format-tabs'), fileList: $('#file-list'), previewCode: $('#preview-code'),
  exportNote: $('#export-note'), downloadFile: $('#download-file'), downloadAll: $('#download-all'),
  toast: $('#toast'),
};

const FORMAT_LABELS = { json: 'JSON', csharp: 'C#', csv: 'CSV' };
const MIME_TYPES = { json: 'application/json', csv: 'text/csv', cs: 'text/plain' };
const SAMPLE_LAYOUT = { nameRow: '1', typeRow: '2', commentRow: '3', dataStartRow: '4', arrayDelimiter: ',' };

/** 입력은 고른 파일이거나 내장 예시다. 둘이 같은 실행 경로를 쓴다. */
let source = null;
let result = null;
let selectedSheets = new Set();
let activeFormat = 'json';
let activeFile = null;
let guideCollapsed = false;
let toastTimer = null;

// ── 입력 선택 ────────────────────────────────────────────────────────

function selectFile(file) {
  const validation = validateFile(file, { accept: elements.fileInput.accept });
  if (!validation.ok) return showError(validation.message);

  source = { kind: 'file', file };
  showSummary(file.name, formatBytes(file.size));
}

function selectSample() {
  source = { kind: 'sample' };
  showSummary(SAMPLE_WORKBOOK.fileName, '내장 예시');

  // 예시는 기본 헤더 구성으로 쓰였다. 사용자가 설정을 바꿔둔 상태라면 예시가
  // 엉뚱하게 깨지므로 되돌려 놓는다. 화면에서 값이 바뀌는 것이 보인다.
  for (const [name, value] of Object.entries(SAMPLE_LAYOUT)) {
    const field = elements.form.elements[name];
    if (field) field.value = value;
  }

  run();
}

function showSummary(name, detail) {
  elements.fileName.textContent = name;
  elements.fileSize.textContent = detail;
  elements.fileSummary.hidden = false;
  elements.dropzone.hidden = true;
  elements.runButton.disabled = false;
  elements.errorPanel.hidden = true;
  hideOutput();
}

function resetWorkspace() {
  source = null;
  elements.fileInput.value = '';
  elements.fileSummary.hidden = true;
  elements.dropzone.hidden = false;
  elements.runButton.disabled = true;
  elements.progressPanel.hidden = true;
  elements.errorPanel.hidden = true;
  elements.progressBar.style.width = '0%';
  hideOutput();
}

function hideOutput() {
  result = null;
  selectedSheets = new Set();
  activeFile = null;
  elements.outputPanel.hidden = true;
}

// ── 설정 읽기 ────────────────────────────────────────────────────────

/** 폼을 pipeline 이 받는 평평한 객체로 만든다. */
function readSettings() {
  const data = new FormData(elements.form);
  return {
    nameRow: data.get('nameRow'),
    typeRow: data.get('typeRow'),
    commentRow: data.get('commentRow'),
    dataStartRow: data.get('dataStartRow'),
    arrayDelimiter: data.get('arrayDelimiter'),
    namespace: data.get('namespace'),
    minify: data.get('minify') === 'on',
    loader: data.get('loader') === 'on',
    loaderClassName: data.get('loaderClassName'),
  };
}

/** 체크된 출력 형식. 순서는 화면 순서로 고정한다. */
function selectedFormats() {
  const checked = new Set(new FormData(elements.form).getAll('format'));
  return ['json', 'csharp', 'csv'].filter((format) => checked.has(format));
}

// ── 실행 ─────────────────────────────────────────────────────────────

async function run() {
  if (source === null) return showError('파일을 고르거나 예시로 시작하세요.');
  if (selectedFormats().length === 0) return showError('출력 형식을 하나 이상 고르세요.');

  elements.errorPanel.hidden = true;
  hideOutput();
  elements.progressPanel.hidden = false;
  elements.runButton.disabled = true;

  try {
    const settings = readSettings();

    await step(12, '입력을 읽고 있습니다.');
    const workbook =
      source.kind === 'sample' ? null : new Uint8Array(await source.file.arrayBuffer());

    await step(48, '시트를 해석하고 검증하고 있습니다.');
    // pipeline 은 동기라 여기서 메인 스레드가 멈춘다. 사양 §7.4 의 Worker 는 S10 이다.
    result =
      source.kind === 'sample'
        ? runOnWorkbook(SAMPLE_WORKBOOK, { settings })
        : runPipeline(workbook, { fileName: source.file.name, settings });
    result.described = describeOutputs(result.ir, result.outputs);

    await step(100, '완료했습니다.');
    selectedSheets = new Set(result.ir.sheets.map((sheet) => sheet.name));
    activeFormat = selectedFormats()[0];
    showOutput();
  } catch (error) {
    result = null;
    showError(error.message);
  } finally {
    elements.progressPanel.hidden = true;
    elements.progressBar.style.width = '0%';
    elements.runButton.disabled = false;
  }
}

/**
 * 진행률을 올리고 브라우저가 한 프레임 그리게 양보한다.
 *
 * 양보하지 않으면 동기 파이프라인이 끝날 때까지 스피너가 한 번도 그려지지 않는다.
 */
function step(percent, message) {
  elements.progressMessage.textContent = message;
  elements.progressBar.style.width = `${percent}%`;
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// ── 출력 ─────────────────────────────────────────────────────────────

function showOutput() {
  elements.outputPanel.hidden = false;

  // 결과가 나오면 가이드를 접어 자리를 내준다. 한 번만 접는다 — 사용자가 다시
  // 펼쳐 뒀는데 실행할 때마다 닫으면 싸우는 느낌이 된다.
  if (!guideCollapsed) {
    elements.guide.open = false;
    guideCollapsed = true;
  }

  renderSheetList(elements.sheetList, {
    ir: result.ir,
    diagnostics: result.diagnostics,
    selected: selectedSheets,
    onToggle: toggleSheet,
  });
  elements.sheetsSummary.textContent =
    `데이터 시트 ${result.ir.sheets.length}개 · enum ${result.ir.enums.length}개`;

  renderReport(elements.reportList, result.diagnostics);
  elements.reportSummary.textContent = summarize(result.diagnostics);

  showPreview();
}

function toggleSheet(name, on) {
  if (on) selectedSheets.add(name);
  else selectedSheets.delete(name);
  showPreview();
}

function showPreview() {
  const formats = selectedFormats();
  renderTabs(
    elements.formatTabs,
    formats.map((format) => ({ id: format, label: FORMAT_LABELS[format] })),
    activeFormat,
    (format) => {
      activeFormat = format;
      activeFile = null;
      showPreview();
    },
  );

  const files = visibleFiles();
  if (activeFile === null || !files.some((file) => file.fileName === activeFile)) {
    activeFile = files.length > 0 ? files[0].fileName : null;
  }

  renderFileList(elements.fileList, {
    files,
    activeFile,
    onSelect: (fileName) => {
      activeFile = fileName;
      showPreview();
    },
  });

  const current = files.find((file) => file.fileName === activeFile);
  clear(elements.previewCode);
  elements.previewCode.textContent = current
    ? current.text
    : '내보낼 시트를 하나 이상 고르세요.';

  updateExportState(files);
}

/**
 * 지금 탭에서 보여줄 파일. 설명과 크기를 붙여 돌려준다.
 *
 * 시트 체크박스는 시트별 파일만 걸러낸다. enum 과 로더는 항상 넣는다 — 데이터
 * 클래스가 그것들을 참조하므로 빼면 생성 코드가 컴파일되지 않는다.
 */
function visibleFiles() {
  const sheetClasses = new Map(result.ir.sheets.map((sheet) => [sheet.className, sheet.name]));
  const described = new Map(
    result.described.map((file) => [`${file.format}/${file.fileName}`, file]),
  );

  return (result.outputs[activeFormat] ?? [])
    .filter((file) => {
      const base = file.fileName.replace(/\.[^.]+$/, '');
      const sheetName = sheetClasses.get(base);
      return sheetName === undefined || selectedSheets.has(sheetName);
    })
    .map((file) => ({ ...file, ...described.get(`${activeFormat}/${file.fileName}`) }));
}

function updateExportState(files) {
  const blocked = result.blocked;
  elements.downloadFile.disabled = blocked || activeFile === null;
  elements.downloadAll.disabled = blocked || files.length === 0;

  if (blocked) {
    elements.exportNote.textContent = '오류를 고쳐야 내보낼 수 있습니다.';
    elements.exportNote.classList.add('is-blocked');
    return;
  }

  const bytes = files.reduce((total, file) => total + file.bytes, 0);
  elements.exportNote.textContent = `${files.length}개 파일 · ${formatBytes(bytes)}`;
  elements.exportNote.classList.remove('is-blocked');
}

// ── 다운로드 ─────────────────────────────────────────────────────────

function download(file) {
  const extension = file.fileName.split('.').pop();
  const blob = new Blob([file.text], {
    type: `${MIME_TYPES[extension] ?? 'text/plain'};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCurrent() {
  const file = visibleFiles().find((item) => item.fileName === activeFile);
  if (!file) return;
  download(file);
  showToast(`${file.fileName} 을 저장했습니다.`);
}

function downloadAll() {
  const files = visibleFiles();
  for (const file of files) download(file);
  // 브라우저가 연속 다운로드를 한 번 묶어 물어볼 수 있다. ZIP 은 S10 이다.
  showToast(`${files.length}개 파일을 저장했습니다.`);
}

// ── 알림 ─────────────────────────────────────────────────────────────

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorPanel.hidden = false;
  elements.errorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2400);
}

// ── 이벤트 ───────────────────────────────────────────────────────────

renderGuideTable(elements.guideTable, guideRows());

elements.dropzone.addEventListener('click', () => elements.fileInput.click());
elements.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    elements.fileInput.click();
  }
});
['dragenter', 'dragover'].forEach((name) =>
  elements.dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropzone.classList.add('is-dragging');
  }),
);
['dragleave', 'drop'].forEach((name) =>
  elements.dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove('is-dragging');
  }),
);
elements.dropzone.addEventListener('drop', (event) => selectFile(event.dataTransfer.files[0]));
elements.fileInput.addEventListener('change', () => selectFile(elements.fileInput.files[0]));
elements.fileRemove.addEventListener('click', resetWorkspace);
elements.sampleButton.addEventListener('click', selectSample);
elements.form.addEventListener('reset', () => requestAnimationFrame(resetWorkspace));
elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  run();
});
// 설정을 바꾸면 화면의 결과가 그 설정으로 나온 것이 아니게 된다.
elements.form.addEventListener('change', (event) => {
  if (result === null) return;
  if (event.target.name === 'format') {
    activeFormat = selectedFormats()[0] ?? 'json';
    activeFile = null;
    showPreview();
    return;
  }
  elements.exportNote.textContent = '설정이 바뀌었습니다. 다시 실행하세요.';
});
elements.errorClose.addEventListener('click', () => {
  elements.errorPanel.hidden = true;
});
elements.downloadFile.addEventListener('click', downloadCurrent);
elements.downloadAll.addEventListener('click', downloadAll);
