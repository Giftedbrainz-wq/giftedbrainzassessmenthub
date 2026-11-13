"""Offline Chromium UI checks. All interactions are local fixtures, not live database tests."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parent
out=root/'visual_previews';out.mkdir(exist_ok=True)
metrics=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for w in [1440,768,390,320]:
  ctx=browser.new_context(viewport={'width':w,'height':900},device_scale_factor=1)
  page=ctx.new_page()
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def asset(route):
   f=(root/'assets'/route.request.url.split('/assets/',1)[-1].split('?',1)[0]).resolve()
   if f.exists() and f.is_file() and str(f).startswith(str(root/'assets')):
    typ={'png':'image/png','jpg':'image/jpeg','ico':'image/x-icon','svg':'image/svg+xml'}.get(f.suffix.lstrip('.'),'application/octet-stream')
    route.fulfill(status=200,content_type=typ,body=f.read_bytes())
   else:route.fulfill(status=404,body=b'missing')
  page.route('https://gb-preview.local/assets/**',asset)
  page.set_content('<html><head><base href="https://gb-preview.local/"></head><body><div id="app"></div><div id="modalRoot"></div><div id="studentOverlay"></div><div id="toast"></div></body></html>')
  page.add_style_tag(content=(root/'styles.css').read_text())
  page.add_style_tag(content=(root/'eduspace-ui.css').read_text())
  page.add_style_tag(content=(root/'baskerville-centered.css').read_text())
  page.add_style_tag(content=(root/'premium-interface.css').read_text())
  source=(root/'app.js').read_text().replace("new URL(API,location.origin)","new URL(API,'https://gb-preview.local')")
  page.add_script_tag(content='window.fetch=async()=>new Response(JSON.stringify({error:"offline QA only"}),{status:404,headers:{"content-type":"application/json"}})')
  page.add_script_tag(content=source)
  page.evaluate('''() => {
   auth.token='test';state.bootstrapWarnings=[];
   state.quizzes=[{id:'a',title:'Chemistry CBT',status:'published',pass_mark:50,duration:30,questions:[],sections:[]}];
   state.questions=[];state.attempts=[];state.feedback=[];state.libraries=[];state.pools=[];
   state.biltzChallenges=[];state.boostQuizzes=[];state.boostQuestions=[];
   state.leaderboards={};
  }''')
  pages=['dashboard','quizzes','questions','ai','results','feedback','libraries','pools','boost','analytics','settings']
  for name in pages:
   try:
    page.evaluate("(name)=>{state.page=name;render()}",name)
    over=page.evaluate('''() => ({left:document.documentElement.scrollWidth,view:innerWidth,title:document.querySelector('.crumb')?.textContent,visibleCard:!!document.querySelector('.content'),nav:!!document.querySelector('.sidebar')})''')
    assert over['left']<=w+2,(name,w,'horizontal page overflow',over)
    assert over['nav'] and over['visibleCard'],(name,w,'missing shell',over)
    if name in ['dashboard','ai','questions','boost','results'] and w in [1440,390]:
     page.screenshot(path=str(out/f'all_admin_{name}_{w}.png'),full_page=False)
    metrics.append(dict(view=name,width=w,scroll=over['left'],status='PASS'))
   except Exception as e:metrics.append(dict(view=name,width=w,status='FAIL',error=str(e)[:500]));print('FAIL',w,name,str(e)[:300])
  # Biltz external challenge landing, using real DOM markup and no server calls.
  page.evaluate('''() => {auth.token='';state.studentBoost=null;state.studentQuiz=null;state.studentBiltzPage=true;state.studentBiltzParticipant=null;
   state.studentBiltz={slug:'fixture',status:'published',title:'Biology Brainz Biltz',description:'Test your understanding of cells and tissues.',
    start_at:new Date(Date.now()+60*60*1000).toISOString(),end_at:new Date(Date.now()+5*60*60*1000).toISOString(),question_count:30,duration_minutes:20,entry_fee:0,access_mode:'public',participant:null};renderBiltzLanding();}''')
  biltz=page.evaluate('''() => ({width:document.documentElement.scrollWidth,view:innerWidth,cards:document.querySelectorAll('.biltz-entry-card').length,background:getComputedStyle(document.querySelector('.biltz-page')).backgroundColor,header:document.querySelector('.biltz-topbar')?.getBoundingClientRect().width})''')
  assert biltz['width']<=w+2,(w,'biltz horizontal overflow',biltz)
  if w in [1440,390]:page.screenshot(path=str(out/f'biltz_public_{w}.png'),full_page=True)
  metrics.append(dict(view='Brainz Biltz public',width=w,status='PASS'))
  # Standalone Biltz, separate from CBT.
  page.evaluate('''() => {state.studentBiltzPage=false;state.studentBiltz=null;state.studentQuiz=null;state.studentBoost={stage:'intro',slug:'test',quiz:{title:'Chemistry Brainz Biltz',description:'A quick Chemistry quiz',questionCount:12,secondsPerQuestion:30}};boostRenderStudent();}''')
  boost=page.evaluate('''() => ({width:document.documentElement.scrollWidth,view:innerWidth,brand:document.querySelector('.boost-brand')?.textContent,card:document.querySelector('.boost-welcome')?.getBoundingClientRect().width})''')
  assert boost['width']<=w+2,(w,'boost horizontal overflow',boost)
  if w in [1440,390]:page.screenshot(path=str(out/f'biltz_standalone_{w}.png'),full_page=True)
  metrics.append(dict(view='Brainz Biltz standalone',width=w,status='PASS'))
  # Admin navigation: menu opens and closes on mobile.
  page.evaluate("state.studentBoost=null;state.studentBiltzPage=false;state.page='dashboard';auth.token='test';render()")
  if w<=900:
   page.locator('.mobile-menu').click()
   assert 'open' in page.locator('.sidebar').get_attribute('class')
   page.locator('#hubMenuScrim').click(position={'x':w-5,'y':250})
   assert 'open' not in page.locator('.sidebar').get_attribute('class')
  # Real EduSpace logo and subject assets must all decode.
  page.evaluate("state.studentQuiz={id:'fixture',title:'Chemistry Mock',description:'Chemistry practice.',subject:'Chemistry',duration:20,pass_mark:50,questions:[],sections:[{subject:'Chemistry'}]};state.studentStage='intro';renderStudent()")
  page.locator('.student-logo').wait_for()
  decoded=page.evaluate('''async()=>{const images=[...document.querySelectorAll('.student-card img')];await Promise.all(images.map(i=>i.decode().catch(()=>{})));return images.map(i=>({src:i.currentSrc||i.src,ok:i.naturalWidth>0}))}''')
  assert decoded and all(d['ok'] for d in decoded),(w,'image decode failure',decoded)
  metrics.append(dict(view='student graphics',width=w,status='PASS',images=decoded))
  ctx.close()
 browser.close()
(out/'all_views_summary.json').write_text(json.dumps(metrics,indent=2))
print('UI route checks:',len(metrics),'passed',sum(x['status']=='PASS' for x in metrics),'failed',sum(x['status']!='PASS' for x in metrics))
print('Page errors recorded:',len(errors),errors[:3])
if any(x['status']!='PASS' for x in metrics):raise SystemExit(1)
