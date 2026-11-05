# 순공 프로그램 소스 검증·인수인계 패키지

기준일: 2026-11-05, 한국시간. 대상: 전라고등학교 「가보자 서울대!」 순공 프로그램.

## 먼저 읽을 내용

이 저장소 루트가 최신 프로그램 소스입니다. `release-files.json`의 22개 파일이 웹 배포 대상이며, 이 파일들은 마지막으로 준비한 `20261104-150430-KST/soongong-deploy.zip`과 바이트 단위로 일치합니다. 이번 인수인계 작업에서는 웹 동작을 추가 변경하지 않았습니다.

사용자는 Cloudflare Pages에 파일/ZIP을 직접 업로드하는 방식으로 배포했고 테스트를 진행했다고 보고했습니다. 다만 마지막 ZIP이 현재 운영 주소에 올라가 있는지는 담당자가 직접 확인해야 합니다. GitHub 반영은 Cloudflare 재배포 또는 Firebase 규칙 게시를 의미하지 않습니다.

## 문서 구성

| 문서 | 내용 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 페이지 역할, 데이터 구조, 상태 변경·집계·서버 시각 보정 |
| [VERIFICATION.md](VERIFICATION.md) | 검증 결과, 재실행 방법, 실제 기기 체크리스트 |
| [OPERATIONS.md](OPERATIONS.md) | 배포/복구, 신청 확정/탈락, 휴식/종료, 오류 대응 |
| [OPEN_ITEMS.md](OPEN_ITEMS.md) | 기존 문제 번호별 처리 상태, 보류·미검증 항목 |
| [evidence](evidence/) | 재실행 로그, 파일 SHA-256, 마지막 배포 ZIP과 소스 비교 |
| [루트 README](../README.md) | 전체 변경 내역과 Firebase 규칙 적용 설명 |

## 인수인계 상태

- 기준 원격 커밋: `028230a94d14d1bf259f0adf2cd47fb23dfdff3a` (최초 배포 소스).
- 최신 수정: 중복 종료/날짜 경계/합계 정합성, 서버 시각 보정, 신청 중복 방지, 과거 참여자 보존, 오류 안내, 신청 상태 표시, 일시정지 오인 오류 수정.
- 로컬 자동 시험: 43개 통과. Chromium 가상 DB 브라우저 시험: 15개 페이지 및 주요 사용자 흐름 통과. 이번 기준일에 다시 실행했습니다.
- 운영 데이터: 내려받거나 변경하지 않았습니다. 이 패키지에 실제 학생 명단·PIN·공부 기록은 포함되어 있지 않습니다.
- Firebase 규칙: 사용자가 제공한 규칙에 `active`, `rosters`를 추가한 교체본을 저장했습니다. 운영 적용 상태와 서버 규칙 실행 결과는 독립 검증하지 않았습니다.
- 사용자 보고: 신청·배정·공부 동작을 시험했고, 일시정지에서 새로고침 요구가 발생했습니다. 임시/확정 서버 타임스탬프 차이를 재현하는 시험을 추가하고 수정한 ZIP을 제공했습니다. 그 최신 ZIP의 실제 운영 재시험 결과까지 확정한 것은 아닙니다.

## 재현·패키지 생성

```sh
node tests/records.test.cjs
node tests/browser-smoke.cjs
python3 scripts/package_release.py
```

브라우저 시험의 환경 준비는 [VERIFICATION.md](VERIFICATION.md)를 따릅니다. 패키지 생성에는 Python 표준 라이브러리만 필요합니다.

`artifacts/soongong-deploy.zip`은 Cloudflare 업로드용, `artifacts/soongong-handoff.zip`은 소스·규칙·문서·시험·배포 ZIP을 묶은 인수인계용입니다. **인수인계 ZIP 전체를 웹에 올리지 말고 배포 ZIP만 사용하세요.** 생성물은 `.gitignore`로 제외했으며 저장소에서 재생성할 수 있습니다.
