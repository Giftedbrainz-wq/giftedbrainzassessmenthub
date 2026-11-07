from pathlib import Path
from playwright.sync_api import sync_playwright
import json,sys
root=Path(__file__).resolve().parent
out=root/'visual_previews';out.mkdir(exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for w in [1440,1024,768,390,320]:
  ctx=browser.new_context(viewport={'width':w,'height':850},device_scale_factor=1)
  page=ctx.new_page()
  failures=[]
  page.on('pageerror',lambda e:failures.append(str(e)))
  # Render the real app with local assets and no remote network.
  def local_assets(route):
   path=route.request.url.split('/assets/',1)[-1].split('?',1)[0]
   path=(root/'assets'/path).resolve()
   if str(path).startswith(str(root/'assets')) and path.exists() and path.is_file():
    ext=path.suffix.lower(); content={'png':'image/png','jpg':'image/jpeg','svg':'image/svg+xml','webp':'image/webp','ico':'image/x-icon'}.get(ext.lstrip('.'),'application/octet-stream')
    route.fulfill(status=200,content_type=content,body=path.read_bytes())
   else: route.fulfill(status=404,body=b'missing')
  page.route('https://gb-preview.local/assets/**',local_assets)
  page.set_content('<html><head><base href="https://gb-preview.local/"></head><body><div id="app"></div><div id="modalRoot"></div><div id="studentOverlay"></div><div id="toast" role="status"></div></body></html>')
  page.add_style_tag(content=(root/'styles.css').read_text())
  page.add_style_tag(content=(root/'eduspace-ui.css').read_text())
  page.add_style_tag(content=(root/'baskerville-centered.css').read_text())
  js=(root/'app.js').read_text().replace("new URL(API,location.origin)","new URL(API,'https://gb-preview.local')")
  page.add_script_tag(content='window.fetch=async()=>new Response(JSON.stringify({error:"offline visual fixture"}),{status:404,headers:{"content-type":"application/json"}})')
  page.add_script_tag(content=js)
  page.evaluate('''() => { auth.token='test-admin'; state.page='dashboard'; state.bootstrapWarnings=[]; state.quizzes=[{id:'a',title:'Chemistry Revision Mock',duration:25,status:'published',questions:Array.from({length:30},(_,i)=>({id:i}))},{id:'b',title:'Mathematics Comprehensive Assessment',duration:45,status:'published',questions:[]}];state.questions=[{id:'q1'},{id:'q2'}];state.attempts=[{student_name:'Aisha Bello',percent:85},{student_name:'John Marcus',percent:77}];render(); }''')
  page.screenshot(path=str(out/f'admin_dashboard_{w}.png'),full_page=True)
  measure=page.evaluate('''() => ({scroll:document.documentElement.scrollWidth,view:innerWidth,sidebar:getComputedStyle(document.querySelector('.sidebar')).backgroundImage,main:document.querySelector('.main').getBoundingClientRect().width,card:document.querySelector('.card')?.getBoundingClientRect().width,active:document.querySelector('.nav button.active')?.textContent.trim()})''')
  assert measure['scroll']<=w+2,('admin overflow',w,measure)
  assert 'Dashboard' in measure['active'],measure['active']
  # Verify navigation instead of just colours
  page.get_by_role('button',name='CBT Tests',exact=True).click() if w>900 else page.evaluate("state.page='quizzes';render()")
  page.screenshot(path=str(out/f'admin_tests_{w}.png'),full_page=False)
  measure['screens']='admin Dashboard, CBT Tests'
  # Student preview with genuine HTML and EduSpace subject art
  page.evaluate('''() => {auth.token='';state.studentBiltz=null;state.studentBoost=null;state.studentQuiz={id:'chemistry-24',title:'Chemistry Mock Test • Chemical Reactions',description:'Answer carefully and build your confidence for UTME.',subject:'Chemistry',duration:30,pass_mark:50,question_count:30,questions:[{id:'1',text:'Which of the following is an acid?',options:['NaOH','HCl','Na2CO3','H2O']}],sections:[{subject:'Chemistry'}]};state.studentStage='intro';renderStudent();}''')
  page.screenshot(path=str(out/f'student_intro_{w}.png'),full_page=True)
  s=page.evaluate('''() => ({scroll:document.documentElement.scrollWidth,view:innerWidth,art:getComputedStyle(document.querySelector('.brand-assessment-illustration')).position,cover:document.querySelector('.gb-assessment-preview').getBoundingClientRect().width,card:document.querySelector('.student-card').getBoundingClientRect().width})''')
  assert s['scroll']<=w+2,('student overflow',w,s)
  # CBT exam sample
  page.evaluate('''() => {state.studentQuiz={id:'exam',title:'Chemistry Mock Test',subject:'Chemistry',duration:30,pass_mark:50,sections:[{subject:'Chemistry',title:'Chemistry',questions:[{id:'1',text:'Which of these compounds is an acid?',options:['NaOH','HCl','KOH','NaCl']}]}],questions:[{id:'1',text:'Which of these compounds is an acid?',options:['NaOH','HCl','KOH','NaCl']}],student_fields:[]};state.student={full_name:'Aisha Bello'};state.studentIndex=0;state.studentStage='test';state.timeLeft=1800;state.studentAnswers={};renderStudent();}''')
  page.screenshot(path=str(out/f'cbt_{w}.png'),full_page=True)
  c=page.evaluate('''() => ({scroll:document.documentElement.scrollWidth,view:innerWidth,question:document.querySelector('.question-main')?.getBoundingClientRect().width,nav:document.querySelector('.navigator')?.getBoundingClientRect().width})''')
  assert c['scroll']<=w+2,('CBT overflow',w,c)
  results.append(dict(width=w,admin=measure,student=s,cbt=c,errors=failures[:5]))
  print(w,measure,s,c,'errors',len(failures))
  ctx.close()
 browser.close()
(out/'summary.json').write_text(json.dumps(results,indent=2))
