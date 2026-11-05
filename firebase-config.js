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

// Firebase 서버 시각에 맞춘 기준점에서 단조 시계로 경과 시간을 계산한다.
// 기기 시계를 바꾸어도 진행 중인 타이머가 갑자기 뛰지 않는다.
let clockConnected = false, clockOffset = null, clockAnchor = null;
let resolveClockReady;
const serverClockReady = new Promise(resolve => { resolveClockReady = resolve; });
function anchorServerClock() {
  if (!clockConnected || !Number.isFinite(clockOffset)) return;
  clockAnchor = { server: Date.now() + clockOffset, wall: Date.now(), monotonic: performance.now() };
  resolveClockReady();
}
function serverNow() {
  if (!clockAnchor) throw new Error('서버 시각을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.');
  return clockAnchor.server + (performance.now() - clockAnchor.monotonic);
}
function requireServerClock() {
  if (!clockConnected || !clockAnchor) throw new Error('서버 연결을 확인한 뒤 다시 시도해 주세요.');
  const wallElapsed = Date.now() - clockAnchor.wall;
  const elapsed = performance.now() - clockAnchor.monotonic;
  if (Math.abs(wallElapsed - elapsed) > 5000) {
    clockConnected = false;
    // 시계 변경 또는 절전 복귀 후 캐시된 보정값으로 저장하지 않는다.
    db.goOffline(); db.goOnline();
    throw new Error('기기 시각 변경 또는 절전 복귀를 감지했습니다. 서버에 다시 연결한 뒤 눌러 주세요.');
  }
}
function kstDate(timestamp = serverNow()) { return new Date(timestamp + 9 * 3600000); }
function kstClock(timestamp) {
  const d = kstDate(timestamp);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
db.ref('.info/serverTimeOffset').on('value', snap => {
  const offset = snap.val();
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    clockOffset = offset;
    anchorServerClock();
  }
}, reportAppError);
db.ref('.info/connected').on('value', snap => {
  clockConnected = snap.val() === true;
  if (clockConnected) anchorServerClock();
  else if (clockAnchor) showAppStatus('서버 연결이 끊겼습니다. 타이머는 계속 표시되지만 저장은 연결 후 다시 시도해 주세요.');
}, reportAppError);

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
  const kst = kstDate();
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
// 상태를 트랜잭션에서 다시 확인하여 정상 완료 기록을 덮어쓰지 않는다.
// snap을 넘기면 그걸 재사용(records를 두 번 읽지 않음). 무효 처리한 {date,sid} 목록을 반환.
function recordDate(rec) {
  return new Date(Number(rec.startAt) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function pastCutoff(date, now = serverNow()) {
  return now >= Date.parse(date + 'T22:00:00+09:00');
}
function canStudyNow(date = todayKey()) {
  const now = serverNow();
  return date === todayKey() && now >= Date.parse(date + 'T07:00:00+09:00') && !pastCutoff(date, now);
}
function activeRecord(rec) { return rec && (rec.status === 'ongoing' || rec.status === 'paused'); }
function studySeconds(rec, now = serverNow()) {
  let sec = Math.max(0, Number(rec.accumSec) || 0);
  if (rec.status === 'ongoing') sec += Math.max(0, Math.floor((now - (rec.segStart || rec.startAt)) / 1000));
  return sec;
}
function sameRecordState(current, expected) {
  return current && expected && ['startAt','segStart','status','accumSec','prevSec'].every(k => current[k] === expected[k]);
}
async function sweepStaleRecords(snap) {
  requireServerClock();
  if (!snap) snap = await db.ref('records').get();
  const candidates = [];
  snap.forEach(day => {
    if (!pastCutoff(day.key)) return;
    day.forEach(child => { if (activeRecord(child.val())) candidates.push({ date: day.key, sid: child.key }); });
  });
  const invalidated = [];
  await Promise.all(candidates.map(async item => {
    const result = await db.ref('records/' + item.date + '/' + item.sid).transaction(rec => {
      if (!rec) return rec;
      requireServerClock();
      if (!activeRecord(rec) || !pastCutoff(item.date)) return;
      return { ...rec, status: 'invalid', durationSec: 0, endAt: firebase.database.ServerValue.TIMESTAMP };
    }, undefined, false);
    if (result.committed && result.snapshot.val()?.status === 'invalid') invalidated.push(item);
  }));
  return invalidated;
}

// 페이지가 브라우저 뒤로가기 캐시(bfcache)에서 복원될 때
// Firebase 연결이 끊긴 상태일 수 있으므로 새로고침해서 최신 데이터 보장
window.addEventListener('pageshow', function(e) {
  if (e.persisted) {
    location.reload();
  }
});

// 완료한 시간만 집계한다. 재입실 중에는 이전에 완료한 prevSec를 유지한다.
// totalSec는 예전 버전의 캐시이므로 집계의 근거로 사용하지 않는다.
function creditedSeconds(rec) {
  if (!rec) return 0;
  if (rec.status === 'done') return Math.max(0, Number(rec.durationSec) || 0);
  if (rec.status === 'ongoing' || rec.status === 'paused') return Math.max(0, Number(rec.prevSec) || 0);
  return 0;
}
function recordTotals(records) {
  const totals = {};
  Object.values(records || {}).forEach(day => {
    Object.entries(day || {}).forEach(([sid, rec]) => {
      totals[sid] = (totals[sid] || 0) + creditedSeconds(rec);
    });
  });
  return totals;
}
function studentsWithTotals(students, records) {
  const totals = recordTotals(records);
  return Object.values(students || {}).map(s => ({ ...s, totalSec: totals[s.sid] || 0 }));
}

// 첫 조회 이후에도 학생·기록 변경을 계속 화면에 반영한다.
function watchValue(ref, callback) {
  ref.on('value', callback, reportAppError);
  return () => ref.off('value', callback);
}
function watchStudyData(callback, includeInactive = false) {
  let students, records;
  const emit = () => {
    if (students !== undefined && records !== undefined) {
      const source = includeInactive ? historicalStudents(students, records) : students;
      const list = studentsWithTotals(source, records);
      callback(includeInactive ? list : list.filter(activeStudent), records);
    }
  };
  const stopStudents = watchValue(db.ref('students'), snap => { students = snap.val() || {}; emit(); });
  const stopRecords = watchValue(db.ref('records'), snap => { records = snap.val() || {}; emit(); });
  return () => { stopStudents(); stopRecords(); };
}

function reportAppError(error) {
  console.error(error);
  const message = error?.code === 'PERMISSION_DENIED' ? '접근 권한이 없어 처리하지 못했습니다. 관리자에게 문의해 주세요.' : (error?.message || '연결을 확인하고 다시 시도해 주세요.');
  showAppStatus('처리하지 못했습니다. ' + message, true);
}
function showAppStatus(message, failed = false) {
  let box = document.getElementById('appStatus');
  if (!box && !message) return;
  if (!box) {
    box = document.createElement('div');
    box.id = 'appStatus'; box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:9999;padding:14px;border-radius:12px;background:#242438;color:white;font-size:14px;text-align:center;box-shadow:0 4px 20px #0008;';
    const text = document.createElement('span'); text.id = 'appStatusText'; box.appendChild(text);
    const retry = document.createElement('button'); retry.id = 'appStatusRetry'; retry.textContent = '새로고침';
    retry.style.cssText = 'margin-left:10px;padding:6px 10px;'; retry.onclick = () => location.reload(); box.appendChild(retry);
    document.body.appendChild(box);
  }
  document.getElementById('appStatusText').textContent = message;
  document.getElementById('appStatusRetry').hidden = !failed;
  box.hidden = !message;
}

let appActionPending = false;
async function runAppAction(action) {
  if (appActionPending) return;
  if (navigator.onLine === false) { showAppStatus('인터넷에 연결한 뒤 다시 시도해 주세요.', true); return; }
  appActionPending = true;
  const buttons = [...document.querySelectorAll('button')].filter(b => !b.disabled);
  buttons.forEach(b => { b.disabled = true; });
  const waiting = setTimeout(() => showAppStatus('서버 응답을 기다리는 중입니다. 중복으로 누르지 말고 연결을 확인해 주세요.'), 1500);
  try {
    requireServerClock();
    await action();
    showAppStatus('');
  } catch (e) {
    reportAppError(e);
  } finally {
    clearTimeout(waiting);
    buttons.forEach(b => { b.disabled = false; });
    appActionPending = false;
  }
}
window.addEventListener('unhandledrejection', event => { event.preventDefault(); reportAppError(event.reason); });
window.addEventListener('offline', () => showAppStatus('인터넷 연결이 끊겼습니다. 저장 중인 작업은 연결이 돌아올 때까지 기다려 주세요.'));
function installActionGuards() {
  // 화면의 변경 작업을 직렬화한다. DB 트랜잭션이 여러 기기의 중복 요청도 차단한다.
  ['savePin','startStudy','pauseStudy','resumeStudy','endStudy','login','toggleApply','reject','restore','promote','goAssign','assignSeat','confirmEmpty','genCode','fixInvalid','doReset'].forEach(name => {
    if (typeof window[name] !== 'function') return;
    const action = window[name];
    window[name] = (...args) => runAppAction(() => action(...args));
  });
}
// 날짜별 DB 구독과 자동 처리가 기기의 잘못된 날짜로 먼저 실행되지 않게 한다.
window.addEventListener('DOMContentLoaded', async () => {
  const controls = [...document.querySelectorAll('button,input,select')].filter(el => !el.disabled);
  controls.forEach(el => { el.disabled = true; });
  const waiting = setTimeout(() => showAppStatus('서버 시각을 확인하고 있습니다. 연결을 확인한 뒤 새로고침해 주세요.', true), 8000);
  await serverClockReady;
  clearTimeout(waiting);
  showAppStatus('');
  document.querySelectorAll('script[type="application/x-soongong"]').forEach(source => {
    const script = document.createElement('script');
    script.textContent = source.textContent;
    document.body.appendChild(script);
  });
  installActionGuards();
  controls.forEach(el => { el.disabled = false; });
});

// 관리자 화면에서 데이터 변경뿐 아니라 마감 시각 도달도 확인한다.
function maintainStaleRecords() {
  let latest = null, pending = false;
  const sweep = async () => {
    if (!latest || pending || !clockConnected || !clockAnchor) return;
    pending = true;
    try { await sweepStaleRecords(latest); }
    catch (e) { reportAppError(e); }
    finally { pending = false; }
  };
  const stop = watchValue(db.ref('records'), snap => { latest = snap; sweep(); });
  const timer = setInterval(sweep, 15000);
  return () => { stop(); clearInterval(timer); };
}

// 같은 학번의 최초 저장만 허용한다. 순번 예약의 빈 번호는 선발 순위에 영향을 주지 않는다.
async function submitApplication(sid, name) {
  const ref = db.ref('applications/' + sid);
  const existing = await ref.get();
  if (existing.exists()) return { application: existing.val(), already: true };
  const count = await db.ref('meta/applyCount').transaction(v => (v || 0) + 1);
  if (!count.committed) throw new Error('신청 순번을 확보하지 못했습니다. 다시 시도해 주세요.');
  const application = {
    sid, name, cls: classFromStudentId(sid), order: count.snapshot.val(),
    appliedAt: firebase.database.ServerValue.TIMESTAMP, status: 'waiting'
  };
  const result = await ref.transaction(current => current === null ? application : undefined, undefined, false);
  const saved = result.snapshot.val();
  if (!saved) throw new Error('신청 정보를 확인하지 못했습니다. 다시 시도해 주세요.');
  return { application: saved, already: !result.committed };
}

function activeStudent(student) { return student && student.active !== false; }
function rosterSnapshot(students) {
  const members = {};
  Object.values(students || {}).filter(activeStudent).forEach(s => {
    members[s.sid] = { sid: s.sid, name: s.name, cls: s.cls || classFromStudentId(s.sid), seat: s.seat || null };
  });
  return { capturedAt: firebase.database.ServerValue.TIMESTAMP, students: members };
}
// 현재 명단/좌석과 그날의 명단 스냅샷을 하나의 요청으로 저장한다.
async function updateStudentsWithRoster(changes) {
  requireServerClock();
  const students = (await db.ref('students').get()).val() || {};
  Object.entries(changes).forEach(([key, value]) => {
    const [root, sid, field] = key.split('/');
    if (root !== 'students' || !sid) throw new Error('학생 변경 경로가 올바르지 않습니다.');
    if (!field) students[sid] = value;
    else { students[sid] = { ...(students[sid] || {}) }; students[sid][field] = value; }
  });
  await db.ref().update({ ...changes, ['rosters/' + todayKey()]: rosterSnapshot(students) });
}
// 새 버전의 최초 기준일을 만든다. 과거 날짜는 현재 명단으로 채우지 않는다.
async function ensureTodayRoster() {
  requireServerClock();
  const date = todayKey();
  const students = (await db.ref('students').get()).val() || {};
  await db.ref('rosters/' + date).transaction(current => current === null ? rosterSnapshot(students) : undefined, undefined, false);
}
function historicalStudents(students, records) {
  const all = { ...(students || {}) };
  const recovered = {};
  Object.keys(records || {}).sort().forEach(date => {
    Object.entries(records[date] || {}).forEach(([sid, rec]) => {
      if (!all[sid]) recovered[sid] = { sid, name: rec.name || sid, cls: classFromStudentId(sid), seat: rec.seat || null, active: false };
    });
  });
  return { ...recovered, ...all };
}
// 변경이 없는 날짜는 직전 명단을 이어 쓰고, 출석 기록의 당시 좌석을 우선한다.
function studentsOnDate(date, rosters, records, currentStudents) {
  const key = Object.keys(rosters || {}).filter(d => d <= date).sort().pop();
  const members = { ...((key && rosters[key].students) || {}) };
  Object.entries((records || {})[date] || {}).forEach(([sid, rec]) => {
    members[sid] = { ...members[sid], sid, name: rec.name || members[sid]?.name || sid, cls: members[sid]?.cls || classFromStudentId(sid), seat: rec.seat || members[sid]?.seat || null };
  });
  return { known: !!key, students: Object.values(members).map(s => ({ ...s, totalSec: currentStudents.find(c => c.sid === s.sid)?.totalSec || 0 })) };
}
