const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const inline = name => [...fs.readFileSync(path.join(root, name), 'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function fixture(at = '2026-11-04T12:00:00+09:00', initial = {}) {
  let now = Date.parse(at), skew = 0, data = { '.info': { serverTimeOffset: 0, connected: true }, ...copy(initial) }, fail = false, provisionalSnapshot = false;
  const listeners = [], elements = new Map(), timers = [], events = {}, pending = [];
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const e = { id, textContent: '', innerHTML: '', value: '', disabled: false, style: {}, hidden: false,
      classList: { add(){}, remove(){}, toggle(){} }, setAttribute(){}, addEventListener(){}, focus(){}, insertAdjacentHTML(position,html){this.innerHTML+=html;},
      appendChild(child){ if(child.id) elements.set(child.id, child); }, querySelector(s){return element(id+s);}, querySelectorAll(){return [];}
    };
    Object.defineProperty(e, 'parentElement', {get:()=>element(id+'/parent')});
    elements.set(id,e); return e;
  }
  function get(p) { return p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],data); }
  function resolved(v) {
    if (v && v['.sv'] === 'timestamp') return now;
    if (Array.isArray(v)) return v.map(resolved);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolved(x)]));
    return v;
  }
  function put(p,v) {
    const bits=p.split('/').filter(Boolean);if(!bits.length){data=resolved(copy(v));return;}
    let cur=data;for(const k of bits.slice(0,-1))cur=cur[k]??={};
    if(v===null)delete cur[bits.at(-1)];else cur[bits.at(-1)]=resolved(copy(v));
  }
  function snap(v,key) { const value=copy(v);return {key,val:()=>copy(value)??null,exists:()=>value!=null,forEach:f=>Object.entries(value||{}).forEach(([k,x])=>f(snap(x,k))),numChildren:()=>Object.keys(value||{}).length}; }
  function emit() { for(const l of [...listeners]) l.cb(snap(get(l.p))); }
  const db = {goOffline(){put('.info/connected',false);emit();},goOnline(){put('.info/serverTimeOffset',-skew);put('.info/connected',true);emit();},ref(p=''){ return {
    get:async()=>{if(fail)throw new Error('test read failure');return snap(get(p));},
    on(type,cb,error){listeners.push({p,cb,error});cb(snap(get(p)));},
    off(type,cb){const i=listeners.findIndex(l=>l.p===p&&l.cb===cb);if(i>=0)listeners.splice(i,1);},
    set:async v=>{if(fail)throw new Error('test write failure');put(p,v);emit();},
    remove:async()=>{if(fail)throw new Error('test write failure');put(p,null);emit();},
    update:async obj=>{if(fail)throw new Error('test write failure');for(const[k,v]of Object.entries(obj))put(p?p+'/'+k:k,v);emit();},
    transaction:async fn=>{await Promise.resolve();if(fail)throw new Error('test transaction failure');const next=fn(copy(get(p))??null);if(next===undefined)return {committed:false,snapshot:snap(get(p))};put(p,next);emit();const reported=copy(get(p));if(provisionalSnapshot && reported){for(const k of ['startAt','segStart','pausedAt','endAt']){if(next?.[k]?.['.sv']==='timestamp')reported[k]-=37;}}return {committed:true,snapshot:snap(reported)};}
  };}};
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now+skew]));}static now(){return now+skew;}}
  const database=()=>db;database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};
  const c=vm.createContext({console:{log(){},warn(){},error(){}},Date:Clock,performance:{now:()=>now},URLSearchParams,URL,Blob,
    navigator:{onLine:true},location:{search:'?s=2-1&sid=20101',reload(){},origin:'https://example.test',pathname:'/index.html'},
    window:{addEventListener(name,cb){events[name]=cb;}},document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],createElement:()=>element('created-'+elements.size),body:element('body')},
    firebase:{initializeApp(){},database},setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},setInterval(fn){timers.push(fn);return timers.length;},clearInterval(){},confirm:()=>true,prompt:()=> '120'
  });
  const run=src=>vm.runInContext(src,c);
  run(fs.readFileSync(path.join(root,'firebase-config.js'),'utf8'));
  function load(name) {run(inline(name).replace(/^\s*init\(\);/m,''));}
  function seat(rec) {load('seat.html');run("curStudent={sid:'20101',name:'학생',seat:'2-1'};calcRank=async()=>1;");if(rec)c.expected=copy(rec);}
  return {c,run,load,seat,provisional:()=>{provisionalSnapshot=true;},get:(p)=>copy(get(p)),set:(p,v)=>{put(p,v);emit();},element,events,timers,listeners,fail:()=>{fail=true;},recover:()=>{fail=false;},skew:ms=>{skew=ms;},clock:s=>{now=Date.parse(s);}};
}
const sid='20101', day='2026-11-04', recordPath=`records/${day}/${sid}`;
function rec(status='paused') {return {sid,name:'학생',seat:'2-1',startAt:Date.parse('2026-11-04T10:00:00+09:00'),segStart:Date.parse('2026-11-04T11:00:00+09:00'),status,accumSec:3600,prevSec:0};}
function withRec(r,at) { const f=fixture(at,{records:{[day]:{[sid]:r}},students:{[sid]:{sid,name:'학생',seat:'2-1',totalSec:999999}}});f.seat(r);return f; }

