// Local-only browser smoke test. All requests, including Firebase/CDN, are mocked.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function mockBackend() {
  window.__now=Date.parse('2026-11-04T12:00:00+09:00');
  const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__now]));}static now(){return window.__now;}};
  const sid='20101',day='2026-11-04';
  const performanceNow = performance.now.bind(performance);
  const initialNow = window.__now;
  Object.defineProperty(performance, 'now', { value: () => performanceNow() + window.__now - initialNow });
  const data={'.info':{serverTimeOffset:0,connected:true},students:{[sid]:{sid,name:'테스트',cls:'1',seat:'2-1',pin:'1234',totalSec:99999}},records:{},dailyCode:{[day]:'1234'},settings:{applyOpen:true},applications:{[sid]:{sid,name:'테스트',cls:'1',order:1,status:'waiting'}}};
  if (location.search.includes('clock_wait=1')) data['.info']={serverTimeOffset:null,connected:false};
  window.__data=data;window.__fail=false;
  const listeners=[];
  const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const get=p=>p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],data);
  const snap=(v,key)=>({key,val:()=>clone(v)??null,exists:()=>v!=null,numChildren:()=>Object.keys(v||{}).length,forEach:f=>Object.entries(v||{}).forEach(([k,x])=>f(snap(x,k)))});
  const resolve=v=>v?.['.sv']==='timestamp'?Date.now():v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x)])):v;
  const put=(p,v)=>{const a=p.split('/').filter(Boolean);let d=data;for(const k of a.slice(0,-1))d=d[k]??={};if(v===null)delete d[a.at(-1)];else d[a.at(-1)]=resolve(clone(v));};
  const emit=()=>listeners.slice().forEach(l=>l.cb(snap(get(l.p))));
  window.__put=(p,v)=>{put(p,v);emit();};
  const db={goOnline(){},goOffline(){},ref(p=''){return {
    get:async()=>{if(window.__fail)throw new Error('시험용 연결 실패');return snap(get(p));},
    on(event,cb,error){listeners.push({p,cb,error});queueMicrotask(()=>cb(snap(get(p))));},off(event,cb){const i=listeners.findIndex(l=>l.p===p&&l.cb===cb);if(i>=0)listeners.splice(i,1);},
    set:async v=>{if(window.__fail)throw new Error('시험용 저장 실패');put(p,v);emit();},
    remove:async()=>{put(p,null);emit();},
    update:async values=>{if(window.__fail)throw new Error('시험용 저장 실패');for(const[k,v]of Object.entries(values))put(p?p+'/'+k:k,v);emit();},
    transaction:async fn=>{await Promise.resolve();if(window.__fail)throw new Error('시험용 저장 실패');const v=fn(clone(get(p))??null);if(v===undefined)return {committed:false,snapshot:snap(get(p))};put(p,v);emit();const reported=clone(get(p));if(reported){for(const key of ['startAt','segStart','pausedAt','endAt']){if(v?.[key]?.['.sv']==='timestamp')reported[key]-=37;}}return {committed:true,snapshot:snap(reported)};}
  };}};
  const database=()=>db;database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};
  window.firebase={initializeApp(){},database};
  window.QRious=class{toDataURL(){return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');}};
}
(async()=>{
  const browser=await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)});
  try {
    const context=await browser.newContext({timezoneId:'Asia/Seoul'});
    await context.addInitScript(mockBackend);
    await context.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.hostname!=='soongong.test')return route.fulfill({contentType:'text/javascript',body:''});
      const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
      const file=path.join(root,name);
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const contentType=name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.json')?'application/json':'image/png';
      await route.fulfill({contentType,body:fs.readFileSync(file)});
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
      await page.goto('https://soongong.test/'+file+(file==='seat.html'?'?s=2-1':file==='rank.html'?'?sid=20101':''));
      await page.waitForTimeout(50);
      assert.deepEqual(errors,[],file+' raised a page error');
    }
    console.log('PASS: all 15 HTML pages load with a mocked backend');
    await page.goto('https://soongong.test/seat.html?s=2-1');
    await page.locator('#loginSid').fill('20101');await page.getByRole('button',{name:'다음',exact:true}).click();
    for(const k of '1234')await page.locator(`#pinKeypad [data-k="${k}"]`).click();
    for(const k of '1234')await page.locator(`#startKeypad [data-k="${k}"]`).click();
    await page.getByRole('button',{name:'순공 시작 ▶',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#secStudy').classList.contains('active'));
    await page.evaluate(()=>window.__now+=3600*1000);
    await page.getByRole('button',{name:'⏸ 잠시 멈춤 (점심·저녁)',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#secPaused').classList.contains('active'));
    await page.evaluate(()=>window.__now+=3600*1000);
    await page.getByRole('button',{name:'▶ 다시 시작',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#secStudy').classList.contains('active'));
    await page.evaluate(()=>window.__now+=3600*1000);
    await page.locator('#secStudy .btn-pink').click();
    await page.waitForFunction(()=>window.__data.records['2026-11-04']['20101'].status==='done');
    assert.equal(await page.evaluate(()=>window.__data.records['2026-11-04']['20101'].durationSec),7200);
    assert.equal(await page.locator('#studyToday').textContent(),'2시간');
    console.log('PASS: actual UI login → start → pause → resume → finish counts 2 study hours, excludes 1 paused hour');
    await page.goto('https://soongong.test/seat.html?s=2-1');
    await page.locator('#loginSid').fill('20101');await page.getByRole('button',{name:'다음',exact:true}).click();
    for(const k of '1234')await page.locator(`#pinKeypad [data-k="${k}"]`).click();
    for(const k of '1234')await page.locator(`#startKeypad [data-k="${k}"]`).click();
    await page.evaluate(()=>window.__fail=true);
    await page.getByRole('button',{name:'순공 시작 ▶',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#appStatusText')?.textContent.includes('실패'));
    assert.equal(await page.getByRole('button',{name:'순공 시작 ▶',exact:true}).isEnabled(),true);
    await page.evaluate(()=>window.__fail=false);
    await page.getByRole('button',{name:'순공 시작 ▶',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#secStudy').classList.contains('active'));
    console.log('PASS: UI exposes failed save and permits a successful retry');
    await page.goto('https://soongong.test/admin-records.html');
    await page.evaluate(()=>{
      __put('records/2026-11-03/20101',{sid:'20101',name:'과거학생',seat:'2-7',status:'done',durationSec:3600});
      __put('students/20101/active',false);
    });
    assert.equal(await page.locator('#list .row').count(),0);
    await page.locator('#includePast').check();
    assert.equal(await page.locator('#list .row').count(),1);
    assert.match(await page.locator('#list').textContent(),/과거 참여자/);
    await page.goto('https://soongong.test/admin-daily.html');
    await page.evaluate(()=>{
      __put('records/2026-11-03/20101',{sid:'20101',name:'어제학생',seat:'2-7',status:'done',durationSec:3600});
      pickDate('2026-11-03');
    });
    assert.equal(await page.locator('#cAbsent').textContent(),'확인 불가');
    assert.match(await page.locator('#roomView').textContent(),/어제학생/);
    await page.evaluate(()=>__put('rosters/2026-11-03',{students:{'20101':{sid:'20101',name:'어제학생',seat:'2-7'},'20102':{sid:'20102',name:'결석학생',seat:'2-8'}}}));
    assert.equal(await page.locator('#cAbsent').textContent(),'1');
    assert.match(await page.locator('#roomView').textContent(),/결석학생/);
    console.log('PASS: past-participant filter and historical attendance distinguish known absences from unknown rosters');
    await page.goto('https://soongong.test/index.html?clock_wait=1');
    assert.equal(await page.locator('#sid').isDisabled(),true);
    assert.equal(await page.evaluate(()=>typeof window.login),'undefined');
    await page.evaluate(()=>{__put('.info/serverTimeOffset',0);__put('.info/connected',true);});
    await page.waitForFunction(()=>typeof window.login==='function');
    assert.equal(await page.locator('#sid').isEnabled(),true);
    console.log('PASS: page actions wait for connected server time before initialization');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
