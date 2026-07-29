# sheet-exporter

엑셀 데이터시트를 타입이 보존된 JSON과 C# 코드로 내보내는 **브라우저 전용** 도구.
상세 사양: @docs/spec.md
타입 표기 스펙: @docs/notation.md

## 절대 규칙

1. **빌드 도구 없음.** 번들러·트랜스파일러·프레임워크(React/Vue/Svelte)를 도입하지 않는다. 브라우저가 그대로 실행하는 ES 모듈만 쓴다.
2. **런타임 npm 의존성 없음.** `package.json`의 `dependencies`는 비어 있어야 한다. 서드파티는 `vendor/`에 파일로 커밋한다. `npm install xlsx` 같은 명령을 실행하지 말 것 — SheetJS는 이미 `vendor/sheetjs/`에 있다.
3. **`vendor/` 수정 금지.** blackrabbit-ui와 SheetJS 배포본이다. 갱신은 사람이 sync 스크립트로 한다.
4. **`src/core/`는 브라우저 API 금지.** `window` `document` `localStorage` `fetch` `crypto` `alert` 사용 불가. 외부 기능이 필요하면 `core/util/ports.js` 인터페이스로 주입받는다. 이 디렉터리는 Node에서 그대로 import되어 테스트된다.
5. **`src/core/`는 SheetJS를 모른다.** 예외는 `src/core/parser/workbook-reader.js` 한 파일뿐. 나머지 모듈은 2차원 문자열 배열만 받는다.
6. **출력은 결정적이어야 한다.** 같은 입력 → 바이트 단위로 같은 출력.
   - 키 순서 = 시트 열 순서 (알파벳 정렬 금지)
   - 줄바꿈 LF 고정
   - `Date.now()` / `new Date()` 를 출력 경로에서 쓰지 않는다 (헤더 타임스탬프는 옵션으로 주입)
   - `Set`/`Map` 순회 순서나 `Object.keys` 순서에 의존하지 않는다
7. **오류 리포트에는 항상 셀 좌표.** `Monster!D17` 형식. 좌표 없는 검증 결과는 미완성으로 간주한다.

## 의존 방향

```
ui → core        허용
worker → core    허용
core → ui        금지
core → 브라우저 API  금지
```

이 규칙은 향후 CLI/CI 전환 비용을 결정한다. 편의를 위해 어기지 말 것.

## 구조

- `src/core/parser/` — 시트를 IR로 변환
- `src/core/validate/` — 규칙 하나당 파일 하나 (`rules/E001.js`)
- `src/core/emit/` — IR을 JSON/CSV/C#으로 출력
- `src/core/util/` — 공용 유틸. **새 유틸 파일을 만들기 전에 여기를 먼저 확인할 것**
- `src/ui/` — DOM 담당. `preset-store.js`가 localStorage 접점의 유일한 위치
- `src/worker/` — 파싱·검증을 메인 스레드 밖에서 실행
- `docs/` — 사양. 코드와 사양이 어긋나면 사양이 기준이며, 사양이 틀렸다고 판단되면 코드를 고치기 전에 먼저 알릴 것

## 검증

작업을 마치기 전에 반드시 실행한다.

```bash
npm test        # node --test
npm run fixtures  # 픽스처 xlsx 재생성
```

- 픽스처 xlsx는 손으로 만들지 않는다. `test/fixtures/*.def.json`이 원본이고 `npm run fixtures`가 생성한다.
- 골든 파일(`test/golden/`)은 **임의로 갱신하지 않는다.** 불일치가 나면 고치지 말고 diff를 보고할 것. 갱신은 사람이 `UPDATE_GOLDEN=1 npm test`로 한다.
- 검증 규칙(E/W 코드)은 각각 실패 케이스와 통과 케이스를 최소 하나씩 갖는다.

## 작업 방식

- 한 세션은 한 관심사만 다룬다. 요청 범위를 넘어 다른 모듈을 리팩터링하지 않는다.
- 여러 파일을 건드리는 작업은 계획을 먼저 제시하고 승인을 받는다.
- 새 파일을 만들기 전에 기존 모듈에 들어갈 자리가 있는지 확인한다.
- UI 작업에서는 blackrabbit-ui 클래스를 우선 사용한다. 새 CSS는 해당 컴포넌트가 없을 때만 `src/ui/app.css`에 추가하고, **색상은 반드시 디자인 토큰 CSS 변수를 쓴다. 하드코딩된 hex 금지.**
- 커밋은 작게. 한 커밋에 최소 하나의 통과하는 테스트.

## 도메인 주의사항

- 엑셀·CSV에서 읽은 값은 **전부 문자열**이다. 타입 캐스팅은 `value-parser.js`에서만 한다.
- 엑셀 날짜는 시리얼 넘버로 들어온다. `datetime` 타입은 반드시 변환 경로를 탄다.
- 빈 셀은 `undefined`, 빈 문자열, 공백 문자가 모두 가능하다. 셋을 동일하게 취급한다.
- 시트명·필드명에는 공백, 한글, 특수문자가 들어온다. 식별자 변환은 `core/ir/naming.js` 단일 경로로만.
- C# 예약어(`class`, `event`, `params`, `object` 등)와 충돌하는 필드명은 E007로 잡는다. 자동으로 이름을 바꾸지 말 것.
- 헤더 행 구성(필드명/타입/주석의 행 번호)은 **설정값**이다. 1·2·3행으로 하드코딩하지 않는다.

## 커밋 메시지

```
feat(parser): 타입 표기 파서 구현
test(validate): E004 참조 무결성 케이스 추가
chore(golden): C# 에미터 출력 형식 변경 반영
```

골든 파일 갱신은 항상 `chore(golden)` 접두사로 별도 커밋한다.
