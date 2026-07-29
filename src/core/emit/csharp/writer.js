// C# 출력이 공유하는 조각.
//
// 사양: docs/spec.md §6.3

export const DEFAULT_NAMESPACE = 'GameData';
export const INDENT = '    ';

/**
 * XML 문서 주석 한 줄. 내용이 없으면 null 을 돌려준다.
 *
 * 이스케이프하지 않으면 주석에 든 `<` 하나가 생성 파일의 문서를 통째로 깨뜨리고
 * 컴파일 경고를 낸다. 시트 주석에는 "hp < 100" 같은 표현이 흔하다.
 *
 * @param {string} text 원본 주석
 * @param {string} indent 줄 앞에 붙일 들여쓰기
 * @returns {string|null}
 */
export function docComment(text, indent) {
  const content = escapeXml(collapse(text));
  return content === '' ? null : `${indent}/// <summary>${content}</summary>`;
}

/**
 * 줄바꿈과 연속 공백을 한 칸으로 만든다.
 *
 * 문서 주석은 한 줄이어야 한다. 셀에 줄바꿈이 들어오면 `///` 없는 줄이 생겨
 * 컴파일이 깨진다.
 */
function collapse(text) {
  return typeof text === 'string' ? text.replace(/\s+/gu, ' ').trim() : '';
}

function escapeXml(text) {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}