test('all inline scripts and manifests parse',()=>{for(const file of fs.readdirSync(root)){if(file.endsWith('.html'))new vm.Script(inline(file),{filename:file});if(file.endsWith('.js'))new vm.Script(fs.readFileSync(path.join(root,file),'utf8'));if(file.endsWith('.json'))JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}});
test('two finishes produce one committed record, no duplicate total',async()=>{const f=withRec(rec());const results=await Promise.allSettled([f.run('doEnd(expected)'),f.run('doEnd(expected)')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.get(recordPath).durationSec,3600);assert.equal(f.run("recordTotals({ '2026-11-04': { '20101': curRec } })['20101']"),3600);});
test('a stale tab cannot finish a later session',async()=>{const f=withRec(rec());f.set(recordPath,{...rec(),startAt:Date.parse('2026-11-04T11:30:00+09:00')});await assert.rejects(f.run('doEnd(expected)'));assert.equal(f.get(recordPath).status,'paused');});
test('normal finish adds previous completed time exactly once',async()=>{const f=withRec({...rec(),prevSec:1800});await f.run('doEnd(expected)');assert.equal(f.get(recordPath).durationSec,5400);});
test('midnight finish invalidates original day without creating tomorrow',async()=>{const f=withRec(rec('ongoing'),'2026-11-05T00:10:00+09:00');await f.run('doEnd(expected)');assert.equal(f.get(recordPath).status,'invalid');assert.equal(f.get(recordPath).durationSec,0);assert.equal(f.get('records/2026-11-05'),undefined);});
test('cutoff is exactly 22:00 KST',()=>{const f=fixture();assert.equal(f.run("pastCutoff('2026-11-04',Date.parse('2026-11-04T21:59:59+09:00'))"),false);assert.equal(f.run("pastCutoff('2026-11-04',Date.parse('2026-11-04T22:00:00+09:00'))"),true);});
test('late whole-day invalidation removes morning credit but preserves other days',async()=>{const f=withRec({...rec(),prevSec:3600},'2026-11-04T22:01:00+09:00');f.set('records/2026-11-03/20101',{status:'done',durationSec:7200});await f.run('doEnd(expected)');f.c.records=f.get('records');assert.equal(f.run('recordTotals(records)["20101"]'),7200);});
test('resume after cutoff invalidates rather than restarting',async()=>{const f=withRec(rec(),'2026-11-04T22:01:00+09:00');f.run('curRec=expected');await f.run('resumeStudy()');assert.equal(f.get(recordPath).status,'invalid');});
test('pause/resume do not count the paused interval',async()=>{const f=withRec({...rec('ongoing'),accumSec:0});f.run('curRec=expected');await f.run('pauseStudy()');assert.equal(f.get(recordPath).accumSec,3600);f.clock('2026-11-04T13:00:00+09:00');await f.run('resumeStudy()');f.clock('2026-11-04T14:00:00+09:00');await f.run('doEnd(curRec)');assert.equal(f.get(recordPath).durationSec,7200);});
test('duplicate start preserves the existing session',async()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'학생',seat:'2-1'}},dailyCode:{[day]:'1234'}});f.seat();f.run("codeVal='1234'");const out=await Promise.allSettled([f.run('startStudy()'),f.run('startStudy()')]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.get(recordPath).status,'ongoing');});
test('re-entry preserves already completed credit',async()=>{const f=withRec({...rec(),status:'done',durationSec:3600});f.set(`dailyCode/${day}`,'1234');f.run("codeVal='1234'");await f.run('startStudy()');assert.equal(f.get(recordPath).prevSec,3600);f.c.current=f.get(recordPath);assert.equal(f.run('creditedSeconds(current)'),3600);});
test('today display includes previous and active time, not historic total',()=>{const f=withRec({...rec('ongoing'),prevSec:1800,accumSec:0});f.run('goStudy(expected)');assert.equal(f.element('studyToday').textContent,'1시간 30분');});
test('failed finish leaves active record retryable',async()=>{const f=withRec(rec());f.fail();await assert.rejects(f.run('doEnd(expected)'));assert.equal(f.get(recordPath).status,'paused');f.recover();await f.run('doEnd(expected)');assert.equal(f.get(recordPath).durationSec,3600);});
test('sweep does not overwrite a completion from a newer snapshot',async()=>{const f=withRec(rec(),'2026-11-04T22:01:00+09:00');f.run("globalThis.oldSnapPromise=db.ref('records').get()");f.set(recordPath,{...rec(),status:'done',durationSec:3600});await f.run('oldSnapPromise.then(sweepStaleRecords)');assert.equal(f.get(recordPath).status,'done');});
test('live totals update on start/end/invalid and unsubscribe cleanly',()=>{const f=fixture();f.run('globalThis.values=[];globalThis.stop=watchStudyData((students,records)=>values.push(students))');f.set('students/20101',{sid,name:'학생',totalSec:99999});f.set(recordPath,{...rec(),prevSec:3600});assert.equal(f.run('values.at(-1)[0].totalSec'),3600);f.set(recordPath,{...rec(),status:'done',durationSec:7200});assert.equal(f.run('values.at(-1)[0].totalSec'),7200);f.set(recordPath,{...rec(),status:'invalid'});assert.equal(f.run('values.at(-1)[0].totalSec'),0);f.run('stop()');assert.equal(f.listeners.filter(l=>!l.p.startsWith('.info/')).length,0);});
test('ranking page reflects completed credit during re-entry, then new completion',()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'학생',seat:'2-1'}},records:{[day]:{[sid]:{...rec(),prevSec:3600}}}});f.load('rank.html');assert.equal(f.element('myToday').textContent,'1시간');f.set(recordPath,{...rec(),status:'done',durationSec:7200});assert.equal(f.element('myToday').textContent,'2시간');assert.equal(f.element('myTotal').textContent,'2시간');});
test('teacher recognition is conditional and cannot double credit',async()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'학생'}},records:{[day]:{[sid]:{...rec(),status:'invalid',prevSec:3600}}}});f.load('admin-records.html');const out=await Promise.allSettled([f.run("fixInvalid('2026-11-04','20101')"),f.run("fixInvalid('2026-11-04','20101')")]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.get(recordPath).durationSec,7200);assert.equal(f.run('stats["20101"].total'),7200);});
test('action lock suppresses double clicks and unlocks after failure',async()=>{const f=fixture();f.run('globalThis.calls=0;globalThis.release=null;globalThis.waiting=new Promise(r=>release=r)');const a=f.run('runAppAction(async()=>{calls++;await waiting;throw new Error("저장 실패")})');await f.run('runAppAction(async()=>{calls++})');assert.equal(f.run('calls'),1);f.run('release()');await a;assert.equal(f.run('appActionPending'),false);assert.match(f.element('appStatusText').textContent,/저장 실패/);await f.run('runAppAction(async()=>{calls++})');assert.equal(f.run('calls'),2);});
test('offline actions do not write and display a retry instruction',async()=>{const f=fixture();f.run('navigator.onLine=false;globalThis.calls=0');await f.run('runAppAction(()=>calls++)');assert.equal(f.run('calls'),0);assert.match(f.element('appStatusText').textContent,/인터넷/);});
test('subscription permission failures surface to the user',()=>{const f=fixture();f.run("watchValue(db.ref('students'),()=>{})");f.listeners[0].error({code:'PERMISSION_DENIED'});assert.match(f.element('appStatusText').textContent,/접근 권한/);});
test('QR page no longer loads Firebase configuration',()=>assert.doesNotMatch(fs.readFileSync(path.join(root,'admin-qr.html'),'utf8'),/firebase-config/));
test('an idle admin page invalidates at cutoff without a database event',async()=>{const f=fixture('2026-11-04T21:59:00+09:00',{records:{[day]:{[sid]:rec()}}});f.run('maintainStaleRecords()');await Promise.resolve();await Promise.resolve();f.clock('2026-11-04T22:00:00+09:00');await f.timers.at(-1)();assert.equal(f.get(recordPath).status,'invalid');});
test('a closed day cannot be resumed or overwritten by a fresh start',async()=>{const f=withRec({...rec(),status:'invalid'});f.set('dailyCode/2026-11-04','1234');f.run("codeVal='1234'");await assert.rejects(f.run('startStudy()'));assert.equal(f.get(recordPath).status,'invalid');});
test('concurrent applications preserve the first name and order',async()=>{const f=fixture();const [a,b]=await Promise.all([f.run("submitApplication('20101','첫 신청')"),f.run("submitApplication('20101','중복 신청')")]);assert.equal([a,b].filter(x=>!x.already).length,1);assert.equal(a.application.order,b.application.order);assert.equal(a.application.name,b.application.name);assert.equal(f.get('applications/20101').name,a.application.name);});
test('retry of an existing application does not reserve a new order or change rejection',async()=>{const f=fixture(undefined,{applications:{[sid]:{sid,name:'기존 이름',order:3,status:'rejected'}},meta:{applyCount:8}});const result=await f.run("submitApplication('20101','다른 이름')");assert.equal(result.already,true);assert.equal(result.application.name,'기존 이름');assert.equal(result.application.status,'rejected');assert.equal(f.get('meta/applyCount'),8);});
test('different simultaneous applicants get distinct orders',async()=>{const f=fixture();const a=await Promise.all([f.run("submitApplication('20101','학생1')"),f.run("submitApplication('20102','학생2')")]);assert.notEqual(a[0].application.order,a[1].application.order);});
test('inactive students stay out of live lists but remain in historical lists',()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'과거',active:false},'20102':{sid:'20102',name:'현재'}},records:{[day]:{[sid]:{...rec(),status:'done',durationSec:3600}}}});f.run('globalThis.current=[];globalThis.history=[];watchStudyData(s=>current=s);watchStudyData(s=>history=s,true)');assert.equal(f.run('current.length'),1);assert.equal(f.run('history.length'),2);assert.equal(f.run('history.find(s=>s.sid==="20101").totalSec'),3600);});
test('records from previously deleted students remain recoverable',()=>{const f=fixture();f.c.records={[day]:{[sid]:{...rec(),name:'과거 학생',status:'done',durationSec:3600}}};assert.equal(f.run('historicalStudents({},records)["20101"].active'),false);assert.equal(f.run('historicalStudents({},records)["20101"].name'),'과거 학생');});
test('student deactivation preserves PIN and records, writes only public roster fields',async()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'학생',pin:'1234',seat:'2-1'}},records:{[day]:{[sid]:rec()}}});await f.run("updateStudentsWithRoster({'students/20101/active':false,'students/20101/seat':null})");assert.equal(f.get('students/20101/pin'),'1234');assert.equal(f.get('students/20101/active'),false);assert.equal(f.get(recordPath).name,'학생');assert.deepEqual(f.get('rosters/2026-11-04/students'),{});});
test('seat changes preserve earlier daily rosters and carry unchanged membership forward',async()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'학생',pin:'1234',seat:'2-1'}}});await f.run('ensureTodayRoster()');assert.equal(f.get('rosters/2026-11-04/students/20101/pin'),undefined);f.clock('2026-11-06T12:00:00+09:00');await f.run("updateStudentsWithRoster({'students/20101/seat':'3-21'})");assert.equal(f.get('rosters/2026-11-04/students/20101/seat'),'2-1');f.c.rosters=f.get('rosters');assert.equal(f.run("studentsOnDate('2026-11-05',rosters,{},[]).students[0].seat"),'2-1');assert.equal(f.run("studentsOnDate('2026-11-06',rosters,{},[]).students[0].seat"),'3-21');});
test('past daily attendance uses historical seats and preserves absentees',()=>{const f=fixture();f.c.rosters={[day]:{students:{[sid]:{sid,name:'출석',seat:'2-1'},'20102':{sid:'20102',name:'결석',seat:'2-2'}}}};f.c.records={[day]:{[sid]:{...rec(),seat:'2-5'}}};assert.equal(f.run("studentsOnDate('2026-11-04',rosters,records,[]).students.length"),2);assert.equal(f.run("studentsOnDate('2026-11-04',rosters,records,[]).students.find(s=>s.sid==='20101').seat"),'2-5');});
test('dates before the first roster expose unknown attendance instead of invented absences',()=>{const f=fixture();f.c.rosters={'2026-11-05':{students:{[sid]:{sid,name:'현재'}}}};f.c.records={[day]:{[sid]:rec()}};assert.equal(f.run("studentsOnDate('2026-11-04',rosters,records,[]).known"),false);assert.equal(f.run("studentsOnDate('2026-11-04',rosters,records,[]).students.length"),1);assert.equal(f.run("studentsOnDate('2026-11-03',rosters,records,[]).students.length"),0);});
test('failed roster write does not partially change current assignments',async()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'학생',seat:'2-1'}}});f.fail();await assert.rejects(f.run("updateStudentsWithRoster({'students/20101/seat':'2-2'})"));assert.equal(f.get('students/20101/seat'),'2-1');assert.equal(f.get('rosters'),undefined);});
test('an inactive student cannot start from an old open seat page',async()=>{const f=withRec({...rec(),status:'done',durationSec:3600});f.set('students/20101/active',false);f.set('dailyCode/2026-11-04','1234');f.run("codeVal='1234'");await assert.rejects(f.run('startStudy()'));assert.equal(f.get(recordPath).status,'done');});
test('reconfirming participants archives excluded students and keeps their records and PIN',async()=>{const f=fixture(undefined,{students:{[sid]:{sid,name:'기존',seat:'2-1',pin:'1234'},'20102':{sid:'20102',name:'복귀',active:false,seat:'2-2',pin:'5678'}},applications:{'20102':{sid:'20102',name:'복귀',cls:'1',order:1,status:'waiting'}},records:{[day]:{[sid]:rec()}}});f.load('admin-apply.html');await f.run('goAssign()');assert.equal(f.get('students/20101/active'),false);assert.equal(f.get('students/20101/pin'),'1234');assert.equal(f.get(recordPath).sid,sid);assert.equal(f.get('students/20102/active'),true);assert.equal(f.get('students/20102/seat'),undefined);assert.equal(f.get('students/20102/pin'),'5678');assert.equal(f.get('rosters/2026-11-04/students/20101'),undefined);});
test('server offset corrects a phone clock that is one day fast',()=>{const f=fixture();f.skew(86400000);f.set('.info/serverTimeOffset',-86400000);assert.equal(f.run('todayKey()'),'2026-11-04');assert.equal(f.run('serverNow()'),Date.parse('2026-11-04T12:00:00+09:00'));assert.equal(f.run('canStudyNow()'),true);});
test('server offset corrects a slow phone clock across midnight',()=>{const f=fixture('2026-11-05T00:10:00+09:00');f.skew(-7200000);f.set('.info/serverTimeOffset',7200000);assert.equal(f.run('todayKey()'),'2026-11-05');assert.equal(f.run('canStudyNow()'),false);});
test('changing device time during study cannot inflate recorded time',async()=>{const f=withRec(rec('ongoing'));const before=f.run('studySeconds(expected)');f.skew(3600000);assert.equal(f.run('studySeconds(expected)'),before);await assert.rejects(f.run('doEnd(expected)'),/기기 시각/);assert.equal(f.get(recordPath).status,'ongoing');await f.run('doEnd(expected)');assert.equal(f.get(recordPath).durationSec,before);});
test('disconnected server blocks a finish even when browser reports online',async()=>{const f=withRec(rec());f.set('.info/connected',false);await assert.rejects(f.run('doEnd(expected)'),/서버 연결/);assert.equal(f.get(recordPath).status,'paused');});
test('server clock must be ready before any time-dependent action',async()=>{const f=withRec(rec());f.run('clockAnchor=null');await assert.rejects(f.run('doEnd(expected)'),/서버 연결/);assert.equal(f.get(recordPath).status,'paused');});
test('KST display is independent of host timezone',()=>{const f=fixture();assert.equal(f.run("kstClock(Date.parse('2026-11-04T03:15:00Z'))"),'12:15');});
test('background cleanup never invalidates early because the phone clock is fast',async()=>{const f=withRec(rec(),'2026-11-04T21:00:00+09:00');f.skew(7200000);f.set('.info/serverTimeOffset',-7200000);await f.run('sweepStaleRecords()');assert.equal(f.get(recordPath).status,'paused');});

test('provisional transaction timestamps do not require refreshing before pause or after resume',async()=>{
  const f=fixture(undefined,{students:{[sid]:{sid,name:'학생',seat:'2-1'}},dailyCode:{[day]:'1234'}});
  f.seat();f.provisional();f.run("codeVal='1234'");await f.run('startStudy()');
  assert.equal(f.run('curRec.startAt'),f.get(recordPath).startAt);
  f.clock('2026-11-04T12:02:00+09:00');await f.run('pauseStudy()');
  assert.equal(f.get(recordPath).status,'paused');
  f.clock('2026-11-04T12:03:00+09:00');await f.run('resumeStudy()');
  assert.equal(f.run('curRec.segStart'),f.get(recordPath).segStart);
  f.clock('2026-11-04T12:05:00+09:00');await f.run('pauseStudy()');
  await f.run('doEnd(curRec)');assert.equal(f.get(recordPath).durationSec,240);
});
