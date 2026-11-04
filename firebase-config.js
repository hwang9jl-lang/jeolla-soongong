// 순공 앱 "가보자 서울대!" - Firebase 연결 설정
// jeolla-soongong 프로젝트

const firebaseConfig = {
  apiKey: "AIzaSyDKVfWU5_pLCuz4zqSYpHRAyIMvGJqZpyk",
  authDomain: "jeolla-soongong.firebaseapp.com",
  databaseURL: "https://jeolla-soongong-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jeolla-soongong",
  storageBucket: "jeolla-soongong.firebasestorage.app",
  messagingSenderId: "228620376693",
  appId: "1:228620376693:web:5a37ec057c9dda5106763c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
// 항상 서버와 연결 유지 (로컬 캐시에서 부분 데이터만 읽는 문제 방지)
db.goOnline();

// ---- 공통 유틸 ----

// 학번(예: 20307)에서 소속 반 계산: 2학년 3반 → "3"
function classFromStudentId(sid) {
  const s = String(sid).trim();
  if (s.length < 3) return "";
  // 뒤 4자리가 반(2)+번호(2). 학년은 맨 앞 1자리.
  // 예: 20307 → 2(학년) 03(반) 07(번) → 반 = 3
  const body = s.slice(-4);        // "0307"
  const cls = parseInt(body.slice(0, 2), 10); // 03 → 3
  return isNaN(cls) ? "" : String(cls);
}

// 학번에서 소속 반+번호 표기: 20307 → "3반 7번"
function classNoFromStudentId(sid) {
  const s = String(sid).trim();
  if (s.length < 4) return "";
  const body = s.slice(-4);
  const cls = parseInt(body.slice(0, 2), 10);
  const no = parseInt(body.slice(2), 10);
  if (isNaN(cls) || isNaN(no)) return "";
  return cls + "반 " + no + "번";
}

// 좌석 코드(예: "2-7") → 화면 표기 "2실 7번"
function seatLabel(code) {
  if (!code) return "";
  const parts = String(code).split("-");
  if (parts.length !== 2) return code;
  return parts[0] + "실 " + parts[1] + "번";
}

// 오늘 날짜 키 (YYYY-MM-DD, 한국시간 기준)
// UTC 절대시각에 +9시간 후 UTC 필드를 읽어 KST 벽시계 날짜를 구함 → 브라우저 시간대와 무관하게 정확.
function todayKey() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

// 초 → "4시간 12분" 형태
function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return h + "시간 " + m + "분";
  if (h > 0) return h + "시간";
  if (m > 0) return m + "분";
  return "0분";
}

// 초 → "HH:MM:SS" 타이머 형태
function fmtTimer(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return h + ":" + m + ":" + s;
}

// 초 → "22:40" 형태 (랭킹 시간 표시용, 시:분)
function fmtHM(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  return h + ":" + m;
}

// 이름 가운데 글자 가림: 김서준 → 김○준, 이하 → 이○
function maskName(name) {
  if (!name) return "";
  const arr = [...String(name)];
  if (arr.length <= 1) return name;
  if (arr.length === 2) return arr[0] + "○";
  arr[1] = "○";
  // 세 글자 이상이면 가운데(들)를 하나만 가림
  if (arr.length > 3) {
    for (let i = 1; i < arr.length - 1; i++) arr[i] = "○";
    return arr[0] + "○" + arr[arr.length - 1];
  }
  return arr.join("");
}

// 날짜키가 속한 주의 월요일 반환 (YYYY-MM-DD). 시간대 무관(UTC 기준 계산).
function weekStart(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();               // 0=일 ~ 6=토
  const diff = (day === 0 ? -6 : 1 - day);  // 그 주의 월요일까지
  dt.setUTCDate(dt.getUTCDate() + diff);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return yy + "-" + mm + "-" + dd;
}
// 두 날짜가 같은 주인지
function isSameWeek(dateA, dateB) {
  return weekStart(dateA) === weekStart(dateB);
}

// 밀린 기록 정리: 종료(퇴실) 안 하고 넘어간 기록을 무효 처리
//  - 지난 날짜인데 아직 ongoing/paused → 무효 (그날 퇴실 안 함)
//  - 오늘인데 이미 22시 이후 ongoing/paused → 무효 (인정 시간 초과)
//  - 오늘이고 아직 22시 전이면 → 그대로 둠 (진짜 공부 중)
// status/durationSec/endAt 만 손대므로 보안 규칙 화이트리스트 안. 여러 번 실행해도 안전(멱등).
// snap을 넘기면 그걸 재사용(records를 두 번 읽지 않음). 무효 처리한 {date,sid} 목록을 반환.
async function sweepStaleRecords(snap) {
  try {
    if (!snap) snap = await db.ref('records').get();
    const today = todayKey();
    const nowH = new Date().getHours();
    const updates = {};
    const invalidated = [];
    snap.forEach(dayNode => {
      const date = dayNode.key;
      const isPast = date < today;
      const isTodayLate = (date === today && nowH >= 22);
      if (isPast || isTodayLate) {
        dayNode.forEach(recNode => {
          const rec = recNode.val();
          if (rec && (rec.status === 'ongoing' || rec.status === 'paused')) {
            const base = 'records/' + date + '/' + recNode.key + '/';
            updates[base + 'status'] = 'invalid';
            updates[base + 'durationSec'] = 0;
            updates[base + 'endAt'] = firebase.database.ServerValue.TIMESTAMP;
            invalidated.push({ date: date, sid: recNode.key });
          }
        });
      }
    });
    if (invalidated.length) await db.ref().update(updates);
    return invalidated;
  } catch (e) {
    console.warn('sweepStaleRecords 실패:', e);
    return [];
  }
}

// 페이지가 브라우저 뒤로가기 캐시(bfcache)에서 복원될 때
// Firebase 연결이 끊긴 상태일 수 있으므로 새로고침해서 최신 데이터 보장
window.addEventListener('pageshow', function(e) {
  if (e.persisted) {
    location.reload();
  }
});
