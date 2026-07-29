// 진단 목록 → 사람이 읽는 텍스트.
//
// 사양: docs/spec.md §5.1
//
//   E004  Monster!E4  참조 대상이 없습니다: Item.id = 2003
//                     drop_ids 열의 값 2003 이 Item 시트에 없습니다.
//   W105  Monster!B1  필드명이 변환되었습니다: "몬스터 이름" → "몬스터_이름"

const CODE_WIDTH = 4;
const GAP = 2;

// 고정폭 글꼴에서 두 칸을 차지하는 문자. 한글 음절·자모, 한자, 가나, 전각 기호를
// 덮는다. 시트명에 한글이 들어오는 것은 이 도구에서 예외가 아니라 기본이므로
// (spec.md §6.4), 코드 유닛 수로 맞추면 리포트가 늘 어긋난다.
const FULL_WIDTH =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏ꥠ-꥿가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/;

/**
 * @param {Array<{code: string, cell: string, message: string, detail: string}>} diagnostics
 * @returns {string} 줄바꿈 LF, 끝에 개행. 진단이 없으면 빈 문자열
 */
export function formatReport(diagnostics) {
  if (diagnostics.length === 0) return '';

  // 좌표 너비를 맞춰 메시지가 한 열에서 시작하게 한다.
  const cellWidth = Math.max(...diagnostics.map((item) => displayWidth(item.cell)));
  const gap = ' '.repeat(GAP);
  const indent = ' '.repeat(CODE_WIDTH + GAP + cellWidth + GAP);

  const lines = [];
  for (const item of diagnostics) {
    const padding = ' '.repeat(cellWidth - displayWidth(item.cell));
    lines.push(`${item.code}${gap}${item.cell}${padding}${gap}${item.message}`);
    if (item.detail !== '') lines.push(`${indent}${item.detail}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * 고정폭 글꼴에서 문자열이 차지하는 칸 수.
 *
 * @param {string} text
 * @returns {number}
 */
export function displayWidth(text) {
  let width = 0;
  for (const char of text) width += FULL_WIDTH.test(char) ? 2 : 1;
  return width;
}
