<div align="center">

# Game Sheet Exporter

엑셀 데이터시트를 타입이 보존된 JSON과 C# 코드로 내보냅니다.

[![Open App](https://img.shields.io/badge/Open_App-E8795A?style=for-the-badge&logo=googlechrome&logoColor=white)](https://blackrabbitdeveloper.github.io/game-sheet-exporter/)
[![BlackRabbit UI](https://img.shields.io/badge/BlackRabbit_UI-0.3.0-248A5A?style=for-the-badge)](https://github.com/blackrabbitDeveloper/blackrabbit-ui)

</div>

> 파일을 브라우저에서 처리하는 BlackRabbit Utils의 local-first 도구입니다.
> 번들러도 런타임 npm 의존성도 없이, 브라우저가 그대로 실행하는 ES 모듈로 동작합니다.

## 상태

**골격만 준비된 단계입니다.** 앱 셸과 개발 환경은 동작하지만 변환 로직은 아직 없습니다.

사양 문서(`docs/spec.md`, `docs/notation.md`)가 비어 있어 파서·검증·에미터 구현을
시작할 수 없습니다. 자세한 내용은 각 문서의 경고 블록을 참고하세요.

## 로컬 실행

```bash
npm run dev       # http://127.0.0.1:8000
npm test          # node --test
npm run fixtures  # test/fixtures/*.def.json → test/fixtures/generated/*.xlsx
```

`npm install` 은 필요 없습니다. `dependencies` 는 비어 있으며 서드파티는 `vendor/` 에
파일로 커밋되어 있습니다.

## 구조

```
index.html          앱 셸
src/core/           시트 → IR → 출력. 브라우저 API 금지, Node에서 직접 테스트됨
src/worker/         파싱·검증을 메인 스레드 밖에서
src/ui/             DOM 담당
vendor/             수정 금지. blackrabbit-ui + SheetJS 배포본
test/fixtures/      *.def.json 이 원본, xlsx 는 생성물
test/golden/        출력 형식 회귀 방지
docs/               사양이 코드보다 우선한다
```

의존 방향은 `ui → core`, `worker → core` 단방향입니다. `core` 는 DOM도 SheetJS도
모릅니다 (예외: `src/core/parser/workbook-reader.js`). 이 경계는 `test/boundary.test.mjs`
가 `npm test` 마다 강제합니다.

## 서드파티

| 항목 | 버전 | 라이선스 |
|---|---|---|
| [blackrabbit-ui](https://github.com/blackrabbitDeveloper/blackrabbit-ui) | 0.3.0 | MIT |
| [SheetJS](https://sheetjs.com/) | 0.20.3 | Apache-2.0 |

SheetJS는 npm이 아니라 [자체 CDN](https://cdn.sheetjs.com/)에서 배포됩니다.
`npm install xlsx` 를 실행하지 마세요 — 배포본은 이미 `vendor/sheetjs/` 에 있습니다.

## 개인정보

파일은 브라우저 안에서만 처리하며 서버로 전송하지 않습니다.

## 라이선스

저장소의 라이선스 정책을 따릅니다.
