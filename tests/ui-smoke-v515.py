from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path('/mnt/data/hub_v51_5_work')
ids={'q':'90000000-0000-4000-8000-000000000003','t':'90000000-0000-4000-8000-000000000002','p':'90000000-0000-4000-8000-000000000001'}
issues=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for kind,size in [('desktop',{'width':1320,'height':920}),('mobile',{'width':390,'height':844})]:
  ctx=browser.new_context(viewport=size)
  page=ctx.new_page()
  page.on('pageerror',lambda e:issues.append(str(e)))
  page.set_content('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modalRoot"></div><div id="studentOverlay"></div><div id="toast"></div></body></html>')
  for filename in ['styles.css','eduspace-ui.css','baskerville-centered.css','premium-interface.css','button-contrast.css','unified-typography.css','exam-workspace-v51.css','study-mode-v51.2.css','gifted-brand-enhancements-v51.3.css','refinements-v51.4.css','study-ai-v51.5.css']:
   page.add_style_tag(path=str(root/filename))
  page.evaluate("""const NativeURL=URL;window.URL=class extends NativeURL{constructor(input,base){super(input,base==='null'?'https://fake.local':base)}};window.fetch=async (input,opts={}) => {
    const u=String(input),a=new URL(u,'https://fake.local/').searchParams.get('action'); let out={ok:true};
    if(a==='pool-session-start')out={mode:'study',questions:[{id:'90000000-0000-4000-8000-000000000003',text:'If $2x+4=10$, find the value of $x$.',options:['1','2','3','4'],subject:'Mathematics',topic:'Number bases',passage:null}],progress:{questionIndex:0,answers:{},flags:[]}};
    if(a==='pool-study-ai'){
       const b=JSON.parse(opts.body);
       out={answer: b.mode==='explain'?'To solve $2x+4=10$, subtract 4 from both sides. This gives $2x=6$, so $x=3$. Correct answer: C.':'Another explanation for: '+b.message};
    }
    if(a==='pool-study-answer')out={isCorrect:true,correctAnswer:2,explanation:'2x=6, therefore x=3'};
    return new Response(JSON.stringify(out),{status:200,headers:{'content-type':'application/json'}});
  };""")
  page.add_script_tag(path=str(root/'app.js'))
  page.evaluate("""state.studentPool={id:'90000000-0000-4000-8000-000000000001',slug:'mathematics-2027',name:'Mathematics Questions',description:'Master algebra, numbers, and reasoning.',progress:{},topics:[{id:'90000000-0000-4000-8000-000000000002',name:'Number bases',questionCount:1,percentSolved:0}]};state.studentPoolStage='topics';render();""")
  page.evaluate("""state.studentPoolQuestions=[{id:'90000000-0000-4000-8000-000000000003',text:'If $2x+4=10$, find the value of $x$.',options:['1','2','3','4'],subject:'Mathematics',topic:'Number bases',passage:null}];state.studentPoolMode='study';state.studentPoolStage='study';render();""")
  page.get_by_role('button',name='Ask AI').wait_for(timeout=10000)
  assert not page.locator('.gb-study-ai-panel').count()
  page.get_by_role('button',name='Ask AI').click()
  page.get_by_role('dialog',name='Ask AI study assistant').wait_for(timeout=10000)
  page.get_by_text('Correct answer: C.').wait_for(timeout=10000)
  page.screenshot(path=str(root/f'QA_Study_AI_{kind}.png'),full_page=True)
  panel=page.locator('.gb-study-ai-panel').bounding_box()
  assert panel['width']<=size['width']+1,(kind,panel)
  assert panel['x']>=-1,(kind,panel)
  page.locator('#gbStudyAiInput').fill('Why did you subtract 4?')
  page.locator('.gb-study-ai-compose button[type=submit]').click()
  page.get_by_text('Another explanation for: Why did you subtract 4?').wait_for(timeout=10000)
  page.get_by_role('button',name='Close AI assistant').click()
  assert not page.locator('.gb-study-ai-panel').count()
  print('PASS',kind,'study AI panel, follow-up chat and responsive screen fit')
  ctx.close()
 browser.close()
assert not issues,issues
