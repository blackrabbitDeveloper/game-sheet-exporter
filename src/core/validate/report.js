// 진단 목록 → 사람이 읽는 텍스트.
//
// 사양: docs/spec.md §5.1
//
//   E004  Monster!E4  참조 대상이 없습니다: Item.id = 2003
//                     drop_ids 열의 값 2003 이 Item 시트에 없습니다.
//   W105  Monster!B1  필드명이 변환되었습니다: "몬스터 이름" → "몬스터_이름"

const CODE_WIDTH = 4;
const GAP = 2;

/**
 * @param {Array<{code: string, cell: string, message: string, detail: string}>} diagnostics
 * @returns {string} 줄바꿈 LF, 끝에 개행. 진단이 없으면 빈 문자열
 */
export function formatReport(diagnostics) {
  if (diagnostics.length === 0) return '';

  // 좌표 너비를 맞춰 메시지가 한 열에서 시작하게 한다. 시트명에 한글이 들어가면
  // 글자 폭이 달라 터미널에서는 어긋나 보이지만, 텍스트로서는 결정적이다.
  const cellWidth = Math.max(...diagnostics.map((item) => item.cell.length));
  const indent = ' '.repeat(CODE_WIDTH + GAP + cellWidth + GAP);

  const lines = [];
  for (const item of diagnostics) {
    lines.push(`${item.code}${' '.repeat(GAP)}${item.cell.padEnd(cellWidth)}${' '.repeat(GAP)}${item.message}`);
    if (item.detail !== '') lines.push(`${indent}${item.detail}`);
  }

  return `${lines.join('\n')}\n`;
}
