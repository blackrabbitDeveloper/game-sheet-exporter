// 시트 목록 · 검증 리포트 · 탭의 DOM 을 만든다.
//
// 사양: docs/spec.md §7.1
//
// 시트명·필드명·셀 값은 사용자 파일에서 온 문자열이므로 innerHTML 을 쓰지 않는다.
// 전부 textContent 로 넣는다.
//
// 개수 세기 같은 순수 계산은 여기서 export 해 Node 에서 테스트한다. DOM 을 만드는
// 함수는 눈으로 확인하는 수밖에 없다.
import { parseCellRef } from '../core/util/a1.js';
import { isError } from '../core/ir/diagnostic.js';

/**
 * 진단을 시트별로 센다.
 *
 * 좌표가 시트를 가리키지 않는 진단(파일 전체에 걸린 것)은 어느 시트에도 넣지 않는다.
 *
 * @param {Array<object>} diagnostics
 * @returns {Map<string, {errors: number, warnings: number}>} 원본 시트명 → 개수
 */
export function countDiagnostics(diagnostics) {
  const counts = new Map();

  for (const item of diagnostics) {
    const reference = parseCellRef(item.cell);
    if (reference === null) continue;

    const found = counts.get(reference.sheet) ?? { errors: 0, warnings: 0 };
    if (isError(item)) found.errors += 1;
    else found.warnings += 1;
    counts.set(reference.sheet, found);
  }

  return counts;
}

/**
 * 진단 개수를 한 줄로 요약한다.
 *
 * @param {Array<object>} diagnostics
 * @returns {string}
 */
export function summarize(diagnostics) {
  const errors = diagnostics.filter(isError).length;
  const warnings = diagnostics.length - errors;

  if (errors === 0 && warnings === 0) return '문제를 찾지 못했습니다.';
  if (errors === 0) return `경고 ${warnings}건. 내보낼 수 있습니다.`;
  return `오류 ${errors}건, 경고 ${warnings}건. 오류를 고쳐야 내보낼 수 있습니다.`;
}

/** 자식을 모두 지운다. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 시트 목록을 그린다.
 *
 * enum 정의 시트는 체크박스를 주지 않는다. 데이터 클래스가 enum 타입을 쓰므로
 * 빼면 생성된 C# 이 컴파일되지 않는다.
 *
 * @param {HTMLElement} container
 * @param {{ir: object, diagnostics: Array<object>, selected: Set<string>, onToggle: (name: string, on: boolean) => void}} options
 */
