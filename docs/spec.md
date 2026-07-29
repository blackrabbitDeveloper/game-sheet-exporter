# 사양 (spec)

> **경고 — 이 문서는 아직 작성되지 않았습니다.**
>
> 이 파일이 채워지기 전에는 파서·검증·에미터 구현을 시작하지 마십시오.

## 왜 비어 있는가

[개발가이드](./개발가이드.md)가 참조하는 원본 기획서 `excel-datatable-exporter-기획서.md`가
저장소에 반입되지 않았습니다. 2026-07-29 기준으로 로컬 전체를 검색해 존재하지 않음을 확인했습니다.

`CLAUDE.md`가 이 파일을 임포트하므로 파일 자체는 존재해야 합니다. 그렇다고 그럴듯한 초안을
넣어두면 다음 세션이 그것을 확정된 사양으로 오인하므로, 의도적으로 차단 표지만 둡니다.

## 이 상태에서 착수 금지 대상

| 모듈 | 이 문서가 정해야 할 것 |
|---|---|
| `src/core/parser/type-notation.js` | 타입 표기 문법 전체 (→ [notation.md](./notation.md)) |
| `src/core/parser/header-parser.js` | 헤더 행 구성의 기본값과 설정 범위 |
| `src/core/parser/value-parser.js` | 타입별 캐스팅 규칙, 빈 셀 처리, 날짜 시리얼 변환 기준 |
| `src/core/ir/schema.js` | IR 버전 상수와 노드 종류 |
| `src/core/validate/rules/` | E/W 코드의 의미와 번호 배정 |
| `src/core/emit/json.js` · `csv.js` | 출력 구조와 인코딩 규칙 |
| `src/core/emit/csharp/` | 생성 코드의 형태, 네임스페이스, 로더 API |

## 지금까지 확인된 단서

개발가이드에서 확정적으로 읽어낼 수 있는 조각들입니다. **사양이 아니라 단서**이며,
원본 기획서와 대조하기 전에는 구현 근거로 쓰지 않습니다.

- 헤더 3행 구성 예시: 1행 필드명 / 2행 타입 / 3행 주석 — 단, **행 번호는 설정값**이며 하드코딩 금지
- 등장한 타입 표기: `int`, `loc`, `enum:Grade`, `ref:Item.id[]`
- 등장한 TypeNode 종류: `scalar` `nullable` `array` `enum` `ref` `loc` `struct`
- 언급된 검증 코드: `E001`~`E003`(기본), `E004`·`E008`(참조), `E005`(표기 파싱 실패), `E007`(C# 예약어 충돌), `W105`
- 오류 리포트 형식: `Monster!D17`
- 출력 대상: JSON, CSV, C# (enum · class · loader)

## 다음 단계

1. 원본 기획서를 저장소에 반입한다.
2. 이 문서로 옮기면서 위 표의 빈칸을 채운다.
3. 타입 표기 부분은 [notation.md](./notation.md)로 분리한다.
4. 이 경고 블록을 삭제한다.
