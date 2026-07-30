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
 * 탭 한 줄을 그린다. 미리보기의 형식 탭과 파일 탭이 같은 모양을 쓴다.
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