export function renderSheetList(container, { ir, diagnostics, selected, onToggle }) {
  clear(container);
  const counts = countDiagnostics(diagnostics);

  for (const sheet of ir.sheets) {
    const row = element('li', 'sheet-row');

    const label = element('label', 'sheet-label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.has(sheet.name);
    box.addEventListener('change', () => onToggle(sheet.name, box.checked));
    label.append(box);

    const names = element('span', 'sheet-names');
    names.append(element('strong', null, sheet.name));
    // 변환된 이름이 다르면 함께 보여준다. 생성 코드에서 찾을 이름이 그쪽이다.
    if (sheet.className !== sheet.name) {
      names.append(element('span', 'sheet-alias', `→ ${sheet.className}`));
    }
    label.append(names);
    row.append(label);

    row.append(element('span', 'sheet-rows', `${sheet.rows.length}행`));
    row.append(badges(counts.get(sheet.name)));
    container.append(row);
  }

  for (const definition of ir.enums) {
    const row = element('li', 'sheet-row sheet-row--enum');
    const names = element('span', 'sheet-names');
    names.append(element('strong', null, definition.sheet));
    names.append(element('span', 'sheet-alias', `enum ${definition.className}`));
    row.append(names);
    row.append(element('span', 'sheet-rows', `${definition.members.length}개`));
    row.append(badges(counts.get(definition.sheet)));
    container.append(row);
  }
}

function badges(count) {
  const wrap = element('span', 'sheet-badges');
  if (count === undefined) return wrap;
  if (count.errors > 0) wrap.append(element('span', 'badge badge--error', `E ${count.errors}`));
  if (count.warnings > 0) wrap.append(element('span', 'badge badge--warn', `W ${count.warnings}`));
  return wrap;
}

/**
 * 검증 리포트를 그린다. 사양 §5.1 의 세 조각(코드·좌표·메시지)을 그대로 쓴다.
 *
 * @param {HTMLElement} container
 * @param {Array<object>} diagnostics
 */
export function renderReport(container, diagnostics) {
  clear(container);

  if (diagnostics.length === 0) {
    container.append(element('li', 'report-empty', '문제를 찾지 못했습니다.'));
    return;
  }

  for (const item of diagnostics) {
    const row = element('li', `report-row ${isError(item) ? 'is-error' : 'is-warning'}`);
    row.append(element('span', 'report-code', item.code));

    const body = element('span', 'report-body');
    body.append(element('span', 'report-cell', item.cell));
    body.append(element('span', 'report-message', item.message));
    if (item.detail) body.append(element('span', 'report-detail', item.detail));
    row.append(body);

    container.append(row);
  }
}

/**
 * 바이트 수를 사람이 읽는 문자열로 만든다.
 *
 * file-intake 의 formatBytes 는 업로드한 파일 크기를 위한 것이라 KB 아래를 반올림한다.
 * 생성 파일은 수백 바이트가 흔해 B 단위가 필요하다.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatOutputSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 생성될 파일 목록을 그린다. 목록의 각 줄이 미리보기 선택도 겸한다.
 *
 * 파일명만 보여주면 Grade.cs 가 enum 인지 클래스인지 알 수 없다. 무엇인지와 크기를
 * 함께 붙인다.
 *
 * @param {HTMLElement} container
 * @param {{files: Array<{fileName: string, description: string, bytes: number}>, activeFile: string|null, onSelect: (fileName: string) => void}} options
 */
export function renderFileList(container, { files, activeFile, onSelect }) {
  clear(container);

  if (files.length === 0) {
    container.append(element('li', 'file-empty', '내보낼 시트를 하나 이상 고르세요.'));
    return;
  }

  for (const file of files) {
    const row = element('li');
    const button = element('button', 'file-row');
    button.type = 'button';
    button.setAttribute('role', 'tab');

    const active = file.fileName === activeFile;
    button.setAttribute('aria-selected', String(active));
    if (active) button.classList.add('is-active');

    const head = element('span', 'file-head');
    head.append(element('span', 'file-name', file.fileName));
    head.append(element('span', 'file-size', formatOutputSize(file.bytes)));
    button.append(head);
    button.append(element('span', 'file-description', file.description));

    button.addEventListener('click', () => onSelect(file.fileName));
    row.append(button);
    container.append(row);
  }
}

/**
 * 가이드의 시트 구조 표를 그린다.
 *
 * 표를 HTML 에 손으로 쓰지 않는 이유는 예시 데이터를 고쳤을 때 가이드가 조용히
 * 낡는 것을 막기 위해서다 (sample.js 의 guideRows).
 *
 * @param {HTMLTableElement} table
 * @param {Array<{label: string, rowNumber: number, cells: string[]}>} rows
 */
export function renderGuideTable(table, rows) {
  clear(table);

  const columnCount = Math.max(...rows.map((row) => row.cells.length));
  const head = table.createTHead().insertRow();
  head.append(element('th', 'guide-corner', ''));
  for (let index = 0; index < columnCount; index += 1) {
    head.append(element('th', null, String.fromCharCode(65 + index)));
  }
  head.append(element('th', 'guide-note', ''));

  const body = table.createTBody();
  for (const row of rows) {
    const line = body.insertRow();
    line.append(element('th', 'guide-rownum', String(row.rowNumber)));
    for (let index = 0; index < columnCount; index += 1) {
      line.append(element('td', null, row.cells[index] ?? ''));
    }
    line.append(element('td', 'guide-note', row.label));
  }
}

/**
 * 탭 한 줄을 그린다. 미리보기의 형식 탭이 쓴다.
 *
 * @param {HTMLElement} container
 * @param {Array<{id: string, label: string}>} items
 * @param {string} activeId
 * @param {(id: string) => void} onSelect
 */
export function renderTabs(container, items, activeId, onSelect) {
  clear(container);

  for (const item of items) {
    const tab = element('button', 'tab', item.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');

    const active = item.id === activeId;
    tab.setAttribute('aria-selected', String(active));
    if (active) tab.classList.add('is-active');

    tab.addEventListener('click', () => onSelect(item.id));
    container.append(tab);
  }
}
