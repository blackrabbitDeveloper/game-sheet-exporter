// W104 — 주석 없음
//
// 사양: docs/spec.md §5.3, §6.3
//
// 주석은 생성된 C# 에 XML 문서 주석으로 들어간다. 비어 있으면 그 필드만 설명 없이
// 남는다.
import { diagnostic } from '../../ir/diagnostic.js';

export const code = 'W104';
export const title = '주석 없음';

export function check(ir) {
  // commentRow 가 null 인 것은 "주석 행을 쓰지 않는다" 는 의도 표명이다.
  // 그 팀에게 필드마다 경고를 내면 리포트가 통째로 소음이 된다.
  if (ir.layout.commentRow === null) return [];

  const found = [];
  for (const sheet of ir.sheets) {
    for (const field of sheet.fields) {
      if (field.comment !== '') continue;
      found.push(
        diagnostic(
          code,
          field.cell,
          `주석이 없습니다: ${field.name}`,
          `${ir.layout.commentRow}행이 비어 있어 생성 코드에 문서 주석이 붙지 않습니다`,
        ),
      );
    }
  }

  return found;
}
