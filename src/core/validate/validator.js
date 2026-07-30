// 규칙 실행기.
//
// 사양: docs/spec.md §5.4(규칙 하나당 파일 하나), §5.5(두 단계가 한 목록에 모인다)
import { sortDiagnostics } from '../ir/diagnostic.js';
import * as E004 from './rules/E004.js';
import * as E007 from './rules/E007.js';
import * as E009 from './rules/E009.js';
import * as E011 from './rules/E011.js';
import * as E012 from './rules/E012.js';
import * as E015 from './rules/E015.js';
import * as W101 from './rules/W101.js';
import * as W102 from './rules/W102.js';
import * as W103 from './rules/W103.js';
import * as W104 from './rules/W104.js';
import * as W105 from './rules/W105.js';
import * as W106 from './rules/W106.js';

/**
 * 규칙은 여기에 명시적으로 등록한다. 디렉터리를 훑지 않는 이유가 둘 있다.
 *
 * 1. core/ 는 브라우저에서 그대로 돌아야 해 파일 시스템을 못 쓴다.
 * 2. 번들러가 없으므로 동적 import 의 경로를 정적으로 알 수 없다.
 *
 * 부수 효과로 실행 순서가 소스에 박혀 결정성이 공짜로 따라온다. 규칙을 추가하면
 * 이 배열에 넣어야 한다 — 파일만 만들고 잊으면 조용히 실행되지 않으므로,
 * test/validate.test.mjs 가 등록 개수를 확인한다.
 */
export const RULES = [E004, E007, E009, E011, E012, E015, W101, W102, W103, W104, W105, W106];

/**
 * @param {object} ir
 * @param {Array<object>} [parseDiagnostics] buildIR 이 낸 진단
 * @returns {Array<object>} 셀 위치 순으로 정렬된 전체 진단
 */
export function validate(ir, parseDiagnostics = []) {
  const found = [...parseDiagnostics];
  for (const rule of RULES) found.push(...rule.check(ir));
  return sortDiagnostics(found, sheetOrder(ir));
}

/**
 * 정렬 기준이 될 시트 순서.
 *
 * IR 은 데이터 시트와 enum 정의 시트를 나눠 담으므로 원본 워크북의 뒤섞인 순서를
 * 복원할 수 없다. 데이터 시트를 먼저 두는데, 사람이 고칠 곳이 대개 그쪽이다.
 */
function sheetOrder(ir) {
  return [...ir.sheets.map((sheet) => sheet.name), ...ir.enums.map((item) => item.sheet)];
}
