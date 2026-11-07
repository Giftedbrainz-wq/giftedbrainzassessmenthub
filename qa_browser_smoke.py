from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
source=(root/'app.js').read_text().replace('new URL(API,location.origin)',"new URL(API,'https://giftedbrainz.test')")
mock_fetch=r'''window.fetch=async function(url,opts={}){
const a=new URL(String(url)).searchParams.get('action');
const val={
'boost-public':{quiz:{slug:'demo-slug',title:'Chemistry Brainz Biltz',description:'Quick knowledge challenge',secondsPerQuestion:30,questionCount:2}},
'boost-start':{attempt:{id:'12345678-1234-4234-9234-123456789012',token:'12345678-1234-4234-9234-123456789013',startedAt:'2026-11-03T12:00:00Z'},serverNow:'2026-11-03T12:00:00Z',quiz:{title:'Chemistry Brainz Biltz',secondsPerQuestion:30},questions:[{id:'12345678-1234-4234-9234-123456789022',position:1,prompt:'What is 2³?',options:['4','6','8','10']},{id:'12345678-1234-4234-9234-123456789023',position:2,prompt:'Which gas is produced by zinc and dilute acid?',options:['Oxygen','Hydrogen','Nitrogen','Chlorine']}]},
'boost-submit':{result:{quizTitle:'Chemistry Brainz Biltz',score:2,total:2,percent:100,studentName:'Ada',timeAllowed:60,timeUsed:30,timedOut:false,review:[{id:'12345678-1234-4234-9234-123456789022',prompt:'What is 2³?',options:['4','6','8','10'],correctIndex:2,selected:2,isCorrect:true,explanation:'2 × 2 × 2 = 8'},{id:'12345678-1234-4234-9234-123456789023',prompt:'Which gas?',options:['Oxygen','Hydrogen','Nitrogen','Chlorine'],correctIndex:1,selected:1,isCorrect:true,explanation:'Hydrogen is evolved'}]}},
'boost-list':{quizzes:[{id:'12345678-1234-4234-9234-123456789020',slug:'demo-slug',title:'Chemistry Brainz Biltz',description:'Separate from CBT',status:'published',question_count:2,seconds_per_question:30}]},
'boost-questions':{questions:[]},
'health':{databaseOk:true,aiConfigured:true},'bootstrap':{quizzes:[],questions:[],attempts:[],libraries:[],pools:[],warnings:[],settings:{}}};
return new Response(JSON.stringify(val[a]||{error:'Mock route not available '+a}),{status:val[a]?200:404,headers:{'content-type':'application/json'}});
};'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 def new_page(w=950):
  page=browser.new_page(viewport={'width':w,'height':800})
  page.set_content('<div id="app"></div><div id="modalRoot"></div><div id="studentOverlay"></div><div id="toast" role="status"></div>')
  page.add_script_tag(content=mock_fetch)
  page.add_style_tag(content=(root/'styles.css').read_text())
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_script_tag(content=source)
  return page,errors
 page,errors=new_page(940)
 page.evaluate("boostLoadPublic('demo-slug')")
 page.wait_for_selector('#boostStudentName',timeout=15000)
 page.locator('#boostStudentName').fill('Ada')
 page.get_by_text('Start Brainz Biltz').click()
 page.wait_for_selector('.boost-answer',timeout=10000)
 page.locator('.boost-answer').nth(2).click()
 page.get_by_text('Next →').click()
 page.locator('.boost-answer').nth(1).click()
 page.get_by_text('Finish Quiz').click()
 page.wait_for_selector('.boost-results',timeout=10000)
 assert '100%' in page.locator('.boost-score').inner_text()
 assert not errors,errors
 page.screenshot(path=str(root/'brainz_biltz_student_smoke.png'),full_page=True)
 print('STUDENT BROWSER SMOKE PASSED')
 admin,admerrors=new_page(1340)
 admin.evaluate("auth.token='mock-admin';state.page='boost';boostLoadAdmin()")
 admin.wait_for_selector('.boost-admin-card',timeout=10000)
 admin.get_by_text('New Brainz Biltz Quiz').click()
 admin.wait_for_selector('#boostTitle',timeout=10000)
 admin.locator('#boostTitle').fill('New Speed Quiz')
 admin.screenshot(path=str(root/'brainz_biltz_admin_smoke.png'),full_page=True)
 assert not admerrors,admerrors
 print('ADMIN BROWSER SMOKE PASSED')
 browser.close()
