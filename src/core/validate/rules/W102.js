// W102 — 데이터 행 없음
//
// 사양: docs/spec.md §5.3
import { diagnostic } from '../../ir/diagnostic.js';
import { sheetRef } from '../../util/a1.js';

export const code = 'W102';
export const title = '데이터 행 없음';

export function check(ir) {
  return ir.sheets
    .filter((sheet) => sheet.rows.length === 0)
    .map((sheet) =>
      diagnostic(
        code,
        // 시트 전체에 걸린 진단이므로 좌표는 시트명까지다 (spec.md §5.1).
        sheetRef(sheet.name),
        '데이터 행이 없습니다',
        `헤더만 있고 ${ir.layout.dataStartRow}행부터 값이 없습니다`,
      ),
    );
}
