# 구조와 데이터

## 실행 환경과 페이지

- 별도 빌드 없는 HTML/JavaScript 정적 사이트. Firebase compat SDK 10.12.2를 CDN에서 사용합니다.
- 운영 주소: `https://jeolla-soongong.pages.dev/`, Firebase 프로젝트: `jeolla-soongong`.
- GitHub: `hwang9jl-lang/jeolla-soongong`, 기본 브랜치 `main`. 운영 배포는 사용자의 Cloudflare Pages 직접 업로드 방식입니다.
- `firebase-config.js`: Firebase 연결, 시간·집계·오류·트랜잭션·명단 공통 함수.
- `apply.html`: 참여 신청. `index.html`: 학번/PIN으로 랭킹 진입. `seat.html?s=2-1`: 좌석별 공부 화면. `rank.html`: 완료 시간 집계와 랭킹.
- `admin.html`: 관리자 메뉴/전체·기록 초기화. `admin-apply.html`: 신청/탈락/명단 확정. `admin-assign.html`: 현재 자리 배정.
- `admin-live.html`: 실시간 현황. `admin-daily.html`: 날짜별 출석/좌석. `admin-records.html`: 기록/랭킹/교사 인정/CSV.
- `admin-codes.html`: 주간 코드, `admin-qr.html`: 좌석 QR, `admin-seatchart.html`: 인쇄 좌석표, `apply-qr.html`: 신청 QR, `student-guide.html`: 안내지.

## 주요 데이터 경로

| 경로 | 핵심 필드와 의미 |
|---|---|
| `applications/{sid}` | sid, name, cls, order, appliedAt, status. 최초 신청을 보존하며 탈락은 rejected. 확정 여부는 students의 활성 상태로 판단 |
| `meta/applyCount` | 신청 순번 예약 카운터. 동시 신청/실패로 빈 번호가 생길 수 있음 |
| `students/{sid}` | sid, name, cls, rank, seat, pin, active. active가 없으면 기존 활성 학생으로 취급 |
| `students/{sid}/totalSec` | 이전 버전 누적 캐시. 새 합계 계산에는 사용하지 않음 |
| `records/{KST날짜}/{sid}` | startAt, segStart, accumSec, prevSec, status, pausedAt, endAt, durationSec, fixedByTeacher 및 당시 학생/좌석 |
| `dailyCode/{날짜}` | 시작에 입력하는 코드 |
| `settings/applyOpen` | 신규 신청 접수 상태 |
| `rosters/{날짜}` | capturedAt와 학생별 sid/name/cls/seat. PIN 제외. 그날의 마지막 명단·배정 스냅샷 |

학번을 문자열 키로 사용합니다. 정상 종료 후 재입실하면 같은 날짜 기록을 새 세션으로 교체하고, 이미 완료한 시간은 prevSec에 보존합니다. 세션별 상세 원장을 모두 쌓는 방식은 아닙니다.

## 공부 상태와 합계

- 시작 가능: 07:00 이상 22:00 미만(KST). 없는 기록 또는 done에서만 새 시작 가능.
- ongoing → paused: 현재 구간을 accumSec에 누적. paused → ongoing: segStart를 서버 타임스탬프로 갱신.
- 종료: 활성 기록에 대해 상태와 시작/구간 시각 등이 일치하는지 트랜잭션에서 검사. 같은 시작 기록의 중복 종료를 차단.
- 날짜는 시작 시각의 KST 날짜로 고정. 자정 이후 종료해도 다음 날 기록을 만들지 않음.
- 시작 날짜의 22시 이후 미종료 기록은 invalid. 이전 완료분까지 **그날 전체 무효**. 전날 등의 별도 정상 기록은 유지.
- done은 durationSec, ongoing/paused는 prevSec, invalid는 0초를 집계. 진행 중인 이번 구간은 좌석의 '오늘 순공'에만 보이고 정상 종료 후 랭킹에 반영.
- 교사 인정은 invalid 상태에서만 수행하며 입력한 시간을 그날 전체 durationSec로 대체. 별도 누적 가산은 없음.
- 시작/재개 트랜잭션의 반환 시각은 로컬 추정값일 수 있으므로, 저장 후 기록을 다시 읽고 다음 상태 비교 기준을 정함.

## 시간과 화면 초기화

`.info/serverTimeOffset`와 `.info/connected`가 준비되면 서버 시각 기준점을 생성합니다. 이후 performance.now()의 경과 시간으로 타이머를 계산합니다. 벽시계와 단조 시계의 경과 차이가 5초를 넘으면 재연결 후 재시도를 안내합니다.

Firebase를 쓰는 페이지의 실행 코드는 `script[type="application/x-soongong"]`에 있으며 공통 JS가 시각 준비 후 실행합니다. HTML과 공통 JS는 반드시 같은 버전으로 함께 배포해야 합니다.

관리자 화면은 데이터 갱신 시 및 15초 간격으로 미종료 기록을 정리합니다. 이는 브라우저 동작이며 서버 스케줄러가 아닙니다. 모든 화면이 닫혔거나 정지된 동안 정각 마감을 보장하지 않습니다.

## 과거 기록

명단 재확정 시 제외된 학생은 active=false로 바꾸고 좌석만 해제합니다. 재참여 시 이전 좌석을 자동 점유하지 않습니다. 현재 화면에서는 비활성 학생을 제외하고, 기록·랭킹의 '과거 참여자 포함'으로 조회할 수 있습니다.

명단/좌석 변경과 해당 날짜 rosters 갱신은 다중 경로 업데이트로 함께 저장합니다. 변경 없는 날짜는 직전 스냅샷을 이어 쓰고, 출석 기록의 좌석이 있으면 이를 우선합니다. 최초 스냅샷 이전 날짜는 당시 결석자를 복원할 수 없어 '확인 불가'로 표시합니다. 콘솔 직접 수정이나 이전 앱의 쓰기는 새 명단 이력에 자동 기록되지 않습니다.
