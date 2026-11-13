const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const API='/api';
const TAB_SWITCH_LIMIT=3;
const storage={get(key){try{return localStorage.getItem(key)||'';}catch{return '';}},set(key,value){try{localStorage.setItem(key,value);}catch{}},remove(key){try{localStorage.removeItem(key);}catch{}}};
const auth={token:storage.get('gb_admin_token')};
const app=$('#app');
const theme={mode:'light'};
const studentTheme={mode:'light'};
const state={libraryActivationCode:null,libraryDevices:{},poolDevices:{},quizActivationCode:null,quizDevices:{},adminWhatsAppNumber:'',page:'dashboard',quizzes:[],questions:[],attempts:[],leaderboards:{},libraries:[],feedback:[],feedbackLoading:false,bootstrapWarnings:[],activeQuiz:null,modal:null,aiDraft:[],student:null,studentQuiz:null,studentStage:'intro',studentAnswers:{},studentFlags:new Set(),studentIndex:0,studentSection:null,studentSectionIndexes:{},studentAttemptId:null,studentAttemptToken:null,studentAttemptNumber:0,studentMaxAttempts:1,whatsappOpened:false,studentImageCache:{},studentImagePending:new Set(),studentImageFailed:new Set(),tabSwitchPending:false,timeLeft:0,timer:null,startedAt:null,violations:0,submitting:false,submitError:null,submitRetryCount:0,lastSubmitAuto:false,autoSubmitQueued:false,studentFeedbackSending:false,studentFeedbackSubmitted:false,studentLeaderboardOpen:false,studentLeaderboardRows:[],studentLeaderboardLoading:false,selectedQuestionIds:new Set(),builderSelectedIds:new Set(),deviceId:null,authError:'',health:null,healthLoading:false,healthChecked:false,authRecovery:false,
pools:[],poolActivationCode:null,poolTopicQuestions:{},poolTopicQuestionsLoading:{},poolQuestionSelection:new Set(),
studentPool:null,studentPoolStage:'topics',studentPoolSelectedTopics:new Set(),studentPoolMode:'study',studentPoolQuestions:[],studentPoolIndex:0,studentPoolAnswers:{},studentPoolFlags:new Set(),studentPoolFeedbackMap:{},studentPoolAttempt:null,studentPoolTimeLeft:0,studentPoolTimer:null,studentPoolResult:null,studentPoolSubmitting:false,studentPoolStarting:false,studentPoolPracticeCount:'',studentPoolPracticeDuration:'',biltzChallenges:[],biltzLoaded:false,biltzLoading:false,biltzFormVisible:false,biltzEditId:null,biltzParticipantsFor:null,biltzParticipants:[],biltzParticipantsLoading:false,biltzLeaderboard:null,biltzCountdownTimer:null,studentBiltz:null,studentBiltzParticipant:null,studentBiltzPage:false,studentBiltzSlug:'',studentBiltzMessage:'',studentBiltzRegistering:false};
function applyAdminTheme(){document.body?.classList.remove('admin-theme','student-dark');document.documentElement.style.colorScheme='light';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content='#0B2D5C';}
function applyStudentTheme(){document.body?.classList.remove('admin-theme','student-dark');document.documentElement.style.colorScheme='light';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content='#0B2D5C';}
function officialLogoHtml(){return `<div class="official-logo-frame"><img class="official-leaderboard-logo" src="assets/icon.png" alt="Gifted Brainz official logo"></div>`;}
function studentThemeToggle(){return '';}
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const escAttr=s=>esc(s);
const safeImageSrc=value=>{const v=String(value??'').trim();const dataOk=/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(v);if(dataOk)return v;try{const u=new URL(v);return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const MAX_STORED_IMAGE_CHARS=1200000;
// Document imports may contain up to 1,000 questions. The save API retains its
// per-request 500-row safety limit; the client commits smaller verified batches.
const MAX_DOCUMENT_EXTRACTION_QUESTIONS=1000;
const DOCUMENT_EXTRACT_CHUNK_QUESTIONS=25;
const DRAFT_SAVE_BATCH_SIZE=100;
const DRAFT_REVIEW_PAGE_SIZE=25;
async function compressImageDataForUpload(value,maxChars=1100000){
  const src=safeImageSrc(value);
  if(!src)return null;
  if(!src.startsWith('data:image/')||src.length<=maxChars)return src;
  if(typeof Image==='undefined'||typeof document==='undefined')return src;
  return await new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const maxDimension=1600;
        const scale=Math.min(1,maxDimension/(img.naturalWidth||img.width||1),maxDimension/(img.naturalHeight||img.height||1));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round((img.naturalWidth||img.width||1)*scale));
        canvas.height=Math.max(1,Math.round((img.naturalHeight||img.height||1)*scale));
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        let quality=0.78;let out=canvas.toDataURL('image/jpeg',quality);
        while(out.length>maxChars&&quality>0.42){quality-=0.06;out=canvas.toDataURL('image/jpeg',quality);}
        if(out.length<=maxChars){resolve(out);return;}
        let w=canvas.width,h=canvas.height;
        for(let attempt=0;attempt<4&&out.length>maxChars;attempt++){
          w=Math.max(640,Math.round(w*0.82));h=Math.max(480,Math.round(h*0.82));
          const smaller=document.createElement('canvas');smaller.width=w;smaller.height=h;
          const c2=smaller.getContext('2d',{alpha:false});c2.fillStyle='#ffffff';c2.fillRect(0,0,w,h);c2.drawImage(img,0,0,w,h);
          out=smaller.toDataURL('image/jpeg',0.64);
        }
        resolve(out.length<=maxChars?out:null);
      }catch{resolve(null);}
    };
    img.onerror=()=>resolve(null);
    img.src=src;
  });
}
const fmt=s=>{s=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const num=s=>{const n=Number(s);if(!Number.isFinite(n))return '0';return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')};
const wholeScore=score=>{const n=Number(score);return Number.isFinite(n)?String(Math.round(n)):'0';};
const leaderboardScore=score=>wholeScore(score);
const leaderboardScoreLabel=score=>wholeScore(score);
const scoreOverTotalLabel=(score,total)=>`${wholeScore(score)} / ${wholeScore(total)}`;
const leaderboardRankLabel=rank=>String(Math.max(1,Math.trunc(Number(rank)||0)));
const percentLabel=p=>`${Math.round(Number(p)||0)}%`;
const subjectScoresHtml=(items,aggregate,total)=>{
  const rows=Array.isArray(items)?items.filter(x=>x&&String(x.name||'').trim()):[];
  if(rows.length<2)return '';
  return `<section class="subject-score-panel" aria-label="Subject scores"><div class="subject-score-heading"><div><div class="eyebrow">SUBJECT / SECTION PERFORMANCE</div><h3>Scores by Subject / Section</h3><p class="sub">Your earned score in each subject or section.</p></div></div><div class="subject-score-grid">${rows.map((x,i)=>`<div class="subject-score-item"><span>${esc(x.name)}</span><strong>${leaderboardScore(x.score)}</strong></div>`).join('')}</div><div class="aggregate-score-row"><span>Aggregate</span><strong>${scoreOverTotalLabel(aggregate,total)}</strong></div></section>`;
};
const sanitizeFileName=s=>String(s||'leaderboard').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'leaderboard';
const getDeviceId=()=>{
 if(state.deviceId)return state.deviceId;
 const key='gb_device_id_v1';let id=storage.get(key);
 if(!id){try{id=sessionStorage.getItem(key)||''}catch{}}
 if(!id){try{id=decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith(key+'='))?.split('=').slice(1).join('=')||'')}catch{}}
 if(!/^[A-Za-z0-9_-]{8,200}$/.test(id))id='';
 if(!id){try{id=crypto.randomUUID()}catch{id=`gb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}}
 storage.set(key,id);
 try{sessionStorage.setItem(key,id)}catch{}
 try{document.cookie=key+'='+encodeURIComponent(id)+'; Max-Age=31536000; Path=/; SameSite=Lax; Secure'}catch{}
 state.deviceId=id;return id;
};
// Candidate's preferred display name is a convenience setting, never an
// authentication credential. Per-CBT additional fields are still collected.
const CANDIDATE_NAME_KEY='gb:candidate-preferred-name:v1';
const candidateSavedName=()=>String(storage.get(CANDIDATE_NAME_KEY)||'').trim().slice(0,200);
function candidateNameField(fields){return (fields||[]).find(f=>f.key==='full_name')||(fields||[]).find(f=>/^(name|student_name)$/i.test(f.key||''))||(fields||[]).find(f=>/^(full|student|candidate)\s*name$/i.test(f.label||''))||null;}
function advanceStudentIntro(){
 const fields=state.studentQuiz?.student_fields?.length?state.studentQuiz.student_fields:[{key:'full_name',label:'Full Name',type:'text',required:true}];
 const name=candidateSavedName(),nameField=candidateNameField(fields);
 state.student={...(state.student||{}),...(name&&nameField?{[nameField.key]:name}:{})};
 // Only the candidate's name is reused; administrator-added fields are never
 // auto-filled from unrelated CBTs.
 const additional=fields.some(f=>!nameField||f.key!==nameField.key);
 state.studentSkippedDetails=Boolean(name&&nameField&&!additional);
 state.studentStage=state.studentSkippedDetails?'instructions':'details';renderStudent();
}
function changeCandidateName(){storage.remove(CANDIDATE_NAME_KEY);state.student={...(state.student||{})};const f=candidateNameField(state.studentQuiz?.student_fields||[]);if(f)delete state.student[f.key];state.studentSkippedDetails=false;state.studentStage='details';renderStudent();}
const mathHtml=value=>{
  let source=String(value??'');
  if(!source.trim())return '';

  const fallbackMath=(tex,display=false)=>{
    let x=esc(String(tex??'').trim());
    const symbolMap={'\\times':'×','\\div':'÷','\\pm':'±','\\leq':'≤','\\geq':'≥','\\neq':'≠','\\approx':'≈','\\cdot':'·','\\infty':'∞','\\pi':'π','\\theta':'θ','\\alpha':'α','\\beta':'β','\\gamma':'γ','\\delta':'δ','\\lambda':'λ','\\mu':'μ','\\sigma':'σ','\\phi':'φ','\\omega':'ω'};
    Object.entries(symbolMap).forEach(([k,v])=>x=x.replaceAll(k,v));
    x=x.replace(/\\(?:left|right)\b/g,'');
    x=x.replace(/\\begin\{(?:pmatrix|bmatrix|matrix)\}([\s\S]*?)\\end\{(?:pmatrix|bmatrix|matrix)\}/g,(_,body)=>{const rows=body.split(/\\\\/).map(r=>r.split(/&(?:amp;)?/).map(c=>`<span>${c}</span>`).join(''));return `<span class=\"gb-matrix\">${body.split(/\\\\/).map(r=>`<span class=\"gb-matrix-row\">${r.split(/&(?:amp;)?/).map(c=>`<span>${c}</span>`).join('')}</span>`).join('')}</span>`;});
    x=x.replace(/\\sqrt\s*\{([^{}]*)\}/g,'<span class=\"gb-sqrt\">√<span>$1</span></span>');
    let prev='';
    for(let n=0;n<8&&x!==prev;n++){prev=x;x=x.replace(/\\(?:d?frac|tfrac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,'<span class=\"gb-frac\"><span>$1</span><span>$2</span></span>');}
    x=x.replace(/\^\{([^{}]+)\}/g,'<sup>$1</sup>').replace(/\^([A-Za-z0-9]+)/g,'<sup>$1</sup>').replace(/_\{([^{}]+)\}/g,'<sub>$1</sub>').replace(/_([A-Za-z0-9]+)/g,'<sub>$1</sub>');
    return `<span class=\"gb-math-fallback${display?' gb-math-display':''}\">${x}</span>`;
  };
  const renderOne=(tex,display=false)=>{
    const clean=String(tex??'').trim();
    if(!clean)return '';
    if(window.katex?.renderToString){
      try{return window.katex.renderToString(clean,{throwOnError:false,strict:false,displayMode:display,trust:false});}
      catch(error){console.warn('KaTeX fragment render failed',error);return fallbackMath(clean);}
    }
    return fallbackMath(clean);
  };
  const tokens=[];
  const protect=(tex,display=false)=>{const key=`\uE000${tokens.length}\uE001`;tokens.push(renderOne(tex,display));return key;};
  const braceEnd=(text,start)=>{
    if(text[start]!=='{')return -1;
    let depth=0;
    for(let i=start;i<text.length;i++){
      if(text[i]==='{')depth++;
      else if(text[i]==='}'&&--depth===0)return i;
    }
    return -1;
  };
  const consumeCommand=(text,start)=>{
    const m=text.slice(start).match(/^\\(?:d?frac|tfrac|sqrt|binom|text|mathrm|mathbf|mathit|operatorname|overline|underline|left|right)\b/);
    if(!m)return -1;
    let end=start+m[0].length;
    while(/\s/.test(text[end]||''))end++;
    if(text[end]==='['){const close=text.indexOf(']',end+1);if(close<0)return -1;end=close+1;while(/\s/.test(text[end]||''))end++;}
    const first=braceEnd(text,end); if(first<0)return -1; end=first+1;
    if(/^\\(?:d?frac|tfrac|binom)\b/.test(m[0])){while(/\s/.test(text[end]||''))end++;const second=braceEnd(text,end);if(second<0)return -1;end=second+1;}
    return end;
  };

  // Convert common shorthand used by administrators and generated content.
  source=source
    .replace(/\bfrac\s*\(\s*([^()\n]+?)\s*\)\s*\(\s*([^()\n]+?)\s*\)/gi,'\\frac{$1}{$2}')
    .replace(/\bsqrt\s*\(\s*([^()\n]+?)\s*\)/gi,'\\sqrt{$1}')
    .replace(/\bmatrix\s*\[([^\]\n]+)\]/gi,(_,body)=>`\\begin{pmatrix}${body.split(';').map(row=>row.split(',').join('&')).join('\\\\')}\\end{pmatrix}`);

  // Explicit delimiters always win.
  source=source.replace(/\\\[([\s\S]*?)\\\]/g,(_,x)=>protect(x,true));
  source=source.replace(/\\\(([\s\S]*?)\\\)/g,(_,x)=>protect(x,false));
  source=source.replace(/\$\$([\s\S]*?)\$\$/g,(_,x)=>protect(x,true));
  source=source.replace(/\$([^$\n]+)\$/g,(_,x)=>protect(x,false));

  // Render balanced LaTeX commands even when the author forgot delimiters.
  let rebuilt='',i=0;
  while(i<source.length){
    if(source[i]==='\\'){
      if(source.startsWith('\\begin{',i)){
        const endTag=source.indexOf('}',i+7);
        if(endTag>0){const env=source.slice(i+7,endTag);const close=source.indexOf(`\\end{${env}}`,endTag+1);if(close>=0){rebuilt+=protect(source.slice(i,close+env.length+6),false);i=close+env.length+6;continue;}}
      }
      const e=consumeCommand(source,i);
      if(e>i){rebuilt+=protect(source.slice(i,e),false);i=e;continue;}
      // Standalone Greek/operators such as \\theta, \\leq, \\pi are kept as a small math token.
      const cm=source.slice(i).match(/^\\(?:alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega|infty|pm|times|div|leq|geq|neq|approx|cdot|degree|sin|cos|tan|log|ln|exp)\b/);
      if(cm){rebuilt+=protect(cm[0],false);i+=cm[0].length;continue;}
    }
    rebuilt+=source[i++];
  }
  source=rebuilt;

  // Bare equations and expressions containing powers/indices.
  const bareEquation=/(?<![A-Za-z0-9_])((?:[A-Za-z0-9]+(?:\^\{[^{}]+\}|\^[A-Za-z0-9]+|_\{[^{}]+\}|_[A-Za-z0-9]+)?|\\[A-Za-z]+|[+\-*/=<>≤≥]|\s){3,120})(?=$|[,.!?;:]?\s|\)|\])/g;
  source=source.replace(bareEquation,(whole)=>{
    const t=whole.trim();
    const proseWords=t.replace(/\\[A-Za-z]+/g,'').match(/\b[A-Za-z]{3,}\b/g)||[];
    if(/=|<|>|\^|_|\\(?:alpha|beta|gamma|delta|theta|pi|sqrt|frac|sin|cos|tan|log|ln)\b/.test(t) && /[A-Za-z0-9]/.test(t) && proseWords.length===0) return protect(t,false);
    return whole;
  });
  source=source.replace(/(?<![\w])((?:[A-Za-z]|\d+)(?:\^\{[^{}]+\}|\^[A-Za-z0-9]+|_\{[^{}]+\}|_[A-Za-z0-9]+))(?![\w])/g,x=>protect(x,false));

  let html=esc(source);
  tokens.forEach((token,i)=>{html=html.replace(`\uE000${i}\uE001`,token);});
  return html;
};
function renderMath(root=document){const fn=window.renderMathInElement,katex=window.katex;if(!fn||!katex||!root)return;try{fn(root,{delimiters:[{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false,strict:false});}catch(error){console.warn('Math rendering failed',error)}}
const toast=t=>{const e=$('#toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(window._toast);window._toast=setTimeout(()=>e.classList.remove('show'),3000)};
const showPersistentError=t=>{state.authError=String(t||'Something went wrong.');toast(state.authError);};
function appConfirm(title,message,confirmLabel='Confirm'){
  return new Promise(resolve=>{
    let root=$('#modalRoot');
    if(!root){root=document.createElement('div');root.id='modalRoot';document.body.appendChild(root)}
    root.innerHTML=`<div class="modal-backdrop"><div class="modal confirm-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>⚠️ ${esc(title)}</h2><div class="sub">${esc(message)}</div></div><button class="close" data-confirm-cancel aria-label="Close">×</button></div><div class="toolbar end"><button class="btn btn-ghost" data-confirm-cancel>Cancel</button><button class="btn btn-primary" data-confirm-ok>${esc(confirmLabel)}</button></div></div></div>`;
    const done=v=>{root.innerHTML='';resolve(v)};
    root.querySelectorAll('[data-confirm-cancel]').forEach(e=>e.onclick=()=>done(false));
    root.querySelector('[data-confirm-ok]')?.addEventListener('click',()=>done(true));
  });
}
function syncQuestionSelectionUI(){const selected=state.selectedQuestionIds.size;$$('[data-question-selection-count]').forEach(el=>el.textContent=`${selected} selected`);const deleteBtn=$('[data-question-bulk-delete]');if(deleteBtn)deleteBtn.disabled=!selected;const allSelected=state.questions.length>0&&state.questions.every(q=>state.selectedQuestionIds.has(String(q.id)));const all=$('[data-question-select-all]');if(all){all.checked=allSelected;all.indeterminate=!allSelected&&selected>0;}}
function toggleQuestionSelection(id){const key=String(id);state.selectedQuestionIds.has(key)?state.selectedQuestionIds.delete(key):state.selectedQuestionIds.add(key);syncQuestionSelectionUI();}
function toggleAllQuestions(checked){state.selectedQuestionIds=checked?new Set(state.questions.map(q=>String(q.id))):new Set();$$('[data-question-select]').forEach(el=>{el.checked=checked});syncQuestionSelectionUI();}
async function bulkDeleteQuestions(){
  const ids=[...state.selectedQuestionIds]; if(!ids.length)return toast('Select at least one question.');
  if(!await appConfirm('Delete selected questions?',`${ids.length} question${ids.length===1?'':'s'} will be permanently removed from the Question Bank.`,'Delete selected'))return;
  try{const r=await api('question-bulk-delete',{method:'POST',body:{ids}});state.selectedQuestionIds.clear();await refreshAdmin(`${r.removed||0} question${Number(r.removed)===1?'':'s'} deleted`);}catch(e){toast(e.message)}
}
const api=async(action,{method='GET',query={},body}={})=>{
  const u=new URL(API,location.origin);u.searchParams.set('action',action);Object.entries(query||{}).forEach(([k,v])=>u.searchParams.set(k,v));
  const h={'content-type':'application/json','accept':'application/json'};if(auth.token)h.authorization=`Bearer ${auth.token}`;if(['eduspace-status','eduspace-connect','eduspace-disconnect','result-access','public-library','public-quiz','attempt-start','attempt','question-media','library-device-activate','quiz-device-activate','leaderboard','public-pool','pool-device-activate','pool-session-start','pool-study-answer','pool-study-ai','pool-study-position','pool-study-reset','pool-practice-submit','biltz-public','biltz-register','biltz-leaderboard','boost-public','boost-register','boost-start','boost-submit'].includes(action))h['x-device-id']=getDeviceId();
  const safeToRetry=['GET','HEAD'].includes(String(method).toUpperCase()) || action==='attempt';
  const maxAttempts=safeToRetry?(action==='attempt'?2:3):1;
  let lastError=null;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    let r;
    try{r=await fetch(u,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});}catch(error){
      lastError=error;
      if(attempt<maxAttempts){await new Promise(resolve=>setTimeout(resolve,350*Math.pow(2,attempt-1)));continue;}
      const e=new Error('Unable to connect to the Gifted Brainz server. Please check the EdgeOne API deployment.');e.status=0;throw e;
    }
    const text=await r.text();let d={};
    try{d=text?JSON.parse(text):{};}catch{d={error:text?.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()||`Request failed (${r.status})`};}
    if(r.status===401&&auth.token&&action!=='login'){storage.remove('gb_admin_token');auth.token='';state.authRecovery=false;render();}
    if(r.ok)return d;
    lastError=new Error(d.error||`Request failed (${r.status})`);lastError.status=r.status;lastError.payload=d;
    if(safeToRetry&&[408,429,500,502,503,504,520,521,522,524].includes(r.status)&&attempt<maxAttempts){
      const retryAfter=Number(r.headers.get('retry-after'));
      const wait=Number.isFinite(retryAfter)?Math.min(5000,Math.max(250,retryAfter*1000)):350*Math.pow(2,attempt-1);
      await new Promise(resolve=>setTimeout(resolve,wait));continue;
    }
    throw lastError;
  }
  throw lastError||new Error('Request failed.');
};
function formatDateTime(value){try{const d=new Date(value);return Number.isNaN(d.getTime())?'Recently':d.toLocaleString(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return 'Recently';}}
function pageName(){return {dashboard:'Dashboard',quizzes:'Quiz Management',questions:'Question Bank',ai:'AI Question Studio',results:'Student Results',libraries:'CBT Libraries',pools:'Question Pools',biltz:'Previous Biltz Challenges',boost:'Brainz Biltz',analytics:'Performance Analytics',feedback:'Student Feedback',settings:'Settings'}[state.page]||'Gifted Brainz';}
function shell(content){
  const item=(page,icon,label)=>`<button type="button" class="${state.page===page?'active':''}" aria-current="${state.page===page?'page':'false'}" onclick="nav('${page}')"><span class="ic" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
  const group=(name,items)=>`<div class="nav-group"><div class="nav-group-title">${name}</div>${items.join('')}</div>`;
  return `<div class="app-shell"><aside class="sidebar" id="sidebar" aria-label="Assessment Hub administrator navigation">
    <div class="brand"><img src="assets/icon-light.png" alt="Gifted Brainz"><div><strong>GIFTED BRAINZ</strong><small>ASSESSMENT HUB</small></div><button class="hub-side-close" aria-label="Close menu" type="button" onclick="document.getElementById('sidebar').classList.remove('open')">×</button></div>
    <nav class="nav" aria-label="Admin sections">
      ${group('OVERVIEW',[item('dashboard','🏠','Dashboard'),item('analytics','📊','Analytics')])}
      ${group('ASSESSMENTS',[item('quizzes','📝','CBT Tests'),item('questions','📚','Question Bank'),item('ai','✦','AI Question Studio'),item('boost','⚡','Brainz Biltz')])}
      ${group('STUDENT ACTIVITY',[item('results','🏆','Results & Leaderboards'),item('feedback','💬','Student Feedback')])}
      ${group('LEARNING LIBRARIES',[item('libraries','🗂️','CBT Libraries'),item('pools','🧠','Question Pools')])}
      ${group('ACCOUNT',[item('settings','⚙️','Settings')])}
    </nav>
    <div class="sidebar-footer">No cramming, just understanding.<br>Gifted Brainz • Assessment Hub</div>
  </aside>
  <button id="hubMenuScrim" class="hub-menu-scrim" type="button" aria-label="Close navigation" onclick="document.getElementById('sidebar').classList.remove('open')"></button>
  <main class="main"><header class="topbar"><div class="top-left"><button type="button" class="mobile-menu" aria-label="Open navigation" onclick="document.getElementById('sidebar').classList.toggle('open')">☰ Menu</button><span class="crumb">${esc(pageName())}</span></div>
    <div class="user-chip"><span class="admin-label">Administrator</span><button class="mini hub-signout" onclick="logoutAdmin()" title="Sign out">Sign out</button></div></header>
  <section class="content">${state.bootstrapWarnings?.length?`<div class="system-warning" role="status"><div><strong>Some dashboard data is temporarily unavailable.</strong><div>${state.bootstrapWarnings.slice(0,3).map(w=>`<span>${esc(w)}</span>`).join('')}</div></div><button class="mini" onclick="retryAdminLoad()">↻ Retry</button></div>`:''}${content}</section></main></div>`;
}
function login(){const h=state.health;const healthText=state.healthLoading?'Checking server configuration…':h?(h.databaseOk?'Database connected':'Database problem detected')+' • '+(h.aiConfigured?'Groq key configured':'Groq key missing'):'Server status not checked yet';return `<div class="login-wrap"><div class="login-card"><img src="assets/icon.png" alt="Gifted Brainz"><div class="eyebrow">Gifted Brainz Assessment Hub</div><h1>Administrator Sign In</h1><p>Manage CBTs, question banks, AI-assisted content, student forms and performance data from one secure workspace.</p>${state.authError?`<div class="error-banner" role="alert"><strong>Dashboard could not load</strong><span>${esc(state.authError)}</span>${auth.token?`<button class="mini" onclick="retryAdminLoad()">Retry dashboard</button>`:''}</div>`:''}<div class="health-banner ${h?.databaseOk&&h?.aiConfigured?'ok':''}"><strong>Server check</strong><span>${esc(healthText)}</span>${!state.healthChecked||state.healthLoading?'':`<button class="mini" onclick="checkHealth(true)">Refresh</button>`}</div><div class="field"><label>Admin password</label><input id="loginPassword" type="password" autocomplete="current-password" placeholder="Enter password" onkeydown="if(event.key==='Enter')loginAdmin()"></div><button class="btn btn-primary wide" onclick="loginAdmin()">Sign in securely</button>${auth.token?`<button class="btn btn-ghost wide" style="margin-top:8px" onclick="retryAdminLoad()">Retry dashboard</button>`:''}<div class="login-note">Student quiz links never open this dashboard.</div></div></div>`}

// ------------------------- Brainz Biltz -------------------------
// Live schedule countdowns; UI hints only. The API independently enforces all CBT opening/closing times.
function hubCountdownLabel(target){
  const time=Date.parse(target||'');if(!Number.isFinite(time))return 'Schedule unavailable';
  const sec=Math.max(0,Math.ceil((time-Date.now())/1000));
  const days=Math.floor(sec/86400),h=Math.floor((sec%86400)/3600),m=Math.floor((sec%3600)/60),ss=sec%60;
  return (days?`${days}d `:'')+`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function hubSchedulePhase(startAt,endAt){const now=Date.now();if(endAt&&Date.parse(endAt)<=now)return 'closed';if(startAt&&Date.parse(startAt)>now)return 'upcoming';return 'open';}
function cbtScheduleInline(startAt,endAt){if(!startAt&&!endAt)return '<span class="hub-cbt-window unscheduled">Open anytime</span>';const phase=hubSchedulePhase(startAt,endAt);return `<div class="hub-cbt-window ${phase}"><strong>${phase==='upcoming'?'⏳ Opens in':phase==='closed'?'Closed':'Open now'}</strong>${phase==='upcoming'?` <span class="hub-countdown" data-countdown-to="${escAttr(startAt)}">${hubCountdownLabel(startAt)}</span>`:''}<small>${startAt?'Opens '+esc(formatDateTime(startAt)):''}${startAt&&endAt?' · ':''}${endAt?'Closes '+esc(formatDateTime(endAt)):''}</small></div>`;}
function updateHubCountdowns(){document.querySelectorAll('[data-countdown-to]').forEach(el=>{const target=el.dataset.countdownTo;if(!target)return;el.textContent=hubCountdownLabel(target);});}
function startCbtScheduleClock(){
  clearInterval(state.quizScheduleTimer);state.quizScheduleTimer=null;
  const q=state.studentQuiz;if(!q||state.studentStage!=='intro')return;
  if(hubSchedulePhase(q.settings?.startAt,q.settings?.endAt)!=='upcoming')return;
  state.quizScheduleTimer=setInterval(()=>{
    if(state.studentStage!=='intro'||state.studentQuiz!==q){clearInterval(state.quizScheduleTimer);state.quizScheduleTimer=null;return;}
    updateHubCountdowns();
    if(hubSchedulePhase(q.settings?.startAt,q.settings?.endAt)!=='upcoming'){
      clearInterval(state.quizScheduleTimer);state.quizScheduleTimer=null;
      loadStudent(q.slug,state.studentBiltzSlug||'');
    }
  },1000);
}
function startBoostScheduleClock(){
  clearInterval(state.boostScheduleTimer);state.boostScheduleTimer=null;
  const b=state.studentBoost;if(!b||b.stage!=='intro'||hubSchedulePhase(b.quiz?.startAt,b.quiz?.endAt)!=='upcoming')return;
  state.boostScheduleTimer=setInterval(()=>{
    if(state.studentBoost!==b||b.stage!=='intro'){clearInterval(state.boostScheduleTimer);state.boostScheduleTimer=null;return;}
    updateHubCountdowns();
    if(hubSchedulePhase(b.quiz.startAt,b.quiz.endAt)!=='upcoming'){
      clearInterval(state.boostScheduleTimer);state.boostScheduleTimer=null;
      boostLoadPublic(b.slug);
    }
  },1000);
}
function biltzDateInput(value){
  const d=value?new Date(value):new Date();
  if(Number.isNaN(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  const get=k=>parts.find(x=>x.type===k)?.value||'00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
// CBT schedules are entered in West Africa Time to avoid browser-timezone ambiguity.
const cbtWatInput = value => {if(!value)return '';try{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const x=k=>p.find(t=>t.type===k)?.value||'00';return `${x('year')}-${x('month')}-${x('day')}T${x('hour')}:${x('minute')}`}catch{return ''}};
const cbtWatIso = value => biltzDateIso(value);
function biltzDateIso(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if(!m)return '';
  const ms=Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]))-60*60*1000;
  const d=new Date(ms);return Number.isNaN(d.getTime())?'':d.toISOString();
}
function biltzDateLabel(value){try{return new Date(value).toLocaleString('en-NG',{timeZone:'Africa/Lagos',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true})+' WAT';}catch{return 'Schedule to be announced';}}
function biltzNaira(value){const n=Number(value)||0;return n===0?'FREE':new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(n);}
function biltzCountdownText(target){const secs=Math.max(0,Math.floor((Date.parse(target||'')-Date.now())/1000));const days=Math.floor(secs/86400),hours=Math.floor((secs%86400)/3600),minutes=Math.floor((secs%3600)/60),seconds=secs%60;return days?`${String(days).padStart(2,'0')} : ${String(hours).padStart(2,'0')} : ${String(minutes).padStart(2,'0')} : ${String(seconds).padStart(2,'0')}`:`${String(hours).padStart(2,'0')} : ${String(minutes).padStart(2,'0')} : ${String(seconds).padStart(2,'0')}`;}
function biltzLiveState(challenge){if(!challenge)return 'unavailable';if(challenge.status==='paused')return 'paused';if(challenge.status==='cancelled')return 'cancelled';const now=Date.now(),start=Date.parse(challenge.start_at||''),end=Date.parse(challenge.end_at||'');if(now<start)return 'upcoming';if(now>end)return 'ended';return 'live';}
function biltzStatusLabel(status){return ({draft:'Draft',published:'Published',paused:'Paused',cancelled:'Cancelled',archived:'Archived',pending_payment:'Payment pending',pending_approval:'Awaiting approval',approved:'Approved',rejected:'Not approved',revoked:'Access revoked'})[status]||String(status||'Unknown').replaceAll('_',' ');}
function biltzStatusClass(status){return ['approved','published','live'].includes(status)?'green':['pending_payment','pending_approval','upcoming'].includes(status)?'gold':['rejected','revoked','cancelled','paused','ended'].includes(status)?'red':'';}
function biltzPublicLink(slug){return `${location.origin}${location.pathname}?biltz=${encodeURIComponent(slug)}`;}
async function copyBiltzLink(slug){const link=biltzPublicLink(slug);try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);else{const ta=document.createElement('textarea');ta.value=link;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}toast('Brainz Biltz challenge link copied.');}catch{toast(link);}}
async function loadBiltzChallenges(){if(state.biltzLoading)return;state.biltzLoading=true;try{const r=await api('biltz-list');state.biltzChallenges=r.challenges||[];state.biltzLoaded=true;}catch(e){toast(e.message||'Could not load Brainz Biltz challenges.');}finally{state.biltzLoading=false;if(state.page==='biltz')render();}}
function biltzChallengeForm(challenge=null){
  const now=Date.now(),start=challenge?.start_at||new Date(now+60*60*1000).toISOString(),end=challenge?.end_at||new Date(now+3*60*60*1000).toISOString();
  const selectedQuiz=String(challenge?.quiz_id||'');
  const available=state.quizzes.filter(q=>q.status==='published');
  const selected=available.find(q=>String(q.id)===selectedQuiz);
  const quizOptions=available.map(q=>`<option value="${escAttr(q.id)}" ${String(q.id)===selectedQuiz?'selected':''}>${esc(q.title)} • ${q.questions?.length||0} questions</option>`).join('');
  return `<section class="card biltz-admin-form"><div class="section-head"><div><div class="eyebrow">${challenge?'EDIT CHALLENGE':'NEW SHAREABLE CHALLENGE'}</div><h2>${challenge?'Edit Brainz Biltz':'Create Brainz Biltz Challenge'}</h2><p class="sub">Create once, publish a direct link, and share it anywhere.</p></div><button class="mini" onclick="closeBiltzForm()">Close</button></div>
  <div class="form-grid biltz-form-grid">
    <div class="field full"><label for="biltzTitle">Challenge title *</label><input id="biltzTitle" maxlength="180" value="${escAttr(challenge?.title||'')}" placeholder="e.g. UTME Biology Blitz"></div>
    <div class="field full"><label for="biltzDescription">Challenge description</label><textarea id="biltzDescription" rows="2" maxlength="1200" placeholder="Tell participants what this challenge is about.">${esc(challenge?.description||'')}</textarea></div>
    <div class="field full"><label for="biltzQuizId">Assessment / CBT *</label><select id="biltzQuizId" onchange="syncBiltzDurationFromQuiz()"><option value="">Select a published CBT</option>${quizOptions}</select><small class="sub">Only published CBTs are available. The challenge uses the selected CBT's questions and scoring.</small></div>
    <div class="field"><label for="biltzStartAt">Challenge opens (WAT) *</label><input id="biltzStartAt" type="datetime-local" value="${escAttr(biltzDateInput(start))}" required></div>
    <div class="field"><label for="biltzEndAt">Last time to start (WAT) *</label><input id="biltzEndAt" type="datetime-local" value="${escAttr(biltzDateInput(end))}" required></div>
    <div class="field"><label for="biltzDuration">Time per attempt (minutes) *</label><input id="biltzDuration" type="number" min="1" max="600" step="1" value="${Number(challenge?.duration_minutes)||Number(selected?.duration)||30}"><small class="sub">This is independent of the overall challenge window.</small></div>
    <div class="field"><label for="biltzEntryFee">Entry fee (₦)</label><input id="biltzEntryFee" type="number" min="0" max="100000000" step="50" value="${Number(challenge?.entry_fee)||0}"><small class="sub">Use 0 for a free challenge. Paid access requires administrator payment verification.</small></div>
    <div class="field"><label for="biltzAccessMode">Access</label><select id="biltzAccessMode"><option value="public" ${(challenge?.access_mode||'public')==='public'?'selected':''}>Public — anyone can request entry</option><option value="private" ${challenge?.access_mode==='private'?'selected':''}>Private — administrator approval required</option></select></div>
    <div class="field"><label for="biltzAttemptLimit">Attempts per participant</label><input id="biltzAttemptLimit" type="number" min="1" max="100" value="${Number(challenge?.attempt_limit)||1}"></div>
    <div class="field"><label for="biltzMaxParticipants">Participant limit (optional)</label><input id="biltzMaxParticipants" type="number" min="1" max="1000000" value="${challenge?.max_participants||''}" placeholder="Unlimited"></div>
    <div class="field"><label for="biltzFinishPolicy">Closing-time policy</label><select id="biltzFinishPolicy"><option value="full_duration" ${(challenge?.finish_policy||'full_duration')==='full_duration'?'selected':''}>Finish with full time after a valid start</option><option value="finish_by_end" ${challenge?.finish_policy==='finish_by_end'?'selected':''}>Finish before the challenge closes</option></select></div>
    <div class="field full"><label for="biltzCoverImage">Cover image URL (optional)</label><input id="biltzCoverImage" type="url" value="${escAttr(challenge?.cover_image_url||'')}" placeholder="https://…"><small class="sub">The page always includes the Brainz Biltz aura graphics; an HTTPS image adds a subject-specific cover.</small></div>
    <div class="field full"><label for="biltzPaymentInstructions">Payment instructions (for paid challenges)</label><textarea id="biltzPaymentInstructions" rows="3" maxlength="1800" placeholder="Enter approved payment instructions and how participants should submit a reference.">${esc(challenge?.payment_instructions||'')}</textarea></div>
    <div class="field"><label for="biltzStatus">Publication status</label><select id="biltzStatus">${['draft','published','paused','cancelled','archived'].map(x=>`<option value="${x}" ${(challenge?.status||'draft')===x?'selected':''}>${biltzStatusLabel(x)}</option>`).join('')}</select></div>
    <div class="field"><label for="biltzLeaderboardRelease">Leaderboard publication</label><select id="biltzLeaderboardRelease"><option value="after_end" ${(challenge?.leaderboard_release||'after_end')==='after_end'?'selected':''}>After challenge closes</option><option value="immediate" ${challenge?.leaderboard_release==='immediate'?'selected':''}>Immediately</option><option value="manual" ${challenge?.leaderboard_release==='manual'?'selected':''}>Only when I publish results</option></select></div>
  </div>
  <div class="settings-grid biltz-toggles"><label class="check"><input id="biltzChallengeOnly" type="checkbox" ${challenge?.challenge_only!==false?'checked':''}> Require entry through the Brainz Biltz link (recommended)</label><label class="check"><input id="biltzLeaderboardEnabled" type="checkbox" ${challenge?.leaderboard_enabled!==false?'checked':''}> Enable participant leaderboard</label><label class="check"><input id="biltzReviewEnabled" type="checkbox" ${challenge?.review_enabled!==false?'checked':''}> Allow question review when results permit</label></div>
  <div class="notice biltz-admin-notice">Public + paid challenges still require confirmed payment. Private challenges require administrator approval. Publishing a challenge-link-only CBT blocks its ordinary quiz link while preserving entry through this Brainz Biltz URL.</div>
  <div class="toolbar end"><button class="btn btn-ghost" onclick="closeBiltzForm()">Cancel</button><button class="btn btn-primary" onclick="saveBiltzChallenge('${escAttr(challenge?.id||'')}')">${challenge?'Save changes':'Save challenge'}</button></div></section>`;
}
function syncBiltzDurationFromQuiz(){const id=$('#biltzQuizId')?.value;const q=state.quizzes.find(x=>String(x.id)===String(id));const el=$('#biltzDuration');if(q&&el&&!state.biltzEditId)el.value=Math.max(1,Number(q.duration)||30);}
function newBiltzChallenge(){state.biltzEditId=null;state.biltzFormVisible=true;state.biltzParticipantsFor=null;state.biltzLeaderboard=null;render();}
function editBiltzChallenge(id){state.biltzEditId=id;state.biltzFormVisible=true;state.biltzParticipantsFor=null;state.biltzLeaderboard=null;render();}
function closeBiltzForm(){state.biltzFormVisible=false;state.biltzEditId=null;render();}
async function saveBiltzChallenge(id=''){
  const title=String($('#biltzTitle')?.value||'').trim(),quizId=$('#biltzQuizId')?.value,startAt=biltzDateIso($('#biltzStartAt')?.value),endAt=biltzDateIso($('#biltzEndAt')?.value),durationMinutes=Number($('#biltzDuration')?.value||0),entryFee=Number($('#biltzEntryFee')?.value||0),maxParticipants=String($('#biltzMaxParticipants')?.value||'').trim();
  if(!title)return toast('Enter a title for the Brainz Biltz challenge.');if(!quizId)return toast('Select a published CBT.');if(!startAt||!endAt||Date.parse(endAt)<=Date.parse(startAt))return toast('Choose a valid closing time after the opening time.');if(!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>600)return toast('Challenge duration must be between 1 and 600 minutes.');if(!Number.isFinite(entryFee)||entryFee<0)return toast('Enter a valid entry fee.');
  const body={id:id||undefined,title,description:$('#biltzDescription')?.value||'',quizId,startAt,endAt,durationMinutes,entryFee,accessMode:$('#biltzAccessMode')?.value||'public',attemptLimit:Number($('#biltzAttemptLimit')?.value||1),maxParticipants,finishPolicy:$('#biltzFinishPolicy')?.value||'full_duration',coverImageUrl:$('#biltzCoverImage')?.value||'',paymentInstructions:$('#biltzPaymentInstructions')?.value||'',status:$('#biltzStatus')?.value||'draft',leaderboardRelease:$('#biltzLeaderboardRelease')?.value||'after_end',challengeOnly:$('#biltzChallengeOnly')?.checked,leaderboardEnabled:$('#biltzLeaderboardEnabled')?.checked,reviewEnabled:$('#biltzReviewEnabled')?.checked};
  try{const r=await api('biltz-save',{method:'POST',body});state.biltzFormVisible=false;state.biltzEditId=null;state.biltzParticipantsFor=null;await loadBiltzChallenges();toast(r.message||'Brainz Biltz challenge saved.');}catch(e){toast(e.message||'Challenge could not be saved.');}
}
async function manageBiltzParticipants(id){state.biltzParticipantsFor=id;state.biltzParticipantsLoading=true;state.biltzLeaderboard=null;render();try{const r=await api('biltz-participants',{query:{challengeId:id}});state.biltzParticipants=r.participants||[];}catch(e){toast(e.message||'Could not load participants.');state.biltzParticipants=[];}finally{state.biltzParticipantsLoading=false;if(state.page==='biltz')render();}}
async function setBiltzParticipantStatus(participantId,status,challengeId){try{await api('biltz-participant-status',{method:'POST',body:{participantId,status}});toast(`Participant status updated: ${biltzStatusLabel(status)}.`);await manageBiltzParticipants(challengeId);}catch(e){toast(e.message||'Could not update participant status.');}}
async function publishBiltzResults(id,published=true){try{await api('biltz-publish-results',{method:'POST',body:{challengeId:id,published}});toast(published?'Challenge results published.':'Challenge results hidden.');await loadBiltzChallenges();}catch(e){toast(e.message||'Could not update result publication.');}}
async function showBiltzResults(slug){state.biltzLeaderboard={slug,loading:true,leaderboard:[]};state.biltzParticipantsFor=null;render();try{const r=await api('biltz-leaderboard',{query:{id:slug,limit:1000}});state.biltzLeaderboard={slug,loading:false,challenge:r.challenge,leaderboard:r.leaderboard||[]};}catch(e){state.biltzLeaderboard={slug,loading:false,error:e.message,leaderboard:[]};}finally{if(state.page==='biltz')render();}}
function biltzParticipantsPanel(challenge){
  if(state.biltzParticipantsFor!==challenge.id)return '';
  if(state.biltzParticipantsLoading)return `<section class="biltz-participants-panel"><strong>Loading registrations…</strong></section>`;
  return `<section class="biltz-participants-panel"><div class="section-head"><div><h3>Participants &amp; entry approvals</h3><p class="sub">Verify payment references and approve or revoke individual registrations.</p></div><button class="mini" onclick="manageBiltzParticipants('${challenge.id}')">Refresh</button></div>${state.biltzParticipants.length?state.biltzParticipants.map(p=>`<article class="biltz-participant-row"><div class="biltz-participant-main"><strong>${esc(p.participant_name)}</strong><span>${esc(p.contact||'No contact supplied')} · Registered ${esc(biltzDateLabel(p.created_at))}</span>${p.payment_reference?`<small>Payment reference: <b>${esc(p.payment_reference)}</b></small>`:''}${p.admin_note?`<small>Admin note: ${esc(p.admin_note)}</small>`:''}<span class="tag ${biltzStatusClass(p.status)}">${biltzStatusLabel(p.status)}</span>${p.attempts?.length?`<small>${p.attempts.filter(a=>a.status==='submitted').length} submitted attempt(s) · Best ${Math.max(...p.attempts.filter(a=>a.status==='submitted').map(a=>Number(a.percent)||0),0)}%</small>`:'<small>No submitted attempts yet.</small>'}</div><div class="biltz-participant-actions">${p.status!=='approved'?`<button class="mini" onclick="setBiltzParticipantStatus('${p.id}','approved','${challenge.id}')">Approve entry</button>`:`<button class="mini danger-mini" onclick="setBiltzParticipantStatus('${p.id}','revoked','${challenge.id}')">Revoke</button>`}${p.status!=='rejected'?`<button class="mini danger-mini" onclick="setBiltzParticipantStatus('${p.id}','rejected','${challenge.id}')">Reject</button>`:''}</div></article>`).join(''):`<div class="empty">No registrations yet. Share the challenge link to invite participants.</div>`}</section>`;
}
function biltzLeaderboardPanel(challenge){const panel=state.biltzLeaderboard;if(!panel||panel.slug!==challenge.slug)return '';if(panel.loading)return `<section class="biltz-participants-panel"><h3>Challenge leaderboard</h3><p class="sub">Loading verified results…</p></section>`;if(panel.error)return `<section class="biltz-participants-panel"><h3>Challenge leaderboard</h3><p class="sub">${esc(panel.error)}</p></section>`;return `<section class="biltz-participants-panel"><div class="section-head"><div><h3>Challenge leaderboard</h3><p class="sub">Ranked by score, then completion time.</p></div><button class="mini" onclick="state.biltzLeaderboard=null;render()">Close</button></div>${panel.leaderboard.length?`<div class="table-wrap"><table class="biltz-table"><thead><tr><th>Rank</th><th>Participant</th><th>Score</th><th>Accuracy</th><th>Time</th></tr></thead><tbody>${panel.leaderboard.map(x=>`<tr><td>#${x.rank}</td><td>${esc(x.name)}</td><td>${x.score}/${x.total}</td><td>${x.percent}%</td><td>${fmt(x.timeUsed)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No eligible submitted results yet.</div>`}</section>`;}
function brainzBiltz(){
  if(!state.biltzLoaded&&!state.biltzLoading)queueMicrotask(()=>loadBiltzChallenges());
  const editing=state.biltzFormVisible?(state.biltzChallenges.find(c=>String(c.id)===String(state.biltzEditId))||null):null;
  return shell(`<div class="section-head biltz-admin-heading"><div><div class="eyebrow">SHAREABLE CHALLENGE STUDIO</div><h1 class="page-title">⚡ Brainz Biltz</h1><div class="page-sub">Create scheduled challenges, generate a direct link, and manage entry and results in one place.</div></div><div class="toolbar"><button class="btn btn-primary" onclick="newBiltzChallenge()">＋ Create Challenge</button></div></div>
  <div class="biltz-admin-hero"><div class="biltz-admin-hero-orb"></div><div><span class="biltz-chip">SHARE ANYWHERE</span><h2>Create it once. Share the link anywhere.</h2><p>Your students open the Brainz Biltz link directly—no need to search through the Gifted Brainz dashboard.</p></div><div class="biltz-admin-metrics"><div><strong>${state.biltzChallenges.length}</strong><span>Challenges</span></div><div><strong>${state.biltzChallenges.reduce((a,c)=>a+Number(c.participant_counts?.approved||0),0)}</strong><span>Approved entries</span></div><div><strong>${state.biltzChallenges.reduce((a,c)=>a+Number(c.participant_counts?.pending||0),0)}</strong><span>Pending approvals</span></div></div></div>
  ${state.biltzFormVisible?biltzChallengeForm(editing):''}
  <div class="section-head" style="margin-top:24px"><div><h2>My Challenges</h2><p class="sub">Every published challenge has its own shareable URL, schedule, access rules, and result controls.</p></div><button class="mini" onclick="loadBiltzChallenges()">↻ Refresh</button></div>
  ${state.biltzLoading&&!state.biltzLoaded?`<div class="card empty">Loading Brainz Biltz challenges…</div>`:state.biltzChallenges.length?`<div class="biltz-challenge-list">${state.biltzChallenges.map(c=>{const l=biltzLiveState(c),counts=c.participant_counts||{total:0,pending:0,approved:0};return `<article class="card biltz-challenge-admin-card"><div class="biltz-admin-card-banner"><div class="biltz-mini-aura">⚡</div><div><span class="tag ${biltzStatusClass(c.status)}">${biltzStatusLabel(c.status)}</span><h3>${esc(c.title)}</h3><p>${esc(c.quiz_title)} · ${Number(c.duration_minutes)||0} minutes · ${Number(c.entry_fee)>0?esc(biltzNaira(c.entry_fee)):'Free entry'}</p></div><div class="biltz-admin-card-status"><span class="tag ${biltzStatusClass(l)}">${l==='upcoming'?'Upcoming':l==='live'?'Live now':l==='ended'?'Ended':l==='paused'?'Paused':l==='cancelled'?'Cancelled':'Scheduled'}</span><strong>${counts.total||0}</strong><small>registrations</small></div></div><div class="biltz-admin-card-body"><div class="biltz-info-grid"><div><span>Opens</span><strong>${esc(biltzDateLabel(c.start_at))}</strong></div><div><span>Last start</span><strong>${esc(biltzDateLabel(c.end_at))}</strong></div><div><span>Access</span><strong>${c.access_mode==='private'?'Private':'Public'}</strong></div><div><span>Entry status</span><strong>${counts.approved||0} approved · ${counts.pending||0} pending</strong></div></div><div class="biltz-link-box"><span>SHAREABLE CHALLENGE LINK</span><code>${esc(biltzPublicLink(c.slug))}</code><button class="btn btn-primary" onclick="copyBiltzLink('${escAttr(c.slug)}')">🔗 Copy Link</button></div><div class="toolbar biltz-admin-actions"><button class="mini" onclick="editBiltzChallenge('${c.id}')">✏️ Edit settings</button><button class="mini" onclick="manageBiltzParticipants('${c.id}')">👥 Participants (${counts.total||0})</button><button class="mini" onclick="showBiltzResults('${escAttr(c.slug)}')" ${c.leaderboard_enabled?'':'disabled'}>🏆 View leaderboard</button>${c.leaderboard_release==='manual'?`<button class="mini" onclick="publishBiltzResults('${c.id}',${!c.results_published})">${c.results_published?'Hide results':'Publish results'}</button>`:''}</div></div>${biltzParticipantsPanel(c)}${biltzLeaderboardPanel(c)}</article>`}).join('')}</div>`:`<div class="card empty"><div class="empty-icon">⚡</div><h3>No Brainz Biltz challenges yet</h3><p>Create your first challenge, choose a published CBT, set the schedule and entry price, then share its link directly with students.</p><button class="btn btn-primary" onclick="newBiltzChallenge()">Create your first challenge</button></div>`}`);
}
async function loadBiltzChallenge(slug){
  clearInterval(state.biltzCountdownTimer);state.studentBiltzSlug=slug;state.studentBiltzPage=true;state.studentQuiz=null;state.studentStage='intro';state.studentBiltzMessage='';applyStudentTheme();app.innerHTML=studentLoadingMarkup('Opening Brainz Biltz','Preparing your challenge link and entry details.');
  try{const r=await api('biltz-public',{query:{id:slug}});state.studentBiltz=r.challenge;state.studentBiltzParticipant=r.challenge?.participant||null;state.studentBiltzPage=true;renderBiltzLanding();startBiltzCountdown();}
  catch(e){app.innerHTML=`<div class="biltz-page"><div class="biltz-entry-card"><div class="biltz-brand"><span class="biltz-brand-mark">⚡</span><span>BRAINZ <b>BILTZ</b></span></div><div class="biltz-entry-orb"></div><div class="eyebrow">CHALLENGE LINK</div><h1>Challenge unavailable</h1><p>${esc(e.message||'This Brainz Biltz link could not be opened.')}</p><a class="btn btn-primary" href="${escAttr(location.pathname)}">Return to Gifted Brainz</a></div></div>`;applyStudentTheme();}
}
async function loadBiltzRoute(slug,quizSlug=''){
  await loadBiltzChallenge(slug);
  if(!quizSlug||!state.studentBiltz)return;
  const p=state.studentBiltzParticipant,live=biltzLiveState(state.studentBiltz)==='live';
  let pending=false,active=false;
  try{const raw=localStorage.getItem(pendingSubmitKey(state.studentBiltz.quiz_id));const saved=raw?JSON.parse(raw):null;pending=!!(saved?.attemptId&&saved?.challengeSlug===slug);}catch{}
  try{const raw=localStorage.getItem(activeProgressKey(state.studentBiltz.quiz_id,slug));const saved=raw?JSON.parse(raw):null;active=!!(saved?.attemptId&&saved?.attemptToken&&saved?.challengeSlug===slug);}catch{}
  if(p?.status==='approved'&&(live||pending||active)){await loadStudent(quizSlug,slug);}
}
function renderBiltzLanding(){
  const c=state.studentBiltz;if(!c){app.innerHTML=studentLoadingMarkup('Opening Brainz Biltz','Preparing your challenge.');return;}
  const liveState=biltzLiveState(c),p=state.studentBiltzParticipant||c.participant||null;
  const start=Date.parse(c.start_at),end=Date.parse(c.end_at),entryFee=Number(c.entry_fee)||0;
  const cover=safeImageSrc(c.cover_image_url);
  let action='';
  if(liveState==='paused')action=`<div class="biltz-state-panel warning"><strong>Challenge temporarily paused</strong><span>The administrator has paused this challenge. Please check back later.</span><button class="btn btn-light" onclick="refreshBiltzStatus()">Refresh status</button></div>`;
  else if(liveState==='cancelled'||liveState==='ended')action=`<div class="biltz-state-panel"><strong>${liveState==='ended'?'This challenge has ended':'This challenge was cancelled'}</strong><span>${liveState==='ended'?'Registration and new attempts are closed.':'The organiser has cancelled this challenge.'}</span><div class="biltz-landing-actions">${c.leaderboard_enabled?`<button class="btn btn-primary" onclick="showBiltzLandingLeaderboard()">🏆 View results</button>`:''}<button class="btn btn-light" onclick="refreshBiltzStatus()">Refresh</button></div></div>`;
  else if(p?.status==='approved')action=`<div class="biltz-approved-panel"><span class="biltz-approved-check">✓</span><div><strong>You're registered</strong><span>Your entry is approved for this Brainz Biltz challenge.</span></div></div>${liveState==='live'?`<button class="btn biltz-enter-btn" onclick="enterBiltzChallenge()"><span>⚡ ENTER CHALLENGE</span><span aria-hidden="true">→</span></button><small class="biltz-entry-footnote">Your time starts when you begin the assessment.</small>`:`<div class="biltz-countdown-wrap"><span>${liveState==='upcoming'?'CHALLENGE OPENS IN':'CHALLENGE STATUS'}</span><strong id="biltzCountdown">${liveState==='upcoming'?biltzCountdownText(c.start_at):'—'}</strong><small>${liveState==='upcoming'?'Return here when the countdown ends.':'The challenge is not open.'}</small></div><button class="btn biltz-enter-btn" disabled>${liveState==='upcoming'?'⏳ WAIT FOR OPENING TIME':'CHALLENGE CLOSED'}</button><button class="btn btn-light" onclick="refreshBiltzStatus()">Refresh status</button>`}`;
  else if(p&&['pending_payment','pending_approval'].includes(p.status))action=`<div class="biltz-state-panel pending"><strong>${p.status==='pending_payment'?'Payment verification pending':'Entry approval pending'}</strong><span>${p.status==='pending_payment'?'Your registration is saved. The administrator must confirm your payment before entry is enabled.':'Your registration has been submitted. The administrator must approve your entry before you can start.'}</span>${entryFee>0&&c.payment_instructions?`<div class="biltz-payment-instructions"><b>Payment instructions</b><p>${esc(c.payment_instructions)}</p></div>`:''}<div class="biltz-landing-actions"><button class="btn btn-primary" onclick="refreshBiltzStatus()">↻ Check approval status</button><button class="btn btn-light" onclick="copyBiltzStudentDeviceId()">Copy Device ID</button></div></div>`;
  else action=`<form class="biltz-register-form" onsubmit="registerForBiltz(event)"><div class="biltz-register-heading"><span class="eyebrow">${entryFee>0?'RESERVE YOUR ENTRY':'JOIN THE CHALLENGE'}</span><h2>${entryFee>0?'Register for this challenge':'Ready to take the challenge?'}</h2><p>${c.access_mode==='private'?'This is a private challenge. The administrator must approve your registration.':entryFee>0?'Complete registration and submit your payment reference. Your entry will unlock after payment verification.':'Register for free. You can start when the challenge opens.'}</p></div><div class="field"><label for="biltzStudentName">Your full name *</label><input id="biltzStudentName" autocomplete="name" required maxlength="200" placeholder="Enter your name"></div><div class="field"><label for="biltzStudentContact">Contact (optional)</label><input id="biltzStudentContact" autocomplete="email" maxlength="200" placeholder="Phone number or email"></div>${entryFee>0?`<div class="field"><label for="biltzStudentPaymentRef">Payment reference (if available)</label><input id="biltzStudentPaymentRef" maxlength="200" placeholder="Enter your transaction reference"></div>${c.payment_instructions?`<div class="biltz-payment-instructions"><b>Payment instructions</b><p>${esc(c.payment_instructions)}</p></div>`:''}`:''}<button class="btn biltz-enter-btn" type="submit" ${state.studentBiltzRegistering?'disabled':''}><span>${state.studentBiltzRegistering?'SAVING REGISTRATION…':entryFee>0?'REGISTER & SUBMIT PAYMENT REFERENCE':c.access_mode==='private'?'REQUEST ENTRY':'REGISTER FOR FREE'}</span><span aria-hidden="true">→</span></button><small class="biltz-entry-footnote">${entryFee>0?'Payment is verified by the administrator; no payment is collected on this page.':c.access_mode==='private'?'Your entry unlocks after administrator approval.':'Your device is registered for this challenge.'}</small></form>`;
  const schedule=liveState==='live'?`<span class="biltz-live-dot"></span> CHALLENGE LIVE`:liveState==='upcoming'?'UPCOMING CHALLENGE':liveState==='paused'?'PAUSED CHALLENGE':liveState.toUpperCase();
  app.innerHTML=`<main class="biltz-page"><div class="biltz-ambient biltz-ambient-one"></div><div class="biltz-ambient biltz-ambient-two"></div><div class="biltz-particles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><header class="biltz-topbar"><a class="biltz-brand" href="${escAttr(location.pathname)}" aria-label="Gifted Brainz home"><span class="biltz-brand-mark">⚡</span><span>BRAINZ <b>BILTZ</b></span></a><span class="biltz-powered">POWERED BY GIFTED BRAINZ</span>${studentThemeToggle()}</header><section class="biltz-entry-wrap"><div class="biltz-entry-card ${cover?'has-cover':''}">${cover?`<div class="biltz-cover" style="background-image:linear-gradient(90deg,rgba(4,12,31,.94),rgba(4,12,31,.38)),url('${escAttr(cover)}')"></div>`:''}<div class="biltz-entry-orb"></div><div class="biltz-brand-emblem"><span class="biltz-emblem-core">⚡</span><span class="biltz-emblem-ring ring-one"></span><span class="biltz-emblem-ring ring-two"></span><span class="biltz-emblem-ring ring-three"></span></div><div class="biltz-entry-kicker"><span class="biltz-live-indicator ${liveState==='live'?'live':''}"></span>${esc(schedule)}</div><h1>${esc(c.title)}</h1><p class="biltz-challenge-description">${esc(c.description||'Think fast. Learn deep. Rise higher.')}</p><div class="biltz-stats-grid"><div><span>QUESTIONS</span><strong>${Number(c.question_count)||0}</strong></div><div><span>DURATION</span><strong>${Number(c.duration_minutes)||0} <small>MIN</small></strong></div><div><span>ENTRY</span><strong class="biltz-price">${esc(biltzNaira(entryFee))}</strong></div></div><div class="biltz-schedule"><div><span>CHALLENGE OPENS</span><strong>${esc(biltzDateLabel(c.start_at))}</strong></div><div><span>LAST TIME TO START</span><strong>${esc(biltzDateLabel(c.end_at))}</strong></div></div>${liveState==='upcoming'?`<div class="biltz-countdown-wrap"><span>THE CHALLENGE BEGINS IN</span><strong id="biltzCountdown">${biltzCountdownText(c.start_at)}</strong><small>All times are shown in West Africa Time (WAT).</small></div>`:''}<div class="biltz-entry-action-area">${state.studentBiltzMessage?`<div class="biltz-inline-message" role="status">${esc(state.studentBiltzMessage)}</div>`:''}${action}</div>${state.biltzLeaderboard?.slug===c.slug?`${state.biltzLeaderboard.loading?'<p class="biltz-muted">Loading results…</p>':state.biltzLeaderboard.error?`<p class="biltz-muted">${esc(state.biltzLeaderboard.error)}</p>`:`<section class="biltz-public-leaderboard"><div class="eyebrow">OFFICIAL RESULTS</div><h2>Challenge Leaderboard</h2>${state.biltzLeaderboard.leaderboard?.length?`<div class="biltz-public-ranks">${state.biltzLeaderboard.leaderboard.slice(0,20).map(x=>`<div><b>#${x.rank}</b><span>${esc(x.name)}</span><strong>${x.percent}%</strong></div>`).join('')}</div>`:'<p>No verified results are available yet.</p>'}</section>`}`:''}<footer class="biltz-entry-footer"><span>THINK FAST. LEARN DEEP. RISE HIGHER.</span><span>NO CRAMMING, JUST UNDERSTANDING.</span></footer></div></section><p class="biltz-privacy-note">Challenge access, entry approval and examination deadlines are checked by the Gifted Brainz server.</p></main>`;
  applyStudentTheme();
}
function startBiltzCountdown(){
  clearInterval(state.biltzCountdownTimer);
  const c=state.studentBiltz;if(!c||!state.studentBiltzPage)return;
  let previousStatus=biltzLiveState(c);
  if(['ended','paused','cancelled','unavailable'].includes(previousStatus))return;
  state.biltzCountdownTimer=setInterval(()=>{
    if(!state.studentBiltzPage||state.studentBiltz?.slug!==c.slug){clearInterval(state.biltzCountdownTimer);return;}
    const status=biltzLiveState(c),label=$('#biltzCountdown');
    if(label&&status==='upcoming')label.textContent=biltzCountdownText(c.start_at);
    if(status!==previousStatus){previousStatus=status;renderBiltzLanding();if(['ended','paused','cancelled','unavailable'].includes(status))clearInterval(state.biltzCountdownTimer);}
  },1000);
}
async function registerForBiltz(event){event?.preventDefault();if(state.studentBiltzRegistering)return;const c=state.studentBiltz;if(!c)return;const participantName=String($('#biltzStudentName')?.value||'').trim();if(!participantName)return toast('Enter your full name to register.');state.studentBiltzRegistering=true;const payload={challengeSlug:c.slug,participantName,contact:String($('#biltzStudentContact')?.value||'').trim(),paymentReference:String($('#biltzStudentPaymentRef')?.value||'').trim(),deviceId:getDeviceId()};renderBiltzLanding();try{const r=await api('biltz-register',{method:'POST',body:payload});state.studentBiltzParticipant=r.participant;state.studentBiltz.participant=r.participant;state.studentBiltzMessage=r.message||'Registration saved.';toast(r.message||'Registration saved.');}catch(e){state.studentBiltzMessage=e.message||'Registration could not be saved.';toast(state.studentBiltzMessage);}finally{state.studentBiltzRegistering=false;renderBiltzLanding();startBiltzCountdown();}}
async function refreshBiltzStatus(){if(!state.studentBiltz?.slug)return;await loadBiltzChallenge(state.studentBiltz.slug);}
function enterBiltzChallenge(){const c=state.studentBiltz;if(!c)return;const status=biltzLiveState(c);if(status!=='live')return toast(status==='upcoming'?'This challenge has not opened yet.':'The challenge is not available for entry.');if((state.studentBiltzParticipant||c.participant)?.status!=='approved')return toast('Your entry must be approved before you can start.');history.pushState({},'',`${location.pathname}?quiz=${encodeURIComponent(c.quiz_slug)}&biltz=${encodeURIComponent(c.slug)}`);loadStudent(c.quiz_slug,c.slug);}
function returnToBiltzLanding(){const slug=state.studentBiltz?.slug||state.studentBiltzSlug;if(!slug)return exitStudent();clearInterval(state.timer);detachStudentGuard();clearInterval(state.biltzCountdownTimer);try{if(state.studentQuiz)clearActiveStudentProgress(state.studentQuiz.id,slug);}catch{}state.studentQuiz=null;state.studentResult=null;state.studentAttemptId=null;state.studentAttemptToken=null;state.studentAttemptNumber=0;state.studentAnswers={};state.studentFlags=new Set();state.studentBiltzPage=true;state.studentStage='intro';history.replaceState({},'',`${location.pathname}?biltz=${encodeURIComponent(slug)}`);loadBiltzChallenge(slug);}
async function copyBiltzStudentDeviceId(){const id=getDeviceId();try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(id);toast('Device ID copied.');}else toast(`Device ID: ${id}`);}catch{toast(`Device ID: ${id}`);}}
async function showBiltzLandingLeaderboard(){const c=state.studentBiltz;if(!c)return;state.biltzLeaderboard={slug:c.slug,loading:true,leaderboard:[]};renderBiltzLanding();try{const r=await api('biltz-leaderboard',{query:{id:c.slug,limit:1000}});state.biltzLeaderboard={slug:c.slug,loading:false,leaderboard:r.leaderboard||[]};}catch(e){state.biltzLeaderboard={slug:c.slug,loading:false,error:e.message,leaderboard:[]};}renderBiltzLanding();}

// ================ Independent Brainz Biltz quiz mode ================
// This mode does not invoke the CBT player or its attempt-start APIs.
function boostShareLink(slug){return `${location.origin}${location.pathname}?biltzQuiz=${encodeURIComponent(slug)}`;}
async function boostCopyLink(slug){const link=boostShareLink(slug);try{await navigator.clipboard.writeText(link);toast('Brainz Biltz quiz link copied.');}catch{toast(link);}}
async function boostLoadAdmin(){if(state.boostLoading)return;state.boostLoading=true;try{const r=await api('boost-list');state.boostQuizzes=r.quizzes||[];}catch(e){toast(e.message);}finally{state.boostLoading=false;if(state.page==='boost')render();}}
function boostAdmin(){
  const items=state.boostQuizzes||[];
  const selected=items.find(x=>x.id===state.boostSelectedId);
  return shell(`<div class="section-head"><div><div class="eyebrow">INDEPENDENT QUIZZES</div><h1 class="page-title">⚡ Brainz Biltz</h1><p class="page-sub">Create quick challenges with their own questions, timers and results. Brainz Biltz is separate from CBT tests.</p></div><button class="btn btn-primary" onclick="boostOpenQuizForm()">＋ New Brainz Biltz Quiz</button></div>
    ${state.boostLoading?'<div class="card">Loading Brainz Biltz quizzes…</div>':''}
    ${state.boostFormOpen?boostQuizForm():''}
    <div class="boost-admin-list">${items.length?items.map(q=>`<article class="card boost-admin-card"><div class="boost-admin-info"><span class="tag ${q.status==='published'?'green':'gold'}">${esc(q.status)}</span><h3>${esc(q.title)}</h3><div class="sub">${q.question_count||0} question(s) • ${q.seconds_per_question} seconds per question budget</div><div class="sub boost-schedule-label">${q.start_at?`Starts ${esc(formatDateTime(q.start_at))}`:'Starts immediately'} · ${q.end_at?`Ends ${esc(formatDateTime(q.end_at))}`:'No closing time'}</div><p>${esc(q.description||'Quick revision challenge')}</p></div><div class="boost-admin-actions"><button class="mini" onclick="boostManageQuestions('${q.id}')">📝 Questions</button><button class="mini" onclick="boostViewAttempts('${q.id}')">📊 Results</button><button class="mini" onclick="boostViewRegistrations('${q.id}')">🪪 Registrations</button><button class="mini" onclick="boostOpenQuizForm('${q.id}')">Edit</button><button class="mini" onclick="boostCopyLink('${escAttr(q.slug)}')" ${q.status==='published'?'':'disabled'}>🔗 Copy Link</button><button class="mini danger-mini" onclick="boostDeleteQuiz('${q.id}')">Delete</button></div></article>`).join(''):'<div class="card empty">No Brainz Biltz quizzes yet. Create your first quiz and add original questions here, without creating a CBT.</div>'}</div>
    ${state.boostRegistrationOpenId?`<section class="card boost-editor"><div class="section-head"><h2>Registered Participants (${(state.boostRegistrations||[]).length})</h2><button class="mini" onclick="boostCloseRegistrations()">Close</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Extra details</th><th>Registered</th></tr></thead><tbody>${(state.boostRegistrations||[]).map(r=>`<tr><td>${esc(r.student_name)}</td><td>${studentMetadataHtml({student_data:r.student_data})}</td><td>${esc(formatDateTime(r.registered_at))}</td></tr>`).join('')||'<tr><td colspan="3">No registrations yet.</td></tr>'}</tbody></table></div></section>`:''}
    ${state.boostResultsOpenId?`<section class="card boost-editor"><div class="section-head"><h2>Brainz Biltz Results</h2><button class="mini" onclick="boostCloseAttempts()">Close</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Student</th><th>Score</th><th>Percent</th><th>Status</th><th>Date</th></tr></thead><tbody>${(state.boostResults||[]).length?state.boostResults.map(a=>`<tr><td>${esc(a.student_name)}</td><td>${a.score===null?'—':`${Number(a.score)||0} / ${Number(a.total)||0}`}</td><td>${a.percent===null?'—':`${Number(a.percent)||0}%`}</td><td>${esc(a.status)}</td><td>${esc(formatDateTime(a.completed_at||a.started_at))}</td></tr>`).join(''):'<tr><td colspan="5">No attempts recorded yet.</td></tr>'}</tbody></table></div></section>`:''}
    ${selected?`<section class="card boost-editor"><div class="section-head"><div><h2>Questions: ${esc(selected.title)}</h2><p class="sub">${state.boostQuestions.length} saved. Add questions with four options and explanations.</p></div><div class="toolbar"><button class="mini" onclick="boostNewQuestion()">＋ Add Question</button><button class="mini" onclick="boostOpenImport('ai')">✦ Generate with AI</button><button class="mini" onclick="boostOpenImport('file')">📄 Import Document</button><button class="mini" onclick="boostCloseQuestions()">Close</button></div></div>
    ${state.boostQuestionOpen?boostQuestionForm():''}${state.boostImportMode?boostImportForm():''}
    <div class="boost-question-list">${state.boostQuestions.length?state.boostQuestions.map((q,i)=>`<article class="boost-question-row"><div><strong>${i+1}. ${mathHtml(q.prompt)}</strong><small>Answer: ${String.fromCharCode(65+Number(q.correct_index))} · ${q.explanation?'Explanation included':'No explanation'}</small></div><div class="toolbar"><button class="mini" onclick="boostEditQuestion('${q.id}')">Edit</button><button class="mini danger-mini" onclick="boostDeleteQuestion('${q.id}')">Delete</button></div></article>`).join(''):'<p class="sub">No questions added yet.</p>'}</div></section>`:''}
    <p class="sub" style="margin-top:12px">Legacy CBT-linked Biltz challenges remain available for compatibility. <button class="mini" onclick="nav('biltz')">Manage legacy CBT-linked challenges</button></p>`);
}
function boostLocalDateTime(value){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16);}
function boostQuizForm(){const q=(state.boostQuizzes||[]).find(x=>x.id===state.boostQuizEditId);return `<section class="card boost-editor"><div class="section-head"><h2>${q?'Edit Brainz Biltz Quiz':'Create Brainz Biltz Quiz'}</h2><button class="mini" onclick="boostCloseQuizForm()">Close</button></div><div class="form-grid"><div class="field full"><label for="boostTitle">Quiz title *</label><input id="boostTitle" maxlength="180" value="${escAttr(q?.title||'')}" placeholder="e.g. Organic Chemistry Quick Challenge"></div><div class="field full"><label for="boostDescription">Description</label><textarea id="boostDescription" maxlength="1200" rows="2">${esc(q?.description||'')}</textarea></div><div class="field"><label for="boostSeconds">Time allowance per question (seconds)</label><input id="boostSeconds" type="number" min="10" max="180" value="${q?.seconds_per_question||30}"></div><div class="field"><label for="boostStartAt">Starts at (optional)</label><input id="boostStartAt" type="datetime-local" value="${boostLocalDateTime(q?.start_at)}"></div><div class="field"><label for="boostEndAt">Ends at (optional)</label><input id="boostEndAt" type="datetime-local" value="${boostLocalDateTime(q?.end_at)}"></div><div class="field full"><label for="boostRegistrationFields">Registration fields (one per line)</label><textarea id="boostRegistrationFields" rows="4" placeholder="Full Name*&#10;Institution*&#10;Department">${esc((q?.registration_fields||[{label:'Full Name',required:true}]).map(f=>f.label+(f.required?'*':'')).join('\n'))}</textarea><small class="sub">An asterisk makes a field required. Full Name is always required. Registrations are saved before the start time.</small></div><div class="field"><label for="boostStatus">Visibility</label><select id="boostStatus"><option value="draft" ${q?.status!=='published'?'selected':''}>Draft — not accessible to students</option><option value="published" ${q?.status==='published'?'selected':''} ${q?'':'disabled'}>Published — shareable link</option></select></div></div><div class="toolbar end"><button class="btn btn-ghost" onclick="boostCloseQuizForm()">Cancel</button><button class="btn btn-primary" onclick="boostSaveQuiz()">Save Quiz</button></div><p class="sub">Create the quiz as a draft, add questions, then publish. No CBT is required.</p></section>`;}
function boostQuestionForm(){const q=state.boostQuestions.find(x=>x.id===state.boostQuestionEditId);return `<div class="boost-question-form"><h3>${q?'Edit Question':'New Question'}</h3><div class="field"><label for="boostPrompt">Question *</label><textarea id="boostPrompt" rows="3" maxlength="5000" placeholder="Type a question; mathematical expressions are supported">${esc(q?.prompt||'')}</textarea></div><div class="boost-options-grid">${[0,1,2,3].map(i=>`<div class="field"><label for="boostOption${i}">Option ${String.fromCharCode(65+i)} *</label><textarea id="boostOption${i}" rows="2" maxlength="2000">${esc(q?.options?.[i]||'')}</textarea></div>`).join('')}</div><div class="field"><label for="boostCorrect">Correct answer *</label><select id="boostCorrect">${[0,1,2,3].map(i=>`<option value="${i}" ${q?.correct_index===i?'selected':''}>Option ${String.fromCharCode(65+i)}</option>`).join('')}</select></div><div class="field"><label for="boostExplanation">Explanation (shown after submission)</label><textarea id="boostExplanation" rows="3" maxlength="7000">${esc(q?.explanation||'')}</textarea></div><div class="toolbar end"><button class="btn btn-ghost" onclick="boostCancelQuestion()">Cancel</button><button class="btn btn-primary" onclick="boostSaveQuestion()">Save Question</button></div></div>`;}
function boostOpenQuizForm(id=''){state.boostQuizEditId=id;state.boostFormOpen=true;render();}
function boostCloseQuizForm(){state.boostFormOpen=false;state.boostQuizEditId=null;render();}
async function boostSaveQuiz(){
 const title=$('#boostTitle')?.value.trim(),description=$('#boostDescription')?.value.trim(),secondsPerQuestion=Number($('#boostSeconds')?.value),status=$('#boostStatus')?.value,startRaw=$('#boostStartAt')?.value,endRaw=$('#boostEndAt')?.value,startAt=startRaw?new Date(startRaw).toISOString():null,endAt=endRaw?new Date(endRaw).toISOString():null;const registrationFields=($('#boostRegistrationFields')?.value||'').split('\n').map(x=>x.trim()).filter(Boolean).map((line,i)=>{const required=line.endsWith('*');const label=line.replace(/\*$/,'').trim();return {key:label.toLowerCase().replace(/[^a-z0-9_]+/g,'_'),label,type:'text',required:required||i===0,leaderboard:false};});
 if(!title)return toast('Enter the Brainz Biltz quiz title.');
 if(!Number.isInteger(secondsPerQuestion)||secondsPerQuestion<10||secondsPerQuestion>180)return toast('Set 10 to 180 seconds per question.');if(startAt&&endAt&&Date.parse(endAt)<=Date.parse(startAt))return toast('End time must be after start time.');
 try{const r=await api('boost-save',{method:'POST',body:{id:state.boostQuizEditId||undefined,title,description,secondsPerQuestion,status,startAt,endAt,registrationFields}});state.boostFormOpen=false;state.boostQuizEditId=null;await boostLoadAdmin();if(r.quiz?.id){await boostManageQuestions(r.quiz.id);}toast('Brainz Biltz quiz saved.');}catch(e){toast(e.message);}
}
async function boostDeleteQuiz(id){if(!await appConfirm('Delete Brainz Biltz quiz?','This permanently deletes its questions and attempts.','Delete quiz'))return;try{await api('boost-delete',{method:'POST',body:{id}});if(state.boostSelectedId===id)state.boostSelectedId=null;await boostLoadAdmin();toast('Quiz deleted.');}catch(e){toast(e.message);}}
async function boostManageQuestions(quizId){state.boostSelectedId=quizId;state.boostQuestionOpen=false;state.boostQuestionEditId=null;try{const r=await api('boost-questions',{query:{quizId}});state.boostQuestions=r.questions||[];render();}catch(e){toast(e.message);}}
async function boostViewAttempts(quizId){state.boostResultsOpenId=quizId;try{const r=await api('boost-attempts',{query:{quizId}});state.boostResults=r.attempts||[];render();}catch(e){toast(e.message);}}
async function boostViewRegistrations(quizId){state.boostRegistrationOpenId=quizId;try{const r=await api('boost-registrations',{query:{quizId}});state.boostRegistrations=r.registrations||[];render();}catch(e){toast(e.message);}}
function boostCloseRegistrations(){state.boostRegistrationOpenId=null;state.boostRegistrations=[];render();}
function boostCloseAttempts(){state.boostResultsOpenId=null;state.boostResults=[];render();}
function boostCloseQuestions(){state.boostSelectedId=null;state.boostQuestions=[];state.boostQuestionOpen=false;render();}
function boostNewQuestion(){state.boostQuestionEditId=null;state.boostQuestionOpen=true;render();}
function boostEditQuestion(id){state.boostQuestionEditId=id;state.boostQuestionOpen=true;render();}
function boostCancelQuestion(){state.boostQuestionOpen=false;state.boostQuestionEditId=null;render();}
async function boostSaveQuestion(){const prompt=$('#boostPrompt')?.value.trim(),options=[0,1,2,3].map(i=>$(`#boostOption${i}`)?.value.trim()),correctIndex=Number($('#boostCorrect')?.value),explanation=$('#boostExplanation')?.value.trim();if(!prompt||options.some(o=>!o))return toast('Enter the question and all four options.');try{await api('boost-question-save',{method:'POST',body:{quizId:state.boostSelectedId,id:state.boostQuestionEditId||undefined,prompt,options,correctIndex,explanation}});state.boostQuestionOpen=false;state.boostQuestionEditId=null;await boostManageQuestions(state.boostSelectedId);await boostLoadAdmin();toast('Question saved.');}catch(e){toast(e.message);}}
function boostOpenImport(mode){state.boostImportMode=mode;state.boostImportDraft=[];render();}
function boostCloseImport(){state.boostImportMode=null;state.boostImportDraft=[];render();}
function boostImportForm(){const qs=state.boostImportDraft||[];return `<div class="boost-import-form"><div class="section-head"><h3>${state.boostImportMode==='ai'?'Generate questions with AI':'Import questions from a document'}</h3><button class="mini" onclick="boostCloseImport()">Close</button></div>${state.boostImportMode==='ai'?`<div class="form-grid"><div class="field"><label>Subject</label><input id="boostAISubject" value="General"></div><div class="field"><label>Topic</label><input id="boostAITopic" value="General"></div><div class="field"><label>Number of questions</label><input id="boostAICount" type="number" value="10" min="1" max="50"></div><div class="field"><label>Difficulty</label><select id="boostAIDifficulty"><option>Medium</option><option>Easy</option><option>Hard</option></select></div></div><button class="btn btn-primary" onclick="boostGenerateQuestions()">Generate with AI</button>`:`<div class="field"><label for="boostImportFile">TXT, DOCX or PDF</label><input id="boostImportFile" type="file" accept=".txt,.docx,.pdf" onchange="boostImportDocument(this.files?.[0])"></div><p class="sub">For reliable imports, use numbered questions, A–D options, Answer Key and Explanations. Images are not yet supported in standalone Brainz Biltz questions.</p>`}${qs.length?`<div class="boost-import-review"><h3>Review ${qs.length} questions</h3>${qs.map((q,i)=>`<div class="boost-import-draft"><label>Question ${i+1}</label><textarea data-boost-prompt="${i}" rows="2">${esc(q.prompt)}</textarea>${q.options.map((v,j)=>`<div class="field"><label>${String.fromCharCode(65+j)}</label><input data-boost-option="${i}:${j}" value="${escAttr(v)}"></div>`).join('')}<div class="field"><label>Correct answer</label><select data-boost-answer="${i}">${[0,1,2,3].map(j=>`<option value="${j}" ${q.correctIndex===j?'selected':''}>${String.fromCharCode(65+j)}</option>`).join('')}</select></div><div class="field"><label>Explanation</label><textarea data-boost-explanation="${i}" rows="2">${esc(q.explanation||'')}</textarea></div></div>`).join('')}<div class="toolbar end"><button class="btn btn-primary" onclick="boostSaveImportedQuestions()">Save ${qs.length} reviewed questions</button></div></div>`:''}</div>`;}
function boostNormalizeImport(list){return (list||[]).slice(0,100).map(q=>({prompt:String(q.prompt||q.text||'').trim(),options:(q.options||[]).map(x=>String(x||'').trim()).slice(0,4),correctIndex:Number(q.correctIndex??q.answer),explanation:String(q.explanation||'').trim()})).filter(q=>q.prompt&&q.options.length===4&&q.options.every(Boolean)&&Number.isInteger(q.correctIndex)&&q.correctIndex>=0&&q.correctIndex<=3);}
async function boostGenerateQuestions(){const count=Math.min(50,Math.max(1,Number($('#boostAICount')?.value)||10));try{const r=await api('ai-generate',{method:'POST',body:{subject:$('#boostAISubject')?.value||'General',topic:$('#boostAITopic')?.value||'General',difficulty:$('#boostAIDifficulty')?.value||'Medium',type:'multiple_choice',count,exam:'University/First year',instructions:'Four choices, exactly one correct answer, clear concise academic explanation. No image-dependent items.'}});state.boostImportDraft=boostNormalizeImport(r.questions||[]);render();toast(`${state.boostImportDraft.length} questions ready for review.`);}catch(e){toast(e.message);}}
async function boostImportDocument(file){if(!file)return;try{if(file.size>10*1024*1024)throw new Error('Document must be under 10 MB.');let content='';const ext=file.name.split('.').pop().toLowerCase();if(ext==='docx'){if(!window.mammoth)throw new Error('Word reader unavailable.');const x=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});content=x.value;}else if(ext==='pdf'){if(window.pdfjsReady)await window.pdfjsReady;if(!window.pdfjsLib)throw new Error('PDF reader unavailable.');const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const pages=[];for(let i=1;i<=pdf.numPages;i++){const tc=await (await pdf.getPage(i)).getTextContent();pages.push(tc.items.map(x=>x.str||'').join(' '));}content=pages.join('\n');}else content=await file.text();let parsed=parseImportedDocumentLocally(content);if(!parsed.length){const r=await api('ai-extract',{method:'POST',body:{text:content.slice(0,180000),count:50,instructions:'Extract all complete multiple-choice questions with four options, correct answer, and explanation. Do not invent missing answers.'}});parsed=r.questions||[];}state.boostImportDraft=boostNormalizeImport(parsed);render();toast(`${state.boostImportDraft.length} complete questions extracted for review.`);}catch(e){toast(e.message||'Document import failed.');}}
async function boostSaveImportedQuestions(){const qs=(state.boostImportDraft||[]).map((q,i)=>({prompt:document.querySelector(`[data-boost-prompt="${i}"]`)?.value.trim()||'',options:[0,1,2,3].map(j=>document.querySelector(`[data-boost-option="${i}:${j}"]`)?.value.trim()||''),correctIndex:Number(document.querySelector(`[data-boost-answer="${i}"]`)?.value),explanation:document.querySelector(`[data-boost-explanation="${i}"]`)?.value.trim()||''}));if(!qs.length||qs.some(q=>!q.prompt||q.options.some(x=>!x)))return toast('Complete all questions and options before saving.');try{const r=await api('boost-question-batch-save',{method:'POST',body:{quizId:state.boostSelectedId,questions:qs}});state.boostImportMode=null;state.boostImportDraft=[];await boostManageQuestions(state.boostSelectedId);await boostLoadAdmin();toast(`${r.inserted} questions added to Brainz Biltz.`);}catch(e){toast(e.message);}}
async function boostDeleteQuestion(id){if(!await appConfirm('Delete question?','Remove this question from Brainz Biltz?','Delete'))return;try{await api('boost-question-delete',{method:'POST',body:{quizId:state.boostSelectedId,id}});await boostManageQuestions(state.boostSelectedId);await boostLoadAdmin();toast('Question deleted.');}catch(e){toast(e.message);}}

// Standalone Brainz Biltz quizzes: independent from the CBT-based legacy challenge workflow.
async function boostLoadPublic(slug){clearInterval(state.boostScheduleTimer);state.boostScheduleTimer=null;state.studentBoost={slug,stage:'loading',quiz:null,questions:[],name:'',answers:{},index:0,attempt:null,result:null,busy:false,deadline:0};applyStudentTheme();boostRenderStudent();try{const r=await api('boost-public',{query:{id:slug}});state.studentBoost.quiz=r.quiz;state.studentBoost.registration=r.registration||null;state.studentBoost.stage='intro';boostRenderStudent();}catch(e){state.studentBoost.stage='error';state.studentBoost.error=e.message;boostRenderStudent();}}
function boostRenderStudent(){const b=state.studentBoost;if(!b)return;clearInterval(state.boostScheduleTimer);state.boostScheduleTimer=null;applyStudentTheme();if(b.stage==='loading'||b.stage==='error'){app.innerHTML=`<div class="student-landing"><div class="student-card student-card-themed"><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><h1>${b.stage==='loading'?'Loading Brainz Biltz…':'Brainz Biltz unavailable'}</h1><p>${esc(b.error||'Preparing the quiz.')}</p></div></div>`;return;}
 const base=`<div class="boost-student-shell"><div class="boost-student-top"><div class="boost-brand"><img src="assets/icon.png" alt="Gifted Brainz"><span>⚡ BRAINZ BILTZ</span></div>${studentThemeToggle()}</div>`;
 if(b.stage==='intro'){
   const now=Date.now(),phase=b.quiz.phase==='closed'||(b.quiz.endAt&&Date.parse(b.quiz.endAt)<=now)?'closed':(b.quiz.startAt&&Date.parse(b.quiz.startAt)>now?'upcoming':'open');
   const registered=Boolean(b.registration?.studentName),registrationFields=b.quiz.registrationFields||[{key:'full_name',label:'Full Name',required:true,type:'text'}];
   const info=phase==='upcoming'?`<div class="boost-live-banner upcoming" role="status"><b>⏳ Assessment has not started</b><span>Starts ${esc(formatDateTime(b.quiz.startAt))}. You can register now and return when the examination opens.</span></div><div class="hub-boost-countdown" role="timer" aria-live="off"><span>CHALLENGE OPENS IN</span><strong data-countdown-to="${escAttr(b.quiz.startAt)}">${hubCountdownLabel(b.quiz.startAt)}</strong><small>${esc(formatDateTime(b.quiz.startAt))}</small></div>`:phase==='closed'?`<div class="boost-live-banner closed" role="status"><b>Assessment has closed</b><span>Closed ${esc(formatDateTime(b.quiz.endAt))}. New attempts are no longer accepted.</span></div>`:`<div class="boost-live-banner live" role="status"><b>⚡ Assessment is open</b><span>Registered learners can begin immediately.</span></div>`;
   const form=registered?`<div class="boost-registered"><span>✅ Pre-registration complete</span><strong>${esc(b.registration.studentName)}</strong><small>Your details are saved for this device.</small></div>${phase==='open'?'<button class="btn btn-primary big wide" onclick="boostStudentStart()">⚡ Start Assessment</button>':''}`:phase==='closed'?'':`<div class="boost-registration-form"><h2>Register for this challenge</h2><p>Register once. Your information will be recognised on this device when the challenge opens.</p><div class="boost-registration-grid">${registrationFields.map(f=>`<div class="field"><label for="boostField_${escAttr(f.key)}">${esc(f.label)} ${f.required?'*':''}</label><input id="boostField_${escAttr(f.key)}" type="${escAttr(f.type||'text')}" autocomplete="off" placeholder="Enter ${escAttr(f.label)}" ${f.required?'required':''}></div>`).join('')}</div><button class="btn btn-primary big wide" onclick="boostStudentRegister()" ${b.busy?'disabled':''}>${b.busy?'Registering…':'Register for Brainz Biltz'}</button></div>`;
   app.innerHTML=base+`<section class="boost-welcome boost-competition-welcome"><span class="eyebrow">THE CHALLENGE ARENA</span><h1>${esc(b.quiz.title)}</h1><p>${esc(b.quiz.description||'Challenge yourself with an exciting academic contest.')}</p><div class="boost-facts"><div><strong>${b.quiz.questionCount}</strong><small>Questions</small></div><div><strong>${b.quiz.secondsPerQuestion}s</strong><small>Per question</small></div><div><strong>${fmt(b.quiz.questionCount*b.quiz.secondsPerQuestion)}</strong><small>Total time</small></div></div>${info}${form}</section></div>`;if(phase==='upcoming')startBoostScheduleClock();
 }
 else if(b.stage==='playing'){const q=b.questions[b.index];const answeredCount=Object.values(b.answers).filter(x=>x!==null&&x!==undefined).length;app.innerHTML=base+`<section class="boost-play"><div class="boost-play-toolbar"><span>Question ${b.index+1} of ${b.questions.length}</span><strong id="boostClock" class="boost-clock" role="timer">${fmt(Math.ceil((b.deadline-Date.now())/1000))}</strong></div><div class="boost-progress"><span style="width:${Math.round((b.index+1)*100/b.questions.length)}%"></span></div><div class="boost-question"><div class="eyebrow">THINK FAST, UNDERSTAND DEEPLY</div><h2>${mathHtml(q.prompt)}</h2><div class="boost-answer-list">${q.options.map((opt,i)=>`<button class="boost-answer ${b.answers[q.id]===i?'selected':''}" onclick="boostStudentSelect(${i})"><b>${String.fromCharCode(65+i)}</b><span>${mathHtml(opt)}</span></button>`).join('')}</div></div><div class="boost-play-footer"><button class="btn btn-ghost" onclick="boostStudentPrevious()" ${b.index===0?'disabled':''}>← Previous</button><span class="sub">${answeredCount} of ${b.questions.length} answered</span>${b.index===b.questions.length-1?`<button class="btn btn-primary" onclick="boostStudentSubmit(false)" ${b.busy?'disabled':''}>Finish Quiz</button>`:`<button class="btn btn-primary" onclick="boostStudentNext()">Next →</button>`}</div></section></div>`;}
 else if(b.stage==='submitting'){app.innerHTML=base+`<section class="boost-welcome"><h1>Checking your answers…</h1><p>${esc(b.error||'Please keep this page open.')}</p>${b.error?'<button class="btn btn-primary" onclick="boostStudentSubmit(false)">Retry submission</button>':''}</section></div>`;}
 else if(b.stage==='result'){const r=b.result;app.innerHTML=base+`<section class="boost-results"><div class="eyebrow">BRAINZ BILTZ COMPLETED</div><h1>${esc(r.quizTitle)}</h1><p>Well done, ${esc(r.studentName)}!</p><div class="boost-score"><strong>${r.percent}%</strong><span>${r.score} of ${r.total} correct</span></div>${r.timedOut?'<p class="boost-expired">Time expired before your answers reached the server. The attempt received no marks.</p>':''}<div class="boost-review"><h2>Review your answers</h2>${r.review.map((q,i)=>`<article class="boost-review-item"><h3>${i+1}. ${mathHtml(q.prompt)}</h3>${q.options.map((opt,j)=>`<div class="boost-review-opt ${j===q.correctIndex?'correct':''} ${j===q.selected&&j!==q.correctIndex?'incorrect':''}"><b>${String.fromCharCode(65+j)}.</b> ${mathHtml(opt)} ${j===q.correctIndex?'✓':''}</div>`).join('')}<p><b>Your answer:</b> ${q.selected===null?'Not answered':String.fromCharCode(65+q.selected)} ${q.isCorrect?'— Correct':'— Incorrect'}</p><p class="sub"><b>Explanation:</b> ${mathHtml(q.explanation||'No explanation was provided.')}</p></article>`).join('')}</div><div class="toolbar end"><button class="btn btn-ghost" onclick="boostStudentRestart()">Try Again</button><button class="btn btn-primary" onclick="boostStudentExit()">Finish</button></div></section></div>`;}
 renderMath(app);applyStudentTheme();
}
async function boostStudentRegister(){const b=state.studentBoost;if(!b||b.busy)return;const fields=b.quiz.registrationFields||[],studentData={};for(const f of fields){studentData[f.key]=document.getElementById(`boostField_${f.key}`)?.value.trim()||'';if(f.required&&!studentData[f.key])return toast(`${f.label} is required.`);}b.busy=true;try{const r=await api('boost-register',{method:'POST',body:{slug:b.slug,studentData}});b.registration=r.registration;b.quiz.phase=r.phase;toast('Pre-registration successful.');}catch(e){toast(e.message);}finally{b.busy=false;boostRenderStudent();}}
async function boostStudentStart(){const b=state.studentBoost;if(!b||b.busy)return;if(!b.registration?.studentName)return toast('Register first to start the challenge.');b.busy=true;b.name=b.registration.studentName;try{const r=await api('boost-start',{method:'POST',body:{slug:b.slug}});b.attempt=r.attempt;b.questions=r.questions;b.answers={};b.index=0;b.stage='playing';const serverNow=Date.parse(r.serverNow||new Date().toISOString());b.deadline=Date.now()+Math.max(0,Math.min(Date.parse(r.attempt.startedAt)+r.questions.length*r.quiz.secondsPerQuestion*1000,b.quiz.endAt?Date.parse(b.quiz.endAt):Infinity)-serverNow);boostStartClock();}catch(e){toast(e.message);}finally{b.busy=false;boostRenderStudent();}}
function boostStartClock(){clearInterval(state.boostClockTimer);state.boostClockTimer=setInterval(()=>{const b=state.studentBoost;if(!b||b.stage!=='playing'){clearInterval(state.boostClockTimer);return;}const left=Math.max(0,Math.ceil((b.deadline-Date.now())/1000));const el=$('#boostClock');if(el){el.textContent=fmt(left);el.classList.toggle('urgent',left<=10);}if(left===0){clearInterval(state.boostClockTimer);boostStudentSubmit(true);}},250);}
function boostStudentSelect(i){const b=state.studentBoost;if(!b||b.stage!=='playing')return;b.answers[b.questions[b.index].id]=i;boostRenderStudent();}
function boostStudentPrevious(){const b=state.studentBoost;if(b.index>0){b.index--;boostRenderStudent();}}
function boostStudentNext(){const b=state.studentBoost;if(b.index<b.questions.length-1){b.index++;boostRenderStudent();}}
async function boostStudentSubmit(auto=false){const b=state.studentBoost;if(!b||b.busy||!b.attempt)return;if(!auto&&b.stage==='playing'){const unanswered=b.questions.filter(q=>b.answers[q.id]===undefined).length;if(unanswered&&!await appConfirm('Finish Brainz Biltz?',`You have ${unanswered} unanswered question(s). Submit anyway?`,'Finish quiz'))return;}b.busy=true;b.stage='submitting';b.error='';clearInterval(state.boostClockTimer);boostRenderStudent();try{const r=await api('boost-submit',{method:'POST',body:{attemptId:b.attempt.id,attemptToken:b.attempt.token,answers:b.answers}});b.result=r.result;b.stage='result';}catch(e){b.error=e.message||'Unable to submit answers.';toast(b.error);}finally{b.busy=false;boostRenderStudent();}}
function boostStudentRestart(){const slug=state.studentBoost?.slug;clearInterval(state.boostClockTimer);if(slug)boostLoadPublic(slug);}
function boostStudentExit(){clearInterval(state.boostClockTimer);const slug=state.studentBoost?.slug;state.studentBoost=null;history.replaceState(null,'',location.pathname);app.innerHTML=`<div class="student-landing"><div class="student-card student-card-themed"><img class="student-logo" src="assets/icon.png" alt="Gifted Brainz"><h1>Brainz Biltz complete</h1><p>You may close this page or open another quiz link.</p>${slug?`<a class="btn btn-primary" href="${escAttr(boostShareLink(slug))}">Replay Brainz Biltz</a>`:''}</div></div>`;}
Object.assign(window,{boostOpenQuizForm,boostCloseQuizForm,boostSaveQuiz,boostDeleteQuiz,boostManageQuestions,boostCloseQuestions,boostNewQuestion,boostEditQuestion,boostCancelQuestion,boostSaveQuestion,boostDeleteQuestion,boostViewAttempts,boostCloseAttempts,boostCopyLink,boostStudentStart,boostStudentSelect,boostStudentPrevious,boostStudentNext,boostStudentSubmit,boostStudentRestart,boostStudentExit});

function dashboard(){const avg=state.attempts.length?Math.round(state.attempts.reduce((a,b)=>a+Number(b.percent||0),0)/state.attempts.length):0;return shell(`<div class="hero"><div><div class="eyebrow">Gifted Brainz • Assessment Hub</div><h1>Build better tests. Help students understand more.</h1><p>Create professional CBTs, build question banks, use AI responsibly, publish dedicated student links and analyse performance.</p></div><div class="hero-actions"><button class="btn btn-primary" onclick="nav('ai')">✦ Create with AI</button><button class="btn btn-light" onclick="newQuiz()">＋ New CBT</button></div></div><div class="grid stats"><div class="stat"><div class="label">CBTs</div><div class="value">${state.quizzes.length}</div><div class="delta">Assessments created</div></div><div class="stat"><div class="label">ATTEMPTS</div><div class="value">${state.attempts.length}</div><div class="delta">Stored centrally</div></div><div class="stat"><div class="label">AVERAGE SCORE</div><div class="value">${avg}%</div><div class="delta">Across submitted attempts</div></div><div class="stat"><div class="label">QUESTION BANK</div><div class="value">${state.questions.length}</div><div class="delta">Reusable content</div></div></div><div class="grid two"><div class="card"><div class="section-head"><div><h2>Recent CBTs</h2><div class="sub">Each CBT has its own settings and student link.</div></div><button class="btn btn-ghost" onclick="nav('quizzes')">View all</button></div>${state.quizzes.slice(0,6).map(q=>`<div class="quiz-row"><div><div class="quiz-title">${esc(q.title)}</div><div class="sub">${q.questions?.length||0} questions • ${q.duration} min</div></div><span class="tag ${q.status==='published'?'green':'red'}">${q.status}</span><button class="mini" onclick="editQuiz('${q.id}')">✏️ Edit Quiz</button></div>`).join('')||`<div class="empty">No CBTs yet. Create your first assessment.</div>`}</div><div class="card"><div class="section-head"><div><h2>Performance Snapshot</h2><div class="sub">Recent student scores.</div></div></div>${state.attempts.length?`<div class="chart">${state.attempts.slice(0,10).reverse().map(a=>`<div class="bar" style="height:${Math.max(22,Number(a.percent||0)*1.8)}px"><b>${a.percent}%</b><span>${esc((a.student_name||'Student').slice(0,9))}</span></div>`).join('')}</div>`:`<div class="empty">No student attempts yet.</div>`}</div></div>`)}
function quizzes(){return shell(`<div class="section-head quiz-management-header"><div><h1 class="page-title">Quiz Management</h1><div class="page-sub">Manage each CBT from one clean workspace: content, student access, results and publishing.</div></div><div class="toolbar"><button class="btn btn-ghost" onclick="nav('questions')">＋ Manual Question</button><button class="btn btn-primary" onclick="newQuiz()">＋ Create CBT</button></div></div><div class="quiz-management-list">${state.quizzes.map(q=>`<article class="quiz-management-card"><div class="quiz-card-main"><div><div class="quiz-title">${esc(q.title)}</div><div class="sub quiz-card-meta">${q.questions?.length||0} questions • ${q.sections?.length||0} sections • Pass ${q.pass_mark}%</div>${cbtScheduleInline(q.settings?.startAt,q.settings?.endAt)}</div><div class="quiz-statuses"><span class="tag ${q.access_mode==='private'?'red':'green'}">${q.access_mode==='private'?'Private access':'Public access'}</span><span class="tag">${q.settings?.resultEnabled===false?'Results off':'Results on'}</span><span class="tag gold">${q.settings?.leaderboardEnabled===false?'Leaderboard off':'Leaderboard on'}</span><span class="tag ${q.status==='published'?'green':'red'}">${q.status}</span></div></div><div class="quiz-card-actions"><div class="quiz-action-group"><span class="quiz-action-label">Manage</span><button class="mini" onclick="editQuiz('${q.id}')">✏️ Edit Quiz</button><button class="mini" onclick="duplicateQuiz('${q.id}')">⧉ Duplicate</button></div><div class="quiz-action-group"><span class="quiz-action-label">Student access</span><button class="mini" onclick="copyQuizLink('${q.slug}')" ${q.status==='published'?'':'disabled'}>🔗 Test link</button><button class="mini" onclick="releaseResultLink('${q.id}')" ${q.status==='published'?'':'disabled'}>🔗 ${q.result_released?'Copy Result Link':'Release Result Link'}</button></div><div class="quiz-action-group quiz-action-group-end"><span class="quiz-action-label">Publish</span><button class="mini" onclick="publishQuiz('${q.id}')" ${q.status==='published'||!q.questions?.length?'disabled':''}>Publish</button><button class="mini danger-mini" onclick="deleteQuiz('${q.id}')">Delete</button></div></div></article>`).join('')||`<div class="card empty">No CBTs yet. Create your first assessment.</div>`}</div>`)}
function filterAdminQuestionBank(resetPage=false){
  if(resetPage)state.questionBankPage=0;
  const root=document.getElementById('questionBankList');if(!root)return;
  const query=(document.getElementById('questionBankSearch')?.value||'').toLocaleLowerCase().trim();
  const subject=document.getElementById('questionBankSubject')?.value||'';
  const difficulty=document.getElementById('questionBankDifficulty')?.value||'';
  const cards=Array.from(root.querySelectorAll('.question-card'));
  const matching=cards.filter(card=>(!query||card.dataset.search.includes(query))&&(!subject||card.dataset.subject===subject)&&(!difficulty||card.dataset.difficulty===difficulty));
  const perPage=25,pages=Math.max(1,Math.ceil(matching.length/perPage));state.questionBankPage=Math.max(0,Math.min(state.questionBankPage||0,pages-1));
  const start=state.questionBankPage*perPage;
  cards.forEach(card=>{card.hidden=true;card.style.display='none';});
  matching.slice(start,start+perPage).forEach(card=>{card.hidden=false;card.style.display='';renderMath(card);});
  const counter=document.getElementById('questionBankCount');if(counter)counter.textContent=matching.length?`Showing ${start+1}–${Math.min(matching.length,start+perPage)} of ${matching.length} matching questions`:'No matching questions. Try another search or filter.';
  const pageText=document.getElementById('questionBankPage');if(pageText)pageText.textContent=`Page ${state.questionBankPage+1} of ${pages}`;
  for(const [id,disabled] of [['questionBankPrev',state.questionBankPage===0],['questionBankNext',state.questionBankPage+1>=pages]]){const btn=document.getElementById(id);if(btn)btn.disabled=disabled;}
}
function pageAdminQuestionBank(direction){state.questionBankPage=(state.questionBankPage||0)+direction;filterAdminQuestionBank(false);document.getElementById('questionBankList')?.scrollIntoView({behavior:'smooth',block:'start'});}
function questions(){const allSelected=state.questions.length>0&&state.questions.every(q=>state.selectedQuestionIds.has(String(q.id)));return shell(`<div class="section-head"><div><h1 class="page-title">Question Bank</h1><div class="page-sub">Create questions manually, review AI content, and reuse questions across CBTs.</div></div><div class="toolbar"><button class="btn btn-ghost" onclick="newQuestion()">＋ Add Question</button><button class="btn btn-primary" onclick="nav('ai')">✦ AI Studio</button></div></div><div class="card question-bank-list" id="questionBankList"><div class="question-bank-filters"><label class="question-bank-search"><span>Search questions</span><input id="questionBankSearch" type="search" placeholder="Search question text, answers or topics" oninput="filterAdminQuestionBank(true)" autocomplete="off"></label><label><span>Subject</span><select id="questionBankSubject" onchange="filterAdminQuestionBank(true)"><option value="">All subjects</option>${[...new Set(state.questions.map(q=>String(q.subject||'').trim()).filter(Boolean))].sort().map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}</select></label><label><span>Difficulty</span><select id="questionBankDifficulty" onchange="filterAdminQuestionBank(true)"><option value="">All levels</option>${[...new Set(state.questions.map(q=>String(q.difficulty||'').trim()).filter(Boolean))].sort().map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}</select></label></div><div class="question-bank-search-status"><span id="questionBankCount" aria-live="polite"></span><span class="question-bank-page-controls"><button type="button" class="mini" id="questionBankPrev" onclick="pageAdminQuestionBank(-1)">← Previous</button><span id="questionBankPage">Page 1</span><button type="button" class="mini" id="questionBankNext" onclick="pageAdminQuestionBank(1)">Next →</button></span></div><div class="bulk-toolbar"><label class="check"><input type="checkbox" data-question-select-all ${allSelected?'checked':''} onchange="toggleAllQuestions(this.checked)"> Select all bank questions</label><span class="sub" data-question-selection-count>${state.selectedQuestionIds.size} selected</span><button class="mini danger-mini" data-question-bulk-delete onclick="bulkDeleteQuestions()" ${state.selectedQuestionIds.size?'':'disabled'}>🗑️ Delete selected</button></div>${state.questions.map((q,i)=>`<div class="question-card" data-search="${escAttr([q.text,q.topic,q.subject,...(q.options||[])].join(' ').toLocaleLowerCase())}" data-subject="${escAttr(String(q.subject||'').trim())}" data-difficulty="${escAttr(String(q.difficulty||'').trim())}"><div class="q-head"><div style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-question-select aria-label="Select question ${i+1}" ${state.selectedQuestionIds.has(String(q.id))?'checked':''} onchange="toggleQuestionSelection('${q.id}')"><div><span class="q-num">${q.type==='passage'?'Passage Question':'Question'} ${i+1}</span><div class="question-title">${questionStemHtml(q.text)}</div></div></div><span class="tag gold">${esc(q.difficulty)}</span></div><div class="sub question-meta">${esc(q.subject)} • ${esc(q.topic)} • ${q.type==='passage'?'Passage-based':'Multiple choice'} • ${Number(q.marks||1)} mark${Number(q.marks||1)==1?'':'s'}</div>${q.passage_content?`<div class="passage-preview"><b>📖 ${esc(q.passage_title||'Passage')}</b><p>${mathHtml(q.passage_content)}</p></div>`:''}${safeImageSrc(state.studentImageCache?.[q.id])?`<img class="question-image" src="${escAttr(safeImageSrc(state.studentImageCache[q.id]))}" alt="Question diagram">`:q.image_available?`<div class="question-image-loading">Loading question diagram…</div>`:''}<div class="option-list">${(q.options||[]).map((o,j)=>`<div class="option ${j===q.answer?'correct':''}"><b>${String.fromCharCode(65+j)}.</b> ${mathHtml(o)}</div>`).join('')}</div><div class="question-actions"><button class="mini" onclick="editQuestion('${q.id}')">✏️ Edit</button><button class="mini" onclick="addQuestionToQuiz('${q.id}')">➕ Add to CBT</button><button class="mini danger-mini" onclick="deleteBankQuestion('${q.id}')">🗑️ Delete</button></div></div>`).join('')||`<div class="empty">Your question bank is empty.</div>`}</div>`)}
function results(){
  const query=String(state.resultSearch||'').toLowerCase();const filtered=state.quizzes.filter(q=>!query||`${q.title} ${q.description||''}`.toLowerCase().includes(query));
  const perPage=8,pages=Math.max(1,Math.ceil(filtered.length/perPage));state.resultPage=Math.min(pages-1,Math.max(0,Number(state.resultPage)||0));
  const visible=filtered.slice(state.resultPage*perPage,(state.resultPage+1)*perPage);
  return shell(`<div class="section-head"><div><h1 class="page-title">Results & Leaderboards</h1><p class="page-sub">Find a CBT instantly, view its summary and open the full podium leaderboard.</p></div></div><div class="card gb-history-filter"><label>Find an assessment<input type="search" placeholder="Search CBT title…" value="${escAttr(state.resultSearch||'')}" oninput="updateResultSearch(this.value)"></label><div><b>${filtered.length}</b> assessments</div></div>
  <div class="gb-history-grid">${visible.map(q=>{const rows=leaderboardRowsForQuiz(q.id);const avg=rows.length?Math.round(rows.reduce((s,x)=>s+Number(x.percent||0),0)/rows.length):0;const passed=rows.filter(x=>Number(x.percent)>=Number(q.pass_mark||50)).length;return `<article class="card gb-history-card"><div class="gb-history-head"><span class="eyebrow">CBT RESULTS</span><span class="tag ${q.status==='published'?'green':'gold'}">${esc(q.status)}</span></div><h3>${esc(q.title)}</h3><div class="gb-history-numbers"><div><strong>${rows.length}</strong><span>Participants</span></div><div><strong>${avg}%</strong><span>Average</span></div><div><strong>${rows.length?Math.round(passed*100/rows.length):0}%</strong><span>Pass rate</span></div></div><div class="toolbar gb-history-actions"><button class="btn btn-primary" onclick="showLeaderboard('${q.id}')">🏆 View leaderboard</button><button class="btn btn-ghost" onclick="showQuizAnalytics('${q.id}')">View question analytics</button></div></article>`;}).join('')||'<div class="card empty">No CBT results match this search.</div>'}</div><div class="gb-pagination"><button class="mini" onclick="resultPageChange(-1)" ${state.resultPage===0?'disabled':''}>← Previous</button><span>Page ${state.resultPage+1} of ${pages}</span><button class="mini" onclick="resultPageChange(1)" ${state.resultPage>=pages-1?'disabled':''}>Next →</button></div>`);
}
function updateResultSearch(value){state.resultSearch=value;state.resultPage=0;render();const input=document.querySelector('.gb-history-filter input');if(input){input.focus();input.setSelectionRange(value.length,value.length);}}
function resultPageChange(delta){state.resultPage=(state.resultPage||0)+delta;render();window.scrollTo({top:0,behavior:'smooth'});}
function libraries(){const libs=state.libraries||[];return shell(`<div class="section-head"><div><h1 class="page-title">CBT Libraries</h1><div class="page-sub">Create shareable collections of published CBTs. A CBT can appear in more than one library.</div></div><button class="btn btn-primary" onclick="newLibrary()">＋ Create Library</button></div>${libs.length?libs.map(lib=>`<div class="card library-card"><div class="section-head"><div><h2>🗂️ ${esc(lib.name)}</h2><div class="sub">${(lib.items||[]).length} CBT${(lib.items||[]).length===1?'':'s'} • ${esc(lib.description||'')} <span class="tag ${lib.access_mode==='private'?'red':'green'}">${lib.access_mode==='private'?'Private library':'Public library'}</span></div></div><div class="toolbar"><button class="mini" onclick="manageLibrary('${lib.id}')">⚙️ Manage</button><button class="mini" onclick="copyLibraryLink('${lib.slug}')">🔗 Copy library link</button><button class="mini danger-mini" onclick="deleteLibrary('${lib.id}')">Delete</button></div></div><div class="hub-library-topic-list" aria-label="CBTs in ${escAttr(lib.name)}">${(lib.items||[]).length>8?`<div class="hub-library-chip-grid">${lib.items.slice(0,8).map(item=>`<span class="hub-library-topic-chip"><span class="hub-topic-name">${esc(item.title||'CBT')}</span><small>${item.status==='published'?'Published':'Draft'}</small></span>`).join('')}</div><details class="hub-library-more"><summary>View all ${(lib.items||[]).length} CBTs</summary><div class="hub-library-chip-grid">${lib.items.slice(8).map(item=>`<span class="hub-library-topic-chip"><span class="hub-topic-name">${esc(item.title||'CBT')}</span><small>${item.status==='published'?'Published':'Draft'}</small></span>`).join('')}</div></details>`:`<div class="hub-library-chip-grid">${(lib.items||[]).map(item=>`<span class="hub-library-topic-chip"><span class="hub-topic-name">${esc(item.title||'CBT')}</span><small>${item.status==='published'?'Published':'Draft'}</small></span>`).join('')||'<span class="sub">No published CBTs added yet.</span>'}</div>`}</div><div class="sub library-link">${esc(libraryPublicLink(lib.slug))}</div></div>`).join(''):`<div class="card empty">No CBT Libraries yet. Create one to group published assessments for students.</div>`}`);}
function libraryModal(lib){const selected=currentLibraryQuizIds(lib?.id);const published=(state.quizzes||[]).filter(q=>q.status==='published');const accessMode=lib?.access_mode==='private'?'private':'public';return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal modal-wide"><div class="modal-head"><div><h2>${lib?'⚙️ Manage Library':'➕ Create CBT Library'}</h2><div class="sub">Choose what students can access and select the published CBTs included.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="form-grid" style="margin-top:18px"><div class="field full"><label>Library name *</label><input id="libName" value="${escAttr(lib?.name||'')}" placeholder="e.g. UTME 2027 Mathematics"></div><div class="field full"><label>Description</label><textarea id="libDescription" rows="3" placeholder="What students will find in this library.">${esc(lib?.description||'')}</textarea></div><div class="field full"><label>Library access</label><select id="libAccessMode"><option value="public" ${accessMode==='public'?'selected':''}>Public — anyone with the link can access</option><option value="private" ${accessMode==='private'?'selected':''}>Private — approved devices only</option></select><small class="sub">Private access is checked by the server for the library and each CBT it contains. Direct CBT links cannot bypass the restriction.</small></div></div>${lib?`<section class="library-device-admin"><div><h3>Private-library device approval</h3><p class="sub">Enter the device ID supplied by the user. A code will be generated for this device and this library.</p></div><div class="field"><label for="libDeviceId">User device ID</label><input id="libDeviceId" autocomplete="off" placeholder="Paste the user's device ID"></div><button class="btn btn-light" onclick="generateLibraryActivation('${lib.id}')">Register device &amp; generate activation code</button>${state.libraryActivationCode?.libraryId===lib.id?`<div class="library-activation-code" role="status"><span>Activation code for this device</span><strong>${esc(state.libraryActivationCode.code)}</strong><small>This code is shown once. Give it only to the approved user. It is tied to the device ID entered above.</small><button class="mini" onclick="copyActivationCode()">Copy code</button></div>`:''}</section><section class="library-device-admin"><div class="section-head"><div><h3>Activated devices</h3><p class="sub">Students currently approved on this library, with the name they gave when activating. Deactivating removes their access immediately.</p></div><button class="mini danger-mini" onclick="clearLibraryDevices('${lib.id}')" ${(state.libraryDevices?.[lib.id]||[]).length?'':'disabled'}>Clear all activated devices</button></div><div class="pool-topic-list">${state.libraryDevices?.[lib.id]===undefined?'<div class="empty">Loading…</div>':((state.libraryDevices[lib.id].length?state.libraryDevices[lib.id].map(d=>`<div class="pool-topic-row"><div class="pool-topic-info"><b>${esc(d.student_name||'Unnamed student')}</b><small>Device ${esc(String(d.device_id||''))} • Activated ${d.activated_at?new Date(d.activated_at).toLocaleString():'—'}</small></div><div class="pool-topic-actions"><button class="mini danger-mini" onclick="deactivateLibraryDevice('${lib.id}','${d.id}','${escAttr(d.student_name||'This device')}')">Deactivate</button></div></div>`).join(''):'<div class="empty">No devices have activated on this library yet.</div>'))}</div></section>`:`<div class="notice" style="margin-top:16px">Save the library first to register devices and generate activation codes.</div>`}<div class="subsection"><div class="section-head"><div><h3>Published CBTs</h3><div class="sub">Choose any number. You can add more later.</div></div><label class="check"><input id="libSelectAll" type="checkbox" onchange="toggleAllLibraryQuizzes(this.checked)"> Select all</label></div><div class="library-picker">${published.map(q=>`<label class="library-pick"><input type="checkbox" data-library-quiz="${q.id}" ${selected.has(String(q.id))?'checked':''}><span><b>${esc(q.title)}</b><small>${q.questions?.length||0} questions • ${q.duration} min</small></span></label>`).join('')||'<div class="empty">Publish a CBT first, then add it here.</div>'}</div></div><div class="toolbar end"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveLibrary('${lib?.id||''}')">${lib?'Save changes':'Create Library'}</button></div></div></div>`}
function publishModal(id){const q=state.quizzes.find(x=>x.id===id);const selected=(state.libraries||[]).filter(l=>(l.items||[]).some(x=>String(x.quiz_id)===String(id)));return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><div><h2>Publish CBT</h2><div class="sub">Choose any CBT Libraries where students should find this test.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="notice" style="margin-top:18px"><b>${esc(q?.title||'This CBT')}</b> will be published as its own student test link.</div><div class="library-picker" style="margin-top:16px">${(state.libraries||[]).map(l=>`<label class="library-pick"><input type="checkbox" data-publish-library="${l.id}" ${selected.some(x=>x.id===l.id)?'checked':''}><span><b>${esc(l.name)}</b><small>${(l.items||[]).length} CBT${(l.items||[]).length===1?'':'s'}</small></span></label>`).join('')||'<div class="empty">No libraries yet. The CBT will still publish normally. You can create a library later.</div>'}</div><div class="toolbar end"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="publishQuizNow('${id}')">Publish CBT</button></div></div></div>`}
function newLibrary(){state.modal={type:'library',library:null};renderModal();}
function manageLibrary(id){state.modal={type:'library',library:(state.libraries||[]).find(x=>x.id===id)};renderModal();loadLibraryDevices(id);}
async function loadLibraryDevices(libraryId){try{const r=await api('library-device-list',{query:{libraryId}});state.libraryDevices=state.libraryDevices||{};state.libraryDevices[libraryId]=r.devices||[];if(state.modal?.type==='library'&&state.modal.library?.id===libraryId)renderModal();}catch(e){toast(e.message)}}
async function deactivateLibraryDevice(libraryId,id,name){if(!await appConfirm('Deactivate this device?',`${name||'This device'} will immediately lose access to this library. They will need a new activation code to use it again. Are you sure?`,'Deactivate device'))return;try{await api('library-device-deactivate',{method:'POST',body:{id}});toast('Device deactivated.');await loadLibraryDevices(libraryId);}catch(e){toast(e.message)}}
async function clearLibraryDevices(libraryId){const list=state.libraryDevices?.[libraryId]||[];if(!list.length)return toast('No activated devices to clear.');if(!await appConfirm('Clear all activated devices?',`All ${list.length} activated device${list.length===1?'':'s'} will immediately lose access to this library. This cannot be undone. Are you sure?`,'Clear all devices'))return;try{await api('library-device-clear',{method:'POST',body:{libraryId}});toast('All activated devices cleared.');await loadLibraryDevices(libraryId);}catch(e){toast(e.message)}}
function toggleAllLibraryQuizzes(checked){$$('[data-library-quiz]').forEach(el=>el.checked=checked);}
async function saveLibrary(id){try{const name=$('#libName').value.trim();if(!name){toast('Library name is required.');return}const quizIds=$$('[data-library-quiz]:checked').map(el=>el.dataset.libraryQuiz);const accessMode=$('#libAccessMode')?.value==='private'?'private':'public';let library;if(id)library=(await api('library-update',{method:'PUT',body:{id,name,description:$('#libDescription').value,accessMode}})).library;else library=(await api('library-create',{method:'POST',body:{name,description:$('#libDescription').value,accessMode}})).library;await api('library-sync',{method:'POST',body:{libraryId:library.id,quizIds}});state.modal=null;state.libraryActivationCode=null;await refreshAdmin(id?'Library updated':'Library created');state.page='libraries';render();}catch(e){toast(e.message)}}
async function generateLibraryActivation(libraryId){const input=$('#libDeviceId');const deviceId=String(input?.value||'').trim();if(!deviceId)return toast('Enter the user device ID first.');const prior={name:$('#libName')?.value||'',description:$('#libDescription')?.value||'',accessMode:$('#libAccessMode')?.value||'public',quizIds:$$('[data-library-quiz]:checked').map(el=>el.dataset.libraryQuiz)};try{const result=await api('library-device-code',{method:'POST',body:{libraryId,deviceId}});state.libraryActivationCode={libraryId,deviceId,code:result.activationCode};renderModal();if($('#libName'))$('#libName').value=prior.name;if($('#libDescription'))$('#libDescription').value=prior.description;if($('#libAccessMode'))$('#libAccessMode').value=prior.accessMode;$$('[data-library-quiz]').forEach(el=>el.checked=prior.quizIds.includes(el.dataset.libraryQuiz));const newInput=$('#libDeviceId');if(newInput)newInput.value=deviceId;toast('Activation code generated. Share it with the approved user.');}catch(e){toast(e.message)}}
async function copyActivationCode(){const code=state.libraryActivationCode?.code;if(!code)return;try{await navigator.clipboard.writeText(code);toast('Activation code copied.');}catch{toast(`Activation code: ${code}`)}}
async function deleteLibrary(id){const lib=state.libraries.find(x=>x.id===id);if(!lib)return;if(!await appConfirm('Delete CBT Library?',`Delete “${lib.name}”? The CBTs themselves will not be deleted.`,'Delete Library'))return;try{await api('library-delete',{method:'DELETE',query:{id}});await refreshAdmin('Library deleted');}catch(e){toast(e.message)}}
async function copyLibraryLink(slug){const link=libraryPublicLink(slug);try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);else{const ta=document.createElement('textarea');ta.value=link;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}toast('CBT Library link copied');}catch{toast(link)}}

// ===== Question Pools =====
function poolPublicLink(slug){return `${location.origin}${location.pathname}?pool=${encodeURIComponent(slug)}`;}
function pools(){const list=state.pools||[];return shell(`<div class="section-head"><div><h1 class="page-title">Question Pools</h1><div class="page-sub">Named collections of topics students can browse and practise on their own — reusable learning resources, not single tests.</div></div><button class="btn btn-primary" onclick="newPool()">＋ Create Question Pool</button></div>${list.length?list.map(pool=>{const topics=pool.topics||[];const totalQs=topics.reduce((s,t)=>s+(t.questionCount||0),0);return `<div class="card library-card pool-collection-card"><div class="section-head"><div><h2>🧠 ${esc(pool.name)}</h2><div class="sub">${topics.length} topic${topics.length===1?'':'s'} • ${totalQs} question${totalQs===1?'':'s'} • ${esc(pool.description||'')} <span class="tag ${pool.access_mode==='private'?'red':'green'}">${pool.access_mode==='private'?'Private pool':'Public pool'}</span></div></div><div class="toolbar"><button class="mini" onclick="managePool('${pool.id}')">⚙️ Manage</button><button class="mini" onclick="copyPoolLink('${pool.slug}')">🔗 Copy pool link</button><button class="mini danger-mini" onclick="deletePool('${pool.id}')">Delete</button></div></div><details class="pool-topics-disclosure" ${topics.length<=8?'open':''}><summary>${topics.length>8?`View all ${topics.length} topics`:`${topics.length} topics`}</summary><div class="library-items pool-chip-grid">${topics.map(t=>`<button type="button" class="pool-topic-chip" onclick="openPoolTopic('${pool.id}','${t.id}')"><span>${esc(t.name)}</span><b>${t.questionCount||0}</b></button>`).join('')||'<span class="sub">No topics yet. Manage this pool to add topics.</span>'}</div></details><div class="sub library-link">${esc(poolPublicLink(pool.slug))}</div></div>`}).join(''):`<div class="card empty">No Question Pools yet. Create one (e.g. “Chemistry”) and add topics such as “Separation Techniques”.</div>`}`);}
function poolModal(pool){const accessMode=pool?.access_mode==='private'?'private':'public';const topics=pool?.topics||[];return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal modal-wide"><div class="modal-head"><div><h2>${pool?'⚙️ Manage Question Pool':'➕ Create Question Pool'}</h2><div class="sub">A pool groups topics (e.g. Chemistry → Separation Techniques, Atomic Structure…). Students choose topics and Study or Practice Mode.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="form-grid" style="margin-top:18px"><div class="field full"><label>Pool name *</label><input id="poolName" value="${escAttr(pool?.name||'')}" placeholder="e.g. Chemistry"></div><div class="field full"><label>Description</label><textarea id="poolDescription" rows="2" placeholder="What students will find in this pool.">${esc(pool?.description||'')}</textarea></div><div class="field full"><label>Pool access</label><select id="poolAccessMode"><option value="public" ${accessMode==='public'?'selected':''}>Public — anyone with the link can access</option><option value="private" ${accessMode==='private'?'selected':''}>Private — approved devices only</option></select><small class="sub">Private access is checked by the server, exactly like Private CBT Libraries.</small></div></div><div class="toolbar end" style="margin-top:4px"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="savePool('${pool?.id||''}')">${pool?'Save changes':'Create Pool'}</button></div>${pool?`<section class="library-device-admin" style="margin-top:18px"><div><h3>Topics</h3><p class="sub">Add, rename or remove topics. Open a topic to manage its questions.</p></div><div class="field" style="display:flex;gap:10px;align-items:flex-end"><div style="flex:1"><label for="poolNewTopic">New topic name</label><input id="poolNewTopic" placeholder="e.g. Separation Techniques"></div><button class="btn btn-light" onclick="addPoolTopic('${pool.id}')">＋ Add topic</button></div><div class="pool-topic-list">${topics.map(t=>`<div class="pool-topic-row"><div class="pool-topic-info"><b>${esc(t.name)}</b><small>${t.questionCount||0} question${t.questionCount===1?'':'s'}</small></div><div class="pool-topic-actions"><button class="mini" onclick="closeModal();openPoolTopic('${pool.id}','${t.id}')">Open</button><button class="mini" onclick="renamePoolTopic('${pool.id}','${t.id}','${escAttr(t.name)}')">Rename</button><button class="mini danger-mini" onclick="deletePoolTopic('${pool.id}','${t.id}')">Delete</button></div></div>`).join('')||'<div class="empty">No topics yet. Add one above.</div>'}</div></section><section class="library-device-admin"><div><h3>Private-pool device approval</h3><p class="sub">Enter the device ID supplied by the user. A code will be generated for this device and this pool.</p></div><div class="field"><label for="poolDeviceId">User device ID</label><input id="poolDeviceId" autocomplete="off" placeholder="Paste the user's device ID"></div><button class="btn btn-light" onclick="generatePoolActivation('${pool.id}')">Register device &amp; generate activation code</button>${state.poolActivationCode?.poolId===pool.id?`<div class="library-activation-code" role="status"><span>Activation code for this device</span><strong>${esc(state.poolActivationCode.code)}</strong><small>This code is shown once. Give it only to the approved user.</small><button class="mini" onclick="copyPoolActivationCode()">Copy code</button></div>`:''}</section><section class="library-device-admin"><div class="section-head"><div><h3>Activated devices</h3><p class="sub">Students currently approved on this pool, with the name they gave when activating. Deactivating removes their access immediately.</p></div><button class="mini danger-mini" onclick="clearPoolDevices('${pool.id}')" ${(state.poolDevices?.[pool.id]||[]).length?'':'disabled'}>Clear all activated devices</button></div><div class="pool-topic-list">${state.poolDevices?.[pool.id]===undefined?'<div class="empty">Loading…</div>':((state.poolDevices[pool.id].length?state.poolDevices[pool.id].map(d=>`<div class="pool-topic-row"><div class="pool-topic-info"><b>${esc(d.student_name||'Unnamed student')}</b><small>Device ${esc(String(d.device_id||''))} • Activated ${d.activated_at?new Date(d.activated_at).toLocaleString():'—'}</small></div><div class="pool-topic-actions"><button class="mini danger-mini" onclick="deactivatePoolDevice('${pool.id}','${d.id}','${escAttr(d.student_name||'This device')}')">Deactivate</button></div></div>`).join(''):'<div class="empty">No devices have activated on this pool yet.</div>'))}</div></section>`:`<div class="notice" style="margin-top:16px">Save the pool first to add topics and register devices.</div>`}</div></div>`}
function newPool(){state.modal={type:'pool',pool:null};renderModal();}
function managePool(id){state.modal={type:'pool',pool:(state.pools||[]).find(x=>x.id===id)};renderModal();loadPoolDevices(id);}
async function loadPoolDevices(poolId){try{const r=await api('pool-device-list',{query:{poolId}});state.poolDevices=state.poolDevices||{};state.poolDevices[poolId]=r.devices||[];if(state.modal?.type==='pool'&&state.modal.pool?.id===poolId)renderModal();}catch(e){toast(e.message)}}
async function deactivatePoolDevice(poolId,id,name){if(!await appConfirm('Deactivate this device?',`${name||'This device'} will immediately lose access to this Question Pool. They will need a new activation code to use it again. Are you sure?`,'Deactivate device'))return;try{await api('pool-device-deactivate',{method:'POST',body:{id}});toast('Device deactivated.');await loadPoolDevices(poolId);}catch(e){toast(e.message)}}
async function clearPoolDevices(poolId){const list=state.poolDevices?.[poolId]||[];if(!list.length)return toast('No activated devices to clear.');if(!await appConfirm('Clear all activated devices?',`All ${list.length} activated device${list.length===1?'':'s'} will immediately lose access to this Question Pool. This cannot be undone. Are you sure?`,'Clear all devices'))return;try{await api('pool-device-clear',{method:'POST',body:{poolId}});toast('All activated devices cleared.');await loadPoolDevices(poolId);}catch(e){toast(e.message)}}
async function savePool(id){try{
  const name=$('#poolName').value.trim();if(!name)return toast('Pool name is required.');
  const accessMode=$('#poolAccessMode')?.value==='private'?'private':'public';
  const body={name,description:$('#poolDescription').value,accessMode};if(id)body.id=id;
  const r=id?await api('pool-update',{method:'PUT',body}):await api('pool-create',{method:'POST',body});
  state.poolActivationCode=null;
  if(id){
    const existing=state.pools.find(p=>p.id===id);
    if(existing)Object.assign(existing,{name:r.pool.name,description:r.pool.description,access_mode:r.pool.access_mode});
    state.modal=null;state.page='pools';render();toast('Question Pool updated');
  }else{
    state.pools.push({...r.pool,topics:r.pool.topics||[]});
    managePool(r.pool.id);toast('Question Pool created');
  }
}catch(e){toast(e.message)}}
async function deletePool(id){const pool=state.pools.find(x=>x.id===id);if(!pool)return;if(!await appConfirm('Delete Question Pool?',`Delete “${pool.name}”? All its topics and questions will be permanently removed.`,'Delete Pool'))return;try{await api('pool-delete',{method:'DELETE',query:{id}});state.pools=state.pools.filter(p=>p.id!==id);if(state.modal?.type==='pool'&&state.modal.pool?.id===id)state.modal=null;toast('Question Pool deleted');render();}catch(e){toast(e.message)}}
async function copyPoolLink(slug){const link=poolPublicLink(slug);try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);else{const ta=document.createElement('textarea');ta.value=link;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}toast('Question Pool link copied');}catch{toast(link)}}
async function generatePoolActivation(poolId){const input=$('#poolDeviceId');const deviceId=String(input?.value||'').trim();if(!deviceId)return toast('Enter the user device ID first.');try{const result=await api('pool-device-code',{method:'POST',body:{poolId,deviceId}});state.poolActivationCode={poolId,deviceId,code:result.activationCode};renderModal();const newInput=$('#poolDeviceId');if(newInput)newInput.value=deviceId;toast('Activation code generated. Share it with the approved user.');}catch(e){toast(e.message)}}
async function copyPoolActivationCode(){const code=state.poolActivationCode?.code;if(!code)return;try{await navigator.clipboard.writeText(code);toast('Activation code copied.');}catch{toast(`Activation code: ${code}`)}}
async function addPoolTopic(poolId){const input=$('#poolNewTopic');const name=String(input?.value||'').trim();if(!name)return toast('Enter a topic name.');try{
  const r=await api('pool-topic-save',{method:'POST',body:{poolId,name}});
  const pool=state.pools.find(p=>p.id===poolId);if(pool){pool.topics=pool.topics||[];pool.topics.push(r.topic);}
  toast('Topic added');managePool(poolId);
}catch(e){toast(e.message)}}
async function renamePoolTopic(poolId,topicId,currentName){const name=prompt('Rename topic',currentName);if(!name||!name.trim()||name.trim()===currentName)return;try{
  const r=await api('pool-topic-save',{method:'POST',body:{id:topicId,poolId,name:name.trim()}});
  const pool=state.pools.find(p=>p.id===poolId);const topic=pool?.topics?.find(t=>t.id===topicId);if(topic)topic.name=r.topic.name;
  toast('Topic renamed');managePool(poolId);
}catch(e){toast(e.message)}}
async function deletePoolTopic(poolId,topicId){const pool=state.pools.find(x=>x.id===poolId);const topic=(pool?.topics||[]).find(t=>t.id===topicId);if(!topic)return;const msg=topic.questionCount?`Delete “${topic.name}”? Its ${topic.questionCount} question${topic.questionCount===1?'':'s'} will remain in the pool as unassigned questions and can be moved to another topic.`:`Delete “${topic.name}”?`;if(!await appConfirm('Delete topic?',msg,'Delete topic'))return;try{
  await api('pool-topic-delete',{method:'DELETE',query:{id:topicId}});
  if(pool)pool.topics=(pool.topics||[]).filter(t=>t.id!==topicId);
  delete state.poolTopicQuestions[topicId];state.poolQuestionSelection=new Set();
  toast('Topic deleted');managePool(poolId);
}catch(e){toast(e.message)}}
function openPoolTopic(poolId,topicId){state.poolQuestionSelection=new Set();state.modal={type:'poolTopic',poolId,topicId};renderModal();}
async function loadPoolTopicQuestions(topicId){if(state.poolTopicQuestionsLoading[topicId])return;state.poolTopicQuestionsLoading[topicId]=true;try{const r=await api('pool-topic-questions',{query:{topicId}});state.poolTopicQuestions[topicId]=r.questions||[];}catch(e){toast(e.message)}finally{state.poolTopicQuestionsLoading[topicId]=false;if(state.modal?.type==='poolTopic'&&state.modal.topicId===topicId)renderModal();}}
function otherPoolTopics(poolId,topicId){return ((state.pools.find(p=>p.id===poolId)?.topics)||[]).filter(t=>t.id!==topicId);}
function poolTopicModal(poolId,topicId){const pool=state.pools.find(x=>x.id===poolId);const topic=(pool?.topics||[]).find(t=>t.id===topicId);const qs=state.poolTopicQuestions[topicId];const sel=state.poolQuestionSelection;const selCount=qs?qs.filter(x=>sel.has(x.id)).length:0;const others=otherPoolTopics(poolId,topicId);const allSelected=qs&&qs.length>0&&qs.every(x=>sel.has(x.id));return `<div class="modal-backdrop"><div class="modal modal-wide"><div class="modal-head"><div><h2>🧩 ${esc(topic?.name||'Topic')}</h2><div class="sub">${esc(pool?.name||'Question Pool')} • Add questions manually, with Groq AI, or by importing a document.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="builder-grid"><button class="builder-card" onclick="closeModal();newPoolQuestion('${poolId}','${topicId}')"><b>✍️ Add manually</b><span>Create and edit a question yourself.</span></button><button class="builder-card" onclick="closeModal();openAiForPoolTopic('${poolId}','${topicId}')"><b>🤖 Generate with AI</b><span>Generate questions with Groq and save them directly to this topic.</span></button><button class="builder-card" onclick="closeModal();openAiForPoolTopic('${poolId}','${topicId}');setTimeout(()=>document.getElementById('docFile')?.click(),100)"><b>📄 Import PDF / document</b><span>Extract questions for review; images are preserved.</span></button></div><div class="subsection builder-question-list"><div class="section-head"><div><h3>Questions</h3><div class="sub">${qs?`${qs.length} question${qs.length===1?'':'s'} in this topic.`:'Loading…'}</div></div>${qs&&qs.length?`<label class="check"><input type="checkbox" ${allSelected?'checked':''} onchange="togglePoolQuestionSelectAll('${topicId}',this.checked)"> Select all</label>`:''}</div>${selCount?`<div class="pool-move-bar"><span>${selCount} selected</span>${others.length?`<select id="poolMoveTarget"><option value="">Move to topic…</option>${others.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><button class="mini" onclick="movePoolSelectedQuestions('${poolId}','${topicId}')">Move</button>`:'<span class="sub">No other topics in this pool to move to.</span>'}<button class="mini danger-mini" onclick="bulkDeletePoolQuestions('${poolId}','${topicId}')">🗑️ Delete selected</button><button class="mini" onclick="state.poolQuestionSelection=new Set();renderModal()">Clear</button></div>`:''}${qs===undefined?'<div class="empty">Loading questions…</div>':(qs.map((x,i)=>`<div class="quiz-row"><div style="display:flex;gap:10px;align-items:flex-start"><label class="check pool-q-check"><input type="checkbox" ${sel.has(x.id)?'checked':''} onchange="togglePoolQuestionSelect('${x.id}')"></label><div><b>${i+1}. ${questionStemHtml(x.text)}</b><div class="sub">${esc(x.type||'multiple_choice')} • ${Number(x.marks||1)} mark${Number(x.marks||1)==1?'':'s'}${x.needs_review?' • <span class=\"tag red\">Needs review</span>':''}</div></div></div><div class="quiz-row-actions"><button class="mini" onclick="editPoolQuestion('${x.id}','${poolId}','${topicId}')">✏️ Edit</button><button class="mini danger-mini" onclick="deletePoolQuestionItem('${x.id}','${topicId}')">🗑️ Delete</button></div></div>`).join('')||'<div class="empty">No questions yet. Add one above.</div>')}</div><div class="toolbar end"><button class="btn btn-primary" onclick="closeModal()">Done</button></div></div></div>`}
function togglePoolQuestionSelect(id){if(state.poolQuestionSelection.has(id))state.poolQuestionSelection.delete(id);else state.poolQuestionSelection.add(id);renderModal();}
function togglePoolQuestionSelectAll(topicId,checked){const qs=state.poolTopicQuestions[topicId]||[];state.poolQuestionSelection=checked?new Set(qs.map(q=>q.id)):new Set();renderModal();}
async function movePoolSelectedQuestions(poolId,topicId){
  const targetId=$('#poolMoveTarget')?.value;
  const ids=[...state.poolQuestionSelection];
  if(!ids.length)return toast('Select at least one question first.');
  if(!targetId)return toast('Choose a destination topic.');
  try{
    const r=await api('pool-questions-move',{method:'POST',body:{questionIds:ids,topicId:targetId}});
    state.poolTopicQuestions[topicId]=(state.poolTopicQuestions[topicId]||[]).filter(q=>!ids.includes(q.id));
    delete state.poolTopicQuestions[targetId];
    const pool=state.pools.find(p=>p.id===poolId);
    if(pool){const src=pool.topics.find(t=>t.id===topicId);if(src)src.questionCount=Math.max(0,(src.questionCount||0)-r.moved);const dst=pool.topics.find(t=>t.id===targetId);if(dst)dst.questionCount=(dst.questionCount||0)+r.moved;}
    state.poolQuestionSelection=new Set();
    toast(`${r.moved} question${r.moved===1?'':'s'} moved to “${r.topicName}”.`);
    renderModal();
  }catch(e){toast(e.message)}
}
async function bulkDeletePoolQuestions(poolId,topicId){const ids=[...state.poolQuestionSelection];if(!ids.length)return toast('Select at least one question first.');if(!await appConfirm('Delete selected questions?',`${ids.length} question${ids.length===1?'':'s'} will be permanently removed from this topic.`,'Delete selected'))return;try{
  const r=await api('pool-bulk-delete',{method:'POST',body:{ids,topicId}});
  const removed=Number(r.removed||0);
  const removedIds=new Set((r.ids||ids).map(String));
  const list=state.poolTopicQuestions[topicId];
  if(list)state.poolTopicQuestions[topicId]=list.filter(x=>!removedIds.has(x.id));
  const pool=state.pools.find(p=>p.id===poolId);
  if(pool){const t=pool.topics.find(t=>t.id===topicId);if(t)t.questionCount=Math.max(0,(t.questionCount||0)-removed);}
  state.poolQuestionSelection=new Set();
  toast(`${removed} question${removed===1?'':'s'} deleted successfully.`);
  renderModal();
}catch(e){toast(e.message)}}
function newPoolQuestion(poolId,topicId){state.modal={type:'poolQuestion',poolId,topicId,question:null};renderModal();}
async function editPoolQuestion(id,poolId,topicId){const local=(state.poolTopicQuestions[topicId]||[]).find(q=>q.id===id);try{const r=await api('question-get',{query:{id}});state.modal={type:'poolQuestion',poolId,topicId,question:r.question||local};renderModal();}catch(e){toast(e.message)}}
async function deletePoolQuestionItem(id,topicId){if(!await appConfirm('Delete question?','This question will be permanently removed from the topic.','Delete'))return;try{
  await api('question-delete',{method:'DELETE',query:{id}});
  const list=state.poolTopicQuestions[topicId];
  if(list){const idx=list.findIndex(x=>x.id===id);if(idx>=0){list.splice(idx,1);for(const pool of state.pools){const t=(pool.topics||[]).find(t=>t.id===topicId);if(t){t.questionCount=Math.max(0,(t.questionCount||0)-1);break;}}}}
  state.poolQuestionSelection.delete(id);
  toast('Question deleted');
  if(state.modal?.type==='poolTopic')renderModal();
}catch(e){toast(e.message)}}
function poolQuestionModal(poolId,topicId,q){const type=q?.type||'multiple_choice';return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><div><h2>${q?'Edit Question':'Add Question'}</h2><div class="sub">Saved directly to this Question Pool topic.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="form-grid" style="margin-top:18px"><div class="field"><label>Question type</label><select id="pmType" onchange="togglePoolPassageFields()"><option value="multiple_choice" ${type==='multiple_choice'?'selected':''}>Multiple choice</option><option value="passage" ${type==='passage'?'selected':''}>Passage-based</option></select></div><div class="field"><label>Difficulty</label><select id="pmDifficulty"><option ${q?.difficulty==='Easy'?'selected':''}>Easy</option><option ${q?.difficulty==='Medium'||!q?'selected':''}>Medium</option><option ${q?.difficulty==='Hard'?'selected':''}>Hard</option></select></div><div class="field full"><label>Question *</label><textarea id="pmText" rows="4" placeholder="Enter the question." oninput="updatePoolManualPreview()">${esc(q?.text||'')}</textarea></div><div id="poolPassageFields" class="field full ${type==='passage'?'':'hidden'}"><label>Passage</label><input id="pmPassageTitle" value="${escAttr(q?.passage_title||'')}" placeholder="Passage title" oninput="updatePoolManualPreview()"><textarea id="pmPassage" rows="7" placeholder="Paste the passage here." oninput="updatePoolManualPreview()">${esc(q?.passage_content||'')}</textarea></div>${[0,1,2,3].map(i=>`<div class="field"><label>Option ${String.fromCharCode(65+i)}</label><input id="pmOpt${i}" value="${escAttr(q?.options?.[i]||'')}" placeholder="Option ${String.fromCharCode(65+i)}" oninput="updatePoolManualPreview()"></div>`).join('')}<div class="field"><label>Correct answer</label><select id="pmAnswer" onchange="updatePoolManualPreview()">${[0,1,2,3].map(i=>`<option value="${i}" ${Number(q?.answer)===i?'selected':''}>${String.fromCharCode(65+i)}</option>`).join('')}</select></div><div class="field"><label>Marks</label><input id="pmMarks" type="number" min="0.01" step="0.01" value="${q?.marks??1}"></div><div class="field full"><label>Question diagram/image</label><input id="pmImage" type="file" accept="image/*" onchange="previewPoolQuestionImage(this)"><input id="pmImageData" type="hidden" data-cleared="false" value="${escAttr(q?.image_data||'')}">${safeImageSrc(q?.image_data)?`<img class="question-image" id="pmImagePreview" src="${escAttr(safeImageSrc(q.image_data))}" alt="Question diagram"><button class="mini danger-mini" id="pmImageRemoveBtn" type="button" onclick="clearPoolQuestionImage()">Remove diagram</button>`:''}</div><div class="field full"><label>Explanation</label><textarea id="pmExplanation" rows="3" placeholder="Explain why the answer is correct." oninput="updatePoolManualPreview()">${esc(q?.explanation||'')}</textarea></div><div id="poolManualQuestionPreview" class="question-live-preview"></div></div><div class="toolbar end"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="savePoolManualQuestion('${q?.id||''}','${poolId}','${topicId}')">Save Question</button></div></div></div>`}
function togglePoolPassageFields(){const type=$('#pmType')?.value;const el=$('#poolPassageFields');if(el)el.classList.toggle('hidden',type!=='passage');updatePoolManualPreview();}
function updatePoolManualPreview(){const el=$('#poolManualQuestionPreview');if(!el)return;const text=$('#pmText')?.value||'';const opts=[0,1,2,3].map(i=>$(`#pmOpt${i}`)?.value||'');const answer=Number($('#pmAnswer')?.value);const explanation=$('#pmExplanation')?.value||'';el.innerHTML=`<div class="question-title">${questionStemHtml(text)||'<i>Question preview</i>'}</div><div class="option-list">${opts.map((o,j)=>`<div class="option ${j===answer?'correct':''}"><b>${String.fromCharCode(65+j)}.</b> ${mathHtml(o)}</div>`).join('')}</div>${explanation?`<div class="sub" style="margin-top:8px">${mathHtml(explanation)}</div>`:''}`;renderMath(el);}
async function previewPoolQuestionImage(input){const file=input.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{const compressed=await compressImageDataForUpload(String(reader.result));if(!compressed)return toast('This image could not be processed. Choose a smaller image.');const el=$('#pmImageData');if(el){el.value=compressed;el.dataset.cleared='false';}let p=$('#pmImagePreview');if(!p){input.insertAdjacentHTML('afterend',`<img class="question-image" id="pmImagePreview" alt="Question diagram preview">`);p=$('#pmImagePreview');}p.src=compressed;let removeBtn=$('#pmImageRemoveBtn');if(!removeBtn){p.insertAdjacentHTML('afterend','<button class="mini danger-mini" id="pmImageRemoveBtn" type="button" onclick="clearPoolQuestionImage()">Remove diagram</button>');}updatePoolManualPreview();};reader.readAsDataURL(file);}
function clearPoolQuestionImage(){const el=$('#pmImageData');if(el){el.value='';el.dataset.cleared='true';}const p=$('#pmImagePreview');if(p)p.remove();const removeBtn=$('#pmImageRemoveBtn');if(removeBtn)removeBtn.remove();const f=$('#pmImage');if(f)f.value='';updatePoolManualPreview();}
async function savePoolManualQuestion(id,poolId,topicId){try{const text=$('#pmText').value.trim();if(!text)return toast('Question text is required.');const opts=[0,1,2,3].map(i=>$(`#pmOpt${i}`).value.trim());if(opts.some(o=>!o))return toast('All four options are required.');const imageEl=$('#pmImageData');const imageField=imageEl?.value||'';const imageWasCleared=imageEl?.dataset.cleared==='true';if(imageField.length>1200000)return toast('This diagram is too large after compression. Remove it or choose a smaller image.');const existingQuestion=(state.poolTopicQuestions[topicId]||[]).find(x=>x.id===id)||null;const existingImage=existingQuestion?.image_data||null;const body={id:id||undefined,type:$('#pmType').value,text,subject:state.pools.find(p=>p.id===poolId)?.name||'General',topic:(state.pools.find(p=>p.id===poolId)?.topics||[]).find(t=>t.id===topicId)?.name||'General',difficulty:$('#pmDifficulty').value,options:opts,answer:Number($('#pmAnswer').value),explanation:$('#pmExplanation').value,marks:Number($('#pmMarks')?.value)||1,passageTitle:$('#pmPassageTitle')?.value||'',passageContent:$('#pmPassage')?.value||'',passageId:id?(existingQuestion?.passage_id||null):null,poolId,topicId};if(imageWasCleared)body.image_data=null;else if(imageField)body.image_data=imageField;else body.image_data=existingImage||null;
  const r=await api('question-save',{method:'POST',body});
  const q=r.question;
  const list=state.poolTopicQuestions[topicId]=state.poolTopicQuestions[topicId]||[];
  const idx=list.findIndex(x=>x.id===q.id);
  if(idx>=0)list[idx]=q;else{list.push(q);const pool=state.pools.find(p=>p.id===poolId);const topic=pool?.topics?.find(t=>t.id===topicId);if(topic)topic.questionCount=(topic.questionCount||0)+1;}
  state.modal=null;
  toast(id?'Question updated':'Question added to the topic');
  openPoolTopic(poolId,topicId);
}catch(e){toast(e.message)}}
async function publishQuiz(id){state.modal={type:'publish',quizId:id};renderModal();}
async function publishQuizNow(id){try{const libraryIds=$$('[data-publish-library]:checked').map(el=>el.dataset.publishLibrary);await api('quiz-publish',{method:'POST',body:{id,libraryIds}});state.modal=null;await refreshAdmin('CBT published');}catch(e){toast(e.message)}}
async function loadFeedback(silent=false){
  state.feedbackLoading=true;
  if(state.page==='feedback'&&!silent)render();
  try{
    const r=await api('feedback-list',{query:{limit:200}});
    state.feedback=Array.isArray(r.feedback)?r.feedback:[];
  }catch(e){
    if(!silent)toast(e.message||'Could not load student feedback.');
    state.feedback=state.feedback||[];
  }finally{
    state.feedbackLoading=false;
    if(state.page==='feedback')render();
  }
}
async function updateFeedbackStatus(id,status){
  try{
    await api('feedback-status',{method:'PUT',body:{id,status}});
    await loadFeedback(true);
    toast('Feedback status updated.');
  }catch(e){toast(e.message||'Could not update feedback status.');}
}
function feedback(){
  const rows=Array.isArray(state.feedback)?state.feedback:[];
  const counts={new:rows.filter(x=>x.status==='new').length,reviewed:rows.filter(x=>x.status==='reviewed').length,resolved:rows.filter(x=>x.status==='resolved').length};
  return shell(`<div class="section-head"><div><h1 class="page-title">Student Feedback</h1><div class="page-sub">Review complaints, technical issues and suggestions submitted after mock tests.</div></div><div class="toolbar"><button class="btn btn-ghost" onclick="loadFeedback()">↻ Refresh</button></div></div><div class="grid stats feedback-stats"><div class="stat"><div class="label">NEW</div><div class="value">${counts.new}</div><div class="delta">Needs attention</div></div><div class="stat"><div class="label">REVIEWED</div><div class="value">${counts.reviewed}</div><div class="delta">Under consideration</div></div><div class="stat"><div class="label">RESOLVED</div><div class="value">${counts.resolved}</div><div class="delta">Closed items</div></div><div class="stat"><div class="label">TOTAL</div><div class="value">${rows.length}</div><div class="delta">Student submissions</div></div></div><div class="card"><div class="section-head"><div><h2>Recent submissions</h2><div class="sub">Newest feedback appears first. Student contact details are shown only when submitted.</div></div></div>${state.feedbackLoading?`<div class="feedback-empty"><span class="feedback-spinner">⏳</span><b>Loading student feedback…</b></div>`:rows.length?`<div class="feedback-list">${rows.map(x=>`<article class="feedback-admin-item"><div class="feedback-admin-head"><div><div class="feedback-admin-title">${esc(x.category_label||x.category||'General feedback')}</div><div class="sub"><strong>${esc(x.student_name||'Student')}</strong> • ${esc(x.quiz_title||'Unknown CBT')} • ${esc(formatDateTime(x.created_at))}</div></div><span class="feedback-status status-${escAttr(x.status||'new')}">${esc((x.status||'new').replace(/^./,m=>m.toUpperCase()))}</span></div><div class="feedback-message">${esc(x.message||'')}</div>${x.contact?`<div class="feedback-contact">Contact: ${esc(x.contact)}</div>`:''}<div class="feedback-admin-actions"><span class="sub">Update status</span><select aria-label="Feedback status" onchange="updateFeedbackStatus('${escAttr(String(x.id))}',this.value)"><option value="new" ${(x.status||'new')==='new'?'selected':''}>New</option><option value="reviewed" ${x.status==='reviewed'?'selected':''}>Reviewed</option><option value="resolved" ${x.status==='resolved'?'selected':''}>Resolved</option></select></div></article>`).join('')}</div>`:`<div class="feedback-empty"><div class="feedback-empty-icon">💬</div><h3>No student feedback yet</h3><p>Completed mock tests will surface student complaints and suggestions here.</p></div>`}</div>`);
}
function analytics(){
  const attempts=state.attempts.filter(a=>a.status==='submitted'||!a.status),total=attempts.length,avg=total?Math.round(attempts.reduce((s,a)=>s+Number(a.percent||0),0)/total):0;
  const passCount=attempts.filter(a=>Number(a.percent)>=Number(a.pass_mark||50)).length,pass=total?Math.round(passCount*100/total):0;
  const unique=new Set(attempts.map(a=>a.device_id||a.student_name)).size;
  const bins=[0,20,40,60,80].map(low=>({low,high:low+20,count:attempts.filter(a=>Number(a.percent)>=low&&Number(a.percent)<low+20||(low===80&&Number(a.percent)===100)).length}));
  const quizRows=state.quizzes.map(q=>{const x=attempts.filter(a=>a.quiz_id===q.id),n=x.length,mean=n?Math.round(x.reduce((s,r)=>s+Number(r.percent||0),0)/n):0;return {q,count:n,mean,passRate:n?Math.round(x.filter(a=>Number(a.percent)>=Number(q.pass_mark||50)).length/n*100):0};});
  const ranked=[...quizRows].sort((a,b)=>b.count-a.count),largest=Math.max(1,...bins.map(b=>b.count));
  return shell(`<div class="section-head"><div><h1 class="page-title">Performance Analytics</h1><div class="page-sub">Participation, achievement, score distribution and individual question insights.</div></div></div><div class="grid stats gb-analytics-stats"><div class="stat"><div class="label">SUBMITTED ATTEMPTS</div><div class="value">${total}</div></div><div class="stat"><div class="label">UNIQUE LEARNERS</div><div class="value">${unique}</div></div><div class="stat"><div class="label">AVERAGE SCORE</div><div class="value">${avg}%</div></div><div class="stat"><div class="label">PASS RATE</div><div class="value">${pass}%</div></div></div>
    <div class="grid two gb-analytics-grid"><section class="card"><h2>Score distribution</h2><p class="sub">Share of submitted attempts in each score band.</p><div class="gb-score-histogram">${bins.map(b=>`<div class="gb-histogram-row"><span>${b.low}–${b.high===100?100:b.high-1}%</span><div><i style="width:${Math.max(b.count?5:0,b.count/largest*100)}%"></i></div><strong>${b.count}</strong></div>`).join('')}</div></section><section class="card"><h2>Most attempted CBTs</h2><p class="sub">Number of completed attempts by test.</p>${ranked.slice(0,8).map(x=>`<div class="gb-analytics-quiz"><span>${esc(x.q.title)}</span><strong>${x.count} attempt${x.count===1?'':'s'}</strong></div>`).join('')||'<div class="empty">No CBTs yet.</div>'}</section></div>
    <section class="card gb-analytics-detail"><div class="section-head"><div><h2>CBT performance breakdown</h2><p class="sub">Inspect per-test participation and the questions students find most difficult.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>CBT</th><th>Attempts</th><th>Average</th><th>Pass rate</th><th>Question analytics</th></tr></thead><tbody>${quizRows.map(x=>`<tr><td>${esc(x.q.title)}</td><td>${x.count}</td><td>${x.mean}%</td><td>${x.passRate}%</td><td><button class="mini" onclick="showQuizAnalytics('${x.q.id}')">Inspect questions</button></td></tr>`).join('')||'<tr><td colspan="5">No CBTs yet.</td></tr>'}</tbody></table></div>${state.analyticsDetail?quizAnalyticsPanel():''}</section>`);
}
function quizAnalyticsPanel(){const r=state.analyticsDetail;if(r.loading)return '<div class="notice">Loading question analytics…</div>';if(r.error)return `<div class="notice">${esc(r.error)}</div>`;return `<section class="gb-question-analysis"><div class="section-head"><h3>${esc(r.title||'CBT')} — Question performance</h3><button class="mini" onclick="state.analyticsDetail=null;render()">Close</button></div><p class="sub">${r.attempts} completed attempts sampled · questions ranked by lowest accuracy first</p><div class="table-wrap"><table class="table"><thead><tr><th>Question</th><th>Topic</th><th>Answered</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>${(r.questions||[]).map(x=>`<tr><td>${esc(String(x.text||'').slice(0,170))}</td><td>${esc(x.topic||'General')}</td><td>${x.answered}</td><td>${x.correct}</td><td><strong>${x.accuracy}%</strong></td></tr>`).join('')||'<tr><td colspan="5">No submitted answers available.</td></tr>'}</tbody></table></div></section>`;}
async function showQuizAnalytics(id){const q=state.quizzes.find(x=>x.id===id);state.analyticsDetail={loading:true,title:q?.title||'CBT'};state.page='analytics';render();try{const r=await api('analytics-questions',{query:{quizId:id}});state.analyticsDetail={...r,title:q?.title||'CBT'};}catch(e){state.analyticsDetail={error:e.message||'Analytics could not load.'};}render();}
function settings(){return shell(`<div class="section-head"><div><h1 class="page-title">Platform Settings</h1><div class="page-sub">Manage administrator contact details and personalise the workspace.</div></div></div><section class="card eduspace-settings"><h2>🔗 EduSpace integration</h2><p class="sub">Link the Assessment Hub to the official EduSpace location. The connection indicator stays visible after saving.</p><div class="field"><label for="eduSpaceLink">EduSpace HTTPS link</label><input id="eduSpaceLink" type="url" value="${escAttr(state.eduSpaceLink||'')}" placeholder="https://your-eduspace-site.example"></div><div class="toolbar" style="margin-top:12px"><button class="btn btn-primary" onclick="saveEduSpaceLink()">Save EduSpace link</button>${state.eduSpaceLink?`<a class="btn btn-ghost" target="_blank" rel="noopener noreferrer" href="${escAttr(state.eduSpaceLink)}">Open EduSpace</a>`:''}</div><div class="eduspace-connection ${state.eduSpaceLink?'linked':'unlinked'}" role="status">${state.eduSpaceLink?'EduSpace website configured. Students must link their own accounts with one-time codes.':'EduSpace website has not been configured'}</div></section><div class="grid two"><div class="card"><h2>Administrator contact</h2><p class="sub">This number powers the WhatsApp contact button shown on Private quizzes, CBT Libraries and Question Pools. It is stored in the database, not embedded in the student pages.</p><div class="field" style="margin-top:16px"><label for="adminWhatsAppNumber">WhatsApp number (international format)</label><input id="adminWhatsAppNumber" inputmode="tel" autocomplete="tel" value="${escAttr(state.adminWhatsAppNumber||'')}" placeholder="2348156767275"><small class="sub">Use country code and digits only, e.g. 2348156767275. A Nigerian local number beginning with 0 is also accepted.</small></div><div class="toolbar end"><button class="btn btn-primary" onclick="savePlatformSettings()">Save contact number</button></div></div><div class="card settings-theme-card"><div><h2>Workspace appearance</h2><p class="sub">A consistent, accessible light interface is enabled for every student and administrator.</p></div><hr><h2>Gifted Brainz branding</h2><div class="sub">The platform identity uses the Gifted Brainz logo. AI keys and Supabase secrets stay on EdgeOne server environment variables, never in the browser interface.</div></div></div>`)}
async function saveEduSpaceLink(){const value=$('#eduSpaceLink')?.value.trim()||'';try{const r=await api('eduspace-link',{method:'PUT',body:{url:value}});state.eduSpaceLink=r.url||'';toast(state.eduSpaceLink?'EduSpace website saved. Students can now use their link codes after server configuration.':'EduSpace website link cleared.');render();}catch(e){toast(e.message||'Could not save the EduSpace link.')}}
async function savePlatformSettings(){const input=$('#adminWhatsAppNumber');if(!input)return;const value=String(input.value||'').trim();if(!value)return toast('Enter the administrator WhatsApp number.');try{const r=await api('platform-settings',{method:'PUT',body:{administratorWhatsAppNumber:value}});state.adminWhatsAppNumber=r.settings?.administratorWhatsAppNumber||'';input.value=state.adminWhatsAppNumber;toast('Administrator contact number saved.');}catch(e){toast(e.message||'Could not save the administrator contact number.')}}
function newQuiz(){state.quizActivationCode=null;state.modal={type:'quiz',quiz:null};renderModal();}
function editQuiz(id){state.quizActivationCode=null;state.modal={type:'quiz',quiz:state.quizzes.find(q=>q.id===id)};renderModal();const q=state.modal.quiz;if(q?.access_mode==='private')loadQuizDevices(id);}
function newQuestion(){state.modal={type:'question',question:null};renderModal();}
function newQuestionForQuiz(quizId){state.modal={type:'question',question:{quiz_id:quizId,marks:1}};renderModal();setTimeout(()=>loadSectionOptions('mQuiz','mSection'),0);}
function findQuestionForEdit(id){return state.questions.find(q=>q.id===id)||state.quizzes.flatMap(q=>q.questions||[]).find(q=>q.id===id)||null;}
async function editQuestion(id){const local=findQuestionForEdit(id);if(local&&Object.prototype.hasOwnProperty.call(local,'image_data')){state.modal={type:'question',question:local};renderModal();return}try{const r=await api('question-get',{query:{id}});state.modal={type:'question',question:r.question||local};renderModal();}catch(e){toast(e.message)}}
function renderModal(){if(!state.modal){$('#modalRoot').innerHTML='';return}const m=state.modal;if(m.type==='quiz'){$('#modalRoot').innerHTML=quizModal(m.quiz);return}if(m.type==='question'){$('#modalRoot').innerHTML=questionModal(m.question);if($('#mQuiz')?.value)setTimeout(()=>loadSectionOptions('mQuiz','mSection'),0);setTimeout(updateManualPreview,0);return}if(m.type==='add-question'){$('#modalRoot').innerHTML=addQuestionModal(m.questionId);return}if(m.type==='leaderboard'){$('#modalRoot').innerHTML=leaderboardModal(m.quizId);return}if(m.type==='library'){$('#modalRoot').innerHTML=libraryModal(m.library);return}if(m.type==='publish'){$('#modalRoot').innerHTML=publishModal(m.quizId);return}if(m.type==='builder'){$('#modalRoot').innerHTML=builderModal(m.quizId);return}if(m.type==='save-draft'){$('#modalRoot').innerHTML=saveDraftModal();return}if(m.type==='pool'){$('#modalRoot').innerHTML=poolModal(m.pool);return}if(m.type==='poolTopic'){$('#modalRoot').innerHTML=poolTopicModal(m.poolId,m.topicId);if(state.poolTopicQuestions[m.topicId]===undefined)loadPoolTopicQuestions(m.topicId);return}if(m.type==='poolQuestion'){$('#modalRoot').innerHTML=poolQuestionModal(m.poolId,m.topicId,m.question);setTimeout(updatePoolManualPreview,0);return}}
function builderModal(id){const q=state.quizzes.find(x=>x.id===id);if(!q)return '';const qs=(q.questions||[]);const sel=state.builderSelectedIds;const all=qs.length>0&&qs.every(x=>sel.has(String(x.id)));const moveSecs=(q.sections||[]);return `<div class="modal-backdrop"><div class="modal modal-wide"><div class="modal-head"><div><h2>🧩 Build ${esc(q.title)}</h2><div class="sub">Add questions now. You can build this CBT manually, with Groq AI, or import from a document.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="builder-grid"><button class="builder-card" onclick="closeModal();newQuestionForQuiz('${id}')"><b>✍️ Add manually</b><span>Create and edit a question yourself.</span></button><button class="builder-card" onclick="closeModal();openAiForQuiz('${id}')"><b>🤖 Generate with AI</b><span>Generate questions with Groq and save them directly to this CBT.</span></button><button class="builder-card" onclick="closeModal();openAiForQuiz('${id}');setTimeout(()=>document.getElementById('docFile')?.click(),100)"><b>📄 Import PDF / document</b><span>Extract questions for review; images are preserved.</span></button></div><div class="subsection builder-question-list"><div class="section-head"><div><h3>Questions</h3><div class="sub">${qs.length} question${qs.length===1?'':'s'} across ${moveSecs.length} section${moveSecs.length===1?'':'s'}.</div></div><button class="mini" onclick="closeModal();state.modal={type:'quiz',quiz:state.quizzes.find(x=>x.id==='${id}')};renderModal()">Manage sections</button></div><div class="bulk-toolbar"><label class="check"><input type="checkbox" data-builder-select-all ${all?'checked':''} onchange="toggleAllBuilder(this.checked)"> Select all</label><span class="sub" data-builder-selection-count>${sel.size} selected</span><button class="mini danger-mini" data-builder-bulk-delete onclick="bulkDeleteBuilderQuestions()" ${sel.size?'':'disabled'}>🗑️ Delete selected</button><select id="builderMoveSection" data-builder-move-section ${sel.size?'':'disabled'}><option value="">Move to section…</option>${moveSecs.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select><button class="mini" onclick="moveBuilderQuestions()" ${sel.size?'':'disabled'}>Move selected</button></div>${qs.map((x,i)=>`<div class="quiz-row"><div style="display:flex;gap:10px;align-items:center"><input type="checkbox" data-builder-q-select ${sel.has(String(x.id))?'checked':''} onchange="toggleBuilderSelection('${x.id}')"><div><b>${i+1}. ${questionStemHtml(x.text)}</b><div class="sub">${esc(x.type||'multiple_choice')} • ${Number(x.marks||1)} mark${Number(x.marks||1)==1?'':'s'} • ${esc(moveSecs.find(s=>s.id===x.section_id)?.title||'Section unavailable')}</div></div></div><button class="mini" onclick="editQuestion('${x.id}')">✏️ Edit</button><button class="mini danger-mini" onclick="deleteQuizQuestion('${x.id}')">🗑️ Delete</button></div>`).join('')||'<div class="empty">No questions yet.</div>'}</div><div class="toolbar end"><button class="btn btn-primary" onclick="closeModal()">Done</button></div></div></div>`}
function quizModal(q){const s=q?.settings||{};const fields=q?.student_fields||[{key:'full_name',label:'Full Name',type:'text',required:true,leaderboard:true}];const sections=q?.sections||[];const rawMaxAttempts=s.maxAttempts;const unlimitedAttempts=rawMaxAttempts===null||rawMaxAttempts===0||String(rawMaxAttempts).toLowerCase()==='unlimited';const maxAttemptsValue=unlimitedAttempts?1:Math.max(1,Number(rawMaxAttempts)||1);return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal modal-wide"><div class="modal-head"><div><h2>${q?'✏️ Edit Quiz':'➕ Create CBT'}</h2><div class="sub">The CBT identity is separate from subjects/topics.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="form-grid" style="margin-top:18px"><div class="field full"><label>Quiz title *</label><input id="qTitle" value="${escAttr(q?.title||'')}" placeholder="e.g. UTME 2027 Full Mock Examination"></div><div class="field full"><label>Description</label><textarea id="qDescription" rows="3" placeholder="Tell students what this CBT covers.">${esc(q?.description||'')}</textarea></div><div class="field full"><label>Quiz access</label><select id="qAccessMode"><option value="public" ${(q?.access_mode||'public')==='public'?'selected':''}>Public — anyone with the link can start</option><option value="private" ${q?.access_mode==='private'?'selected':''}>Private — requires an activation code</option></select><small class="sub">Private quizzes are approved one device at a time. This applies to the individual quiz, even when it is not in a CBT Library.</small></div><div class="field full"><label>Instructions</label><textarea id="qInstructions" rows="4" placeholder="Instructions shown immediately before the test starts.">${esc(q?.instructions||'')}</textarea></div><div class="field full"><label for="qAssessmentMode">Assessment mode</label><select id="qAssessmentMode"><option value="practice" ${(s.assessmentMode||'practice')!=='study'?'selected':''}>Practice Mode — timed, answers after submission</option><option value="study" ${s.assessmentMode==='study'?'selected':''}>Study Mode — no timer, immediate explanations</option></select><small class="sub">Study Mode has no countdown. Correct answers and explanations appear after each selection.</small></div><div class="field"><label>Duration (minutes — Practice Mode)</label><input id="qDuration" type="number" min="1" value="${q?.duration||60}"></div><div class="field"><label>Pass mark (%)</label><input id="qPass" type="number" min="0" max="100" value="${q?.pass_mark??50}"></div></div><div class="settings-panel hub-cbt-schedule-editor"><h3>🗓️ Assessment availability</h3><p class="sub">Optionally schedule when students may begin the CBT. Before opening, the shared link shows a live countdown. After closing, new attempts are blocked. Leave both fields blank for an assessment that is always open. Times are in West Africa Time (WAT, UTC+1).</p><div class="form-grid"><div class="field"><label for="qStartAt">Opening date &amp; time (WAT)</label><input id="qStartAt" type="datetime-local" value="${cbtWatInput(s.startAt)}"></div><div class="field"><label for="qEndAt">Closing date &amp; time (WAT)</label><input id="qEndAt" type="datetime-local" value="${cbtWatInput(s.endAt)}"></div></div></div><div class="settings-panel"><h3>CBT settings</h3><div class="form-grid" style="margin:0 0 12px"><div class="field"><label>Total marks (optional)</label><input id="qTotalMarks" type="number" min="0.01" step="0.01" value="${s.totalMarks||''}" oninput="updateMarksPreview()" placeholder="Optional"><label class="check" style="margin-top:8px"><input id="setEqualMarks" type="checkbox" ${s.equalMarks?'checked':''} onchange="updateMarksPreview()"> Distribute total marks equally</label></div><div class="field"><label>Maximum attempts</label><input id="qMaxAttempts" type="number" min="1" max="10000" step="1" value="${maxAttemptsValue}" ${unlimitedAttempts?'disabled':''}><label class="check" style="margin-top:8px"><input id="setUnlimitedAttempts" type="checkbox" ${unlimitedAttempts?'checked':''} onchange="toggleUnlimitedAttempts()"> Unlimited attempts</label><div class="sub" style="margin-top:6px">Leave unlimited on for as many attempts as the student wants on this device.</div></div></div><div class="settings-grid"><label class="check"><input id="setResult" type="checkbox" ${s.resultEnabled!==false?'checked':''}> Enable student result</label><label class="check"><input id="setLeaderboard" type="checkbox" ${s.leaderboardEnabled!==false?'checked':''}> Enable student leaderboard</label><label class="check"><input id="setShuffleQ" type="checkbox" ${s.shuffleQuestions?'checked':''}> Shuffle questions</label><label class="check"><input id="setShuffleO" type="checkbox" ${s.shuffleOptions?'checked':''}> Shuffle options</label><label class="check"><input id="setReview" type="checkbox" ${s.reviewEnabled!==false?'checked':''}> Enable corrections/review</label></div><div id="marksDistributionPreview" class="sub">Equal distribution is off. Each question uses its own mark value.</div></div><div class="subsection"><div class="section-head"><div><h3>Student information form</h3><div class="sub">Collect extra details without exposing them on the leaderboard.</div></div><button class="mini" onclick="addFieldRow()">＋ Add field</button></div><div id="fieldRows">${fields.map((f,i)=>fieldRow(f,i)).join('')}</div></div><div class="subsection"><div class="section-head"><div><h3>Sections <span class="required">*</span></h3><div class="sub">Example: Mathematics, English Language, Physics, Chemistry.</div></div><button class="mini" onclick="addSectionRow()">＋ Add section</button></div><div id="sectionRows">${sections.map((x,i)=>sectionRow(x,i)).join('')||`<div class="notice">You have not completed this. Please add at least one section before continuing.</div>`}</div><div id="sectionMarksTotal" class="sub" style="margin-top:10px;font-weight:800"></div></div>${q?quizDeviceApprovalSection(q):''}${q?`<div class="toolbar"><button class="btn btn-light" onclick="state.modal={type:'builder',quizId:'${q.id}'};renderModal()">🧩 Question Builder</button></div>`:''}<div class="toolbar end"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveQuizForm('${q?.id||''}')">${q?'Save changes':'Create CBT'}</button></div></div></div>`}
function fieldRow(f,i){return `<div class="field-row" data-field-row><input data-f-label value="${escAttr(f.label)}" placeholder="Field label"><select data-f-type><option value="text" ${f.type==='text'?'selected':''}>Text</option><option value="tel" ${f.type==='tel'?'selected':''}>Phone</option><option value="email" ${f.type==='email'?'selected':''}>Email</option><option value="number" ${f.type==='number'?'selected':''}>Number</option></select><label class="tiny-check"><input data-f-required type="checkbox" ${f.required?'checked':''}> Required</label><label class="tiny-check"><input data-f-leaderboard type="checkbox" ${f.leaderboard?'checked':''} ${f.key==='full_name'?'checked':''}> Leaderboard</label><button class="mini danger-mini" onclick="this.closest('[data-field-row]').remove()">×</button></div>`}
function sectionRow(x,i){return `<div class="section-row" data-section-row data-id="${x.id||''}"><input data-s-title value="${escAttr(x.title||'')}" placeholder="Section title"><input data-s-desc value="${escAttr(x.description||'')}" placeholder="Description"><input data-s-marks type="number" min="0" step="1" value="${x.marks==null?'':x.marks}" placeholder="Marks (e.g. 100)" oninput="updateSectionMarksTotal()"><button class="mini danger-mini" onclick="this.closest('[data-section-row]').remove()">×</button></div>`}
function updateManualPreview(){
  const box=$('#manualQuestionPreview'); if(!box)return;
  const text=$('#mText')?.value?.trim()||'Question preview';
  const type=$('#mType')?.value||'multiple_choice';
  const passage=$('#mPassage')?.value?.trim()||'';
  const title=$('#mPassageTitle')?.value?.trim()||'Passage';
  const opts=[0,1,2,3].map(i=>$(`#mOpt${i}`)?.value?.trim()||`Option ${String.fromCharCode(65+i)}`);
  const answer=Number($('#mAnswer')?.value);
  const explanation=$('#mExplanation')?.value?.trim()||'';
  const image=safeImageSrc($('#mImageData')?.value);
  box.innerHTML=`<div class="preview-label">LIVE STUDENT PREVIEW</div>${type==='passage'&&passage?`<div class="passage-preview"><b>📖 ${mathHtml(title)}</b><div>${passageParagraphsHtml(passage)}</div></div>`:''}<div class="question-title">${questionStemHtml(text)}</div>${image?`<img class="question-image" src="${escAttr(image)}" alt="Question diagram preview">`:''}<div class="option-list">${opts.map((o,j)=>`<div class="option ${j===answer?'correct':''}"><b>${String.fromCharCode(65+j)}.</b> ${mathHtml(o)}</div>`).join('')}</div>${explanation?`<div class="preview-explanation"><b>Explanation:</b> ${mathHtml(explanation)}</div>`:''}`;
  renderMath(box);
}
function updateMarksPreview(){
  const box=$('#marksDistributionPreview'); if(!box)return;
  const total=Number($('#qTotalMarks')?.value); const equal=$('#setEqualMarks')?.checked;
  const quiz=state.modal?.quiz; const count=quiz?.questions?.length||0;
  if(equal&&Number.isFinite(total)&&total>0&&count){
    const each=total/count; box.textContent=`${total} ÷ ${count} questions = ${each.toFixed(2).replace(/\.00$/,'')} mark${Math.abs(each-1)<1e-9?'':'s'} per question.`;
  }else if(equal){box.textContent='Add questions to this CBT to preview the equal mark distribution.';}
  else box.textContent='Equal distribution is off. Each question uses its own mark value.';
}
function questionModal(q){const type=q?.type||'multiple_choice';return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><div><h2>${q?'Edit Question':'Add Question Manually'}</h2><div class="sub">Build a reusable item for the Gifted Brainz question bank.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="form-grid" style="margin-top:18px"><div class="field"><label>Question type</label><select id="mType" onchange="togglePassageFields()"><option value="multiple_choice" ${type==='multiple_choice'?'selected':''}>Multiple choice</option><option value="passage" ${type==='passage'?'selected':''}>Passage-based</option></select></div><div class="field"><label>Subject</label><input id="mSubject" value="${escAttr(q?.subject||'')}" placeholder="e.g. English Language"></div><div class="field"><label>Topic</label><input id="mTopic" value="${escAttr(q?.topic||'')}" placeholder="e.g. Comprehension"></div><div class="field"><label>Difficulty</label><select id="mDifficulty"><option ${q?.difficulty==='Easy'?'selected':''}>Easy</option><option ${q?.difficulty==='Medium'||!q?'selected':''}>Medium</option><option ${q?.difficulty==='Hard'?'selected':''}>Hard</option></select></div><div class="field"><label>Save directly to CBT (optional)</label><select id="mQuiz" onchange="loadSectionOptions('mQuiz','mSection')"><option value="">Question Bank only</option>${state.quizzes.map(x=>`<option value="${x.id}" ${q?.quiz_id===x.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></div><div class="field"><label>Section</label><select id="mSection"><option value="${q?.section_id||''}">${esc(q?.section_id?(state.quizzes.find(x=>x.id===q.quiz_id)?.sections?.find(z=>z.id===q.section_id)?.title||'Selected section'):'Select a section')}</option></select></div><div class="field full"><label>Question *</label><textarea id="mText" rows="4" placeholder="Enter the question." oninput="updateManualPreview()">${esc(q?.text||'')}</textarea></div><div id="passageFields" class="field full ${type==='passage'?'':'hidden'}"><label>Passage</label><input id="mPassageTitle" value="${escAttr(q?.passage_title||'')}" placeholder="Passage title" oninput="updateManualPreview()"><textarea id="mPassage" rows="7" placeholder="Paste the passage here." oninput="updateManualPreview()">${esc(q?.passage_content||'')}</textarea></div>${[0,1,2,3].map(i=>`<div class="field"><label>Option ${String.fromCharCode(65+i)}</label><input id="mOpt${i}" value="${escAttr(q?.options?.[i]||'')}" placeholder="Option ${String.fromCharCode(65+i)}" oninput="updateManualPreview()"></div>`).join('')}<div class="field"><label>Correct answer</label><select id="mAnswer" onchange="updateManualPreview()">${[0,1,2,3].map(i=>`<option value="${i}" ${Number(q?.answer)===i?'selected':''}>${String.fromCharCode(65+i)}</option>`).join('')}</select></div><div class="field"><label>Marks</label><input id="mMarks" type="number" min="0.01" step="0.01" value="${q?.marks??1}"></div><div class="field full"><label>Question diagram/image</label><input id="mImage" type="file" accept="image/*" onchange="previewQuestionImage(this)"><input id="mImageData" type="hidden" data-cleared="false" value="${escAttr(q?.image_data||'')}">${safeImageSrc(q?.image_data)?`<img class="question-image" id="mImagePreview" src="${escAttr(safeImageSrc(q.image_data))}" alt="Question diagram"><button class="mini danger-mini" type="button" onclick="clearQuestionImage()">Remove diagram</button>`:''}${q?.image_omitted?`<div class="notice" style="margin-top:10px">An existing diagram is stored but is too large to load into the editor. It will be preserved unless you replace or remove it.</div>`:''}</div><div class="field full"><label>Explanation</label><textarea id="mExplanation" rows="3" placeholder="Explain why the answer is correct." oninput="updateManualPreview()">${esc(q?.explanation||'')}</textarea></div><div id="manualQuestionPreview" class="question-live-preview"></div></div><div class="toolbar end"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveManualQuestion('${q?.id||''}')">Save Question</button></div></div></div>`}
function addQuestionModal(qid){return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><div><h2>Add to CBT</h2><div class="sub">Choose the destination CBT and section.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="form-grid" style="margin-top:18px"><div class="field full"><label>CBT</label><select id="addQuiz">${state.quizzes.map(q=>`<option value="${q.id}" ${state.builderQuizId===q.id?'selected':''}>${esc(q.title)}</option>`).join('')}</select></div><div class="field full"><label>Section</label><select id="addSection"><option value="">Select a section</option></select></div></div><div class="toolbar end"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveAddQuestion('${qid}')">Add question</button></div></div></div>`}
function quizCurrentTotal(q){const s=q?.settings||{};if(s.equalMarks&&Number(s.totalMarks)>0)return Number(s.totalMarks);const secs=q?.sections||[];if(secs.some(x=>x.marks!==null&&x.marks!==undefined&&x.marks!=='')){const by=new Map((q?.questions||[]).map(x=>[String(x.section_id),x]));return secs.reduce((sum,sec)=>{if(sec.marks!==null&&sec.marks!==undefined&&sec.marks!=='')return sum+Math.max(0,Number(sec.marks)||0);return sum+(q?.questions||[]).filter(x=>String(x.section_id)===String(sec.id)).reduce((a,x)=>a+Math.max(0.01,Number(x.marks)||1),0)},0);}return (q?.questions||[]).reduce((sum,x)=>sum+Math.max(0.01,Number(x.marks)||1),0);}
function quizScoreDisplay(q,row){const storedTotal=Number(row?.total);const storedScore=Number(row?.score);if(Number.isFinite(storedTotal)&&storedTotal>0&&Number.isFinite(storedScore))return {score:Math.max(0,storedScore),total:storedTotal};const fallbackTotal=quizCurrentTotal(q)||0;return {score:0,total:fallbackTotal};}
function currentLibraryQuizIds(id){const lib=state.libraries.find(x=>x.id===id);return new Set((lib?.items||[]).map(x=>String(x.quiz_id)));}
function libraryPublicLink(slug){return `${location.origin}${location.pathname}?library=${encodeURIComponent(slug)}`;}
function studentMetadataHtml(row){const entries=Object.entries(row?.studentData||row?.student_data||{}).filter(([k,v])=>k!=='full_name'&&String(v||'').trim());return entries.length?`<details class="student-metadata"><summary>Additional details (${entries.length})</summary>${entries.map(([k,v])=>`<div><b>${esc(k.replaceAll('_',' '))}:</b> ${esc(String(v))}</div>`).join('')}</details>`:'';}
function leaderboardName(row){return String(row?.name??row?.student_name??row?.studentData?.full_name??'Student').trim()||'Student';}
function leaderboardRowsForQuiz(id){const q=state.quizzes.find(x=>x.id===id);const source=state.leaderboards?.[id]||state.attempts.filter(a=>a.quiz_id===id&&a.status==='submitted');const first=new Map();source.forEach(row=>{const key=String(row.device_id||row.student_key||row.id);const cur=first.get(key);const rowNo=Number(row?.attempt_no||0),curNo=Number(cur?.attempt_no||0);const rowDate=Date.parse(row?.submitted_at||'')||0,curDate=Date.parse(cur?.submitted_at||'')||0;if(!cur||(rowNo>0&&(!curNo||rowNo<curNo))||((!rowNo||!curNo||rowNo===curNo)&&rowDate>0&&(!curDate||rowDate<curDate)))first.set(key,row);});return [...first.values()].map(row=>({...row,name:leaderboardName(row),...quizScoreDisplay(q,row)})).slice().sort((a,b)=>Number(b.percent)-Number(a.percent)||Number(a.time_used??a.timeUsed??1e9)-Number(b.time_used??b.timeUsed??1e9)||String(a.id||'').localeCompare(String(b.id||'')));}
async function refreshLeaderboard(quizId,rerender=true){
  const q=state.quizzes.find(x=>x.id===quizId);
  if(!q)throw new Error('CBT not found.');
  const r=await api('admin-leaderboard',{query:{id:quizId,limit:5000}});
  state.leaderboards=state.leaderboards||{};
  state.leaderboards[quizId]=(Array.isArray(r.leaderboard)?r.leaderboard:[]).map(row=>({...row,name:leaderboardName(row)}));
  if(rerender&&state.modal?.type==='leaderboard'&&state.modal.quizId===quizId)renderModal();
  return state.leaderboards[quizId];
}
function leaderboardListHtml(rows,{admin=false,quizId='',emptyText='No submitted results yet.'}={}){
  if(!rows.length)return `<div class="leaderboard-empty-new">${esc(emptyText)}</div>`;
  const top=rows.slice(0,3);
  const podiumOrder=[top[1],top[0],top[2]].filter(Boolean);
  const podium=`<div class="gb-podium" role="list" aria-label="Top three performers">${podiumOrder.map(a=>{
    const rank=rows.indexOf(a)+1,kind=rank===1?'first':rank===2?'second':'third';
    return `<article class="gb-podium-spot ${kind}" role="listitem"><div class="gb-medal">${rank===1?'👑':rank===2?'🥈':'🥉'}</div><div class="gb-podium-person"><strong>${esc(leaderboardName(a))}</strong><span>${scoreOverTotalLabel(a.score,a.total)} · ${percentLabel(a.percent)}</span>${admin?studentMetadataHtml(a):''}</div><div class="gb-podium-block"><span>${rank}</span><small>${rank===1?'CHAMPION':rank===2?'RUNNER UP':'THIRD'}</small></div></article>`;
  }).join('')}</div>`;
  const remaining=rows.slice(3);
  return `<section class="gb-leaderboard-compact"><div class="gb-podium-heading"><div><span class="eyebrow">HALL OF EXCELLENCE</span><h3>Top performers</h3></div><span class="gb-entrant-counter">${rows.length} participant${rows.length===1?'':'s'}</span></div>${podium}<div class="gb-rank-heading"><h3>Full rankings</h3><small>First attempts only • ranked by score</small></div><div class="gb-rank-list">${remaining.map((x,i)=>{
    const rank=i+4,name=leaderboardName(x),action=admin?`<button class="mini danger-mini leaderboard-remove-btn" onclick="${escAttr(`deleteLeaderboardStudent(${JSON.stringify(String(x.id))},${JSON.stringify(name)},${JSON.stringify(String(quizId))})`)}">Remove</button>`:'';
    return `<article class="gb-rank-row" ${i>=7?'hidden':''} data-more-rank><span class="gb-rank-number">${rank}</span><strong>${esc(name)}</strong><span class="gb-rank-score">${scoreOverTotalLabel(x.score,x.total)}</span><b class="gb-rank-percent">${percentLabel(x.percent)}</b>${admin?studentMetadataHtml(x):''}${action}</article>`;
  }).join('')||'<div class="gb-rank-empty">Every participant is on the podium!</div>'}</div>${remaining.length>7?`<button class="btn btn-ghost gb-rank-more" onclick="showMoreLeaderboard(this)">View more rankings</button>`:''}</section>`;
}
function showMoreLeaderboard(button){const root=button.closest('.gb-leaderboard-compact');const more=[...root.querySelectorAll('[data-more-rank][hidden]')];more.slice(0,10).forEach(n=>n.hidden=false);if(more.length<=10)button.remove();}
function leaderboardModal(id){
  const q=state.quizzes.find(x=>x.id===id);
  const rows=leaderboardRowsForQuiz(id);
  return `<div class="modal-backdrop leaderboard-page-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal modal-wide leaderboard-modal official-leaderboard">
    <div class="official-leaderboard-header">${officialLogoHtml()}<div class="official-kicker">OFFICIAL RESULTS</div><h2>${esc(q?.title||'Assessment')}</h2><div class="official-heading">LEADERBOARD</div><p class="official-leaderboard-caption">Verified assessment rankings · Highest scores first</p><div class="official-subheading">ALL PARTICIPANTS • ${rows.length}</div></div>
    <div class="leaderboard-admin-toolbar"><div class="leaderboard-admin-copy"><b>Administrator controls</b><span>Refresh, release results, clear the board or export a poster.</span></div><div class="toolbar leaderboard-head-actions"><button class="btn btn-ghost" onclick="refreshLeaderboard('${id}')">↻ Refresh</button><button class="btn btn-ghost" onclick="releaseResultLink('${id}')">🔗 ${q?.result_released?'Copy Result Link':'Release Result Link'}</button><button class="btn btn-ghost" onclick="clearLeaderboard('${id}')">Clear leaderboard</button><button class="close official-close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div></div>
    <div class="leaderboard-export-bar"><div><b>Export official leaderboard</b><span>Choose how many top performers to include in the exported image.</span></div><div class="leaderboard-export-controls"><label>Top <select id="lbExportCount-${id}">${[5,10,15,20,25,50,100].filter(n=>n<=Math.max(100,rows.length||100)).map(n=>`<option value="${n}" ${n===10?'selected':''}>${n}</option>`).join('')}</select></label><button class="btn btn-primary" onclick="exportLeaderboardImage('${id}')" ${rows.length?'':'disabled'}>🖼 Export as Image</button></div></div>
    ${leaderboardListHtml(rows,{admin:true,quizId:id})}
  </div></div>`;
}
function scrollLeaderboard(id,direction=1){const el=document.getElementById(`lbScroll-${id}`);if(!el)return;const amount=Math.max(220,Math.round(el.clientHeight*0.82));el.scrollBy({top:(direction>0?amount:-amount),behavior:'smooth'});el.focus?.({preventScroll:true});}

async function exportLeaderboardImage(id){
  try{
    const q=state.quizzes.find(x=>x.id===id);
    if(!q){toast('CBT not found.');return}
    const count=Math.max(1,Math.min(100,Number(document.getElementById(`lbExportCount-${id}`)?.value)||10));
    const source=await refreshLeaderboard(id,false);
    const rows=source.slice(0,count).map((row,index)=>({...row,name:leaderboardName(row),rank:index+1}));
    if(!rows.length){toast('There are no submitted results to export.');return}
    if(document.fonts?.ready)try{await document.fonts.ready}catch{}

    const dpr=Math.min(window.devicePixelRatio||1,2);
    const width=1080,pad=72,headerH=300,podiumH=260,columnH=60,rowH=72,footerH=112;
    const height=headerH+podiumH+columnH+(Math.max(0,rows.length-3)*rowH)+footerH+36;
    const canvas=document.createElement('canvas');canvas.width=width*dpr;canvas.height=height*dpr;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser could not create the leaderboard image.');
    ctx.scale(dpr,dpr);ctx.textBaseline='middle';
    const navy='#0B2D5C',gold='#D8A52B',paper='#FFFFFF',pale='#E8EEF5',ink='#172B45',muted='#63758A';
    ctx.fillStyle=paper;ctx.fillRect(0,0,width,height);
    ctx.fillStyle=navy;ctx.fillRect(0,0,width,headerH);
    ctx.fillStyle=gold;ctx.fillRect(0,0,12,headerH);

    const logo=await new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src='assets/icon.png';});
    if(logo){
      const box=118,x=pad,y=48;ctx.fillStyle=paper;roundRect(ctx,x,y,box,box,8);ctx.fill();
      const scale=Math.min((box-16)/logo.naturalWidth,(box-16)/logo.naturalHeight);
      const w=logo.naturalWidth*scale,h=logo.naturalHeight*scale;ctx.drawImage(logo,x+(box-w)/2,y+(box-h)/2,w,h);
    }
    const textX=logo?pad+150:pad;
    ctx.textAlign='left';ctx.fillStyle='#F1D477';ctx.font="700 18px 'Fira Sans', Arial, sans-serif";ctx.fillText('GIFTED BRAINZ ASSESSMENT HUB',textX,72);
    ctx.fillStyle=paper;ctx.font="400 46px 'DM Serif Display', Georgia, serif";
    const rawTitle=String(q.title||'Assessment');drawExportName(ctx,rawTitle,textX,122,width-textX-pad,"400 46px 'DM Serif Display', Georgia, serif",paper);
    ctx.fillStyle='#DCE6F1';ctx.font="500 18px 'Fira Sans', Arial, sans-serif";ctx.fillText('Official leaderboard',textX,163);
    ctx.fillStyle=gold;ctx.fillRect(pad,210,width-pad*2,2);
    ctx.fillStyle=paper;ctx.font="400 30px 'DM Serif Display', Georgia, serif";ctx.fillText(`Top ${rows.length} Results`,pad,252);
    ctx.textAlign='right';ctx.fillStyle='#DCE6F1';ctx.font="600 15px 'Fira Sans', Arial, sans-serif";ctx.fillText(new Date().toLocaleDateString('en-NG',{day:'2-digit',month:'short',year:'numeric'}),width-pad,252);

    // Draw a true three-place podium in the exported poster (not a screenshot).
    ctx.fillStyle='#F3F7FC';ctx.fillRect(0,headerH,width,podiumH);
    const podiums=[{row:rows[1],rank:2,x:138,w:240,h:104,color:'#9AADC3',symbol:'II'},
      {row:rows[0],rank:1,x:420,w:240,h:152,color:'#C7A04C',symbol:'I'},
      {row:rows[2],rank:3,x:702,w:240,h:82,color:'#B78667',symbol:'III'}].filter(p=>p.row);
    for(const p of podiums){
      const baseY=headerH+podiumH-24,topY=baseY-p.h;
      ctx.fillStyle=p.color;roundRect(ctx,p.x,topY,p.w,p.h,14);ctx.fill();
      ctx.fillStyle='#FFFFFF';ctx.font="700 42px 'Fira Sans', Arial";ctx.textAlign='center';ctx.fillText(p.symbol,p.x+p.w/2,topY+47);
      ctx.fillStyle='#173451';ctx.font="700 18px 'Fira Sans', Arial";ctx.textAlign='center';
      drawExportName(ctx,p.row.name,p.x+p.w/2,topY-52,200,"700 18px 'Fira Sans', Arial",'#173451');
      ctx.fillStyle='#5D718C';ctx.font="600 16px 'Fira Sans', Arial";ctx.fillText(`${percentLabel(p.row.percent)} · ${scoreOverTotalLabel(p.row.score,p.row.total)}`,p.x+p.w/2,topY-24);
    }
    const tableX=pad,tableW=width-pad*2,tableY=headerH+podiumH;
    ctx.fillStyle=pale;ctx.fillRect(tableX,tableY,tableW,columnH);
    const xRank=tableX+28,xName=tableX+118,xScore=tableX+660,xPercent=tableX+tableW-28;
    ctx.fillStyle=navy;ctx.font="700 14px 'Fira Sans', Arial, sans-serif";ctx.textAlign='left';ctx.fillText('RANK',xRank,tableY+columnH/2);ctx.fillText('PARTICIPANT',xName,tableY+columnH/2);ctx.fillText('SCORE',xScore,tableY+columnH/2);ctx.textAlign='right';ctx.fillText('PERCENTAGE',xPercent,tableY+columnH/2);
    rows.slice(3).forEach((a,i)=>{
      const y=tableY+columnH+i*rowH;
      if(i%2===1){ctx.fillStyle='#F7F9FC';ctx.fillRect(tableX,y,tableW,rowH)}
      ctx.strokeStyle=pale;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tableX,y+rowH);ctx.lineTo(tableX+tableW,y+rowH);ctx.stroke();
      ctx.textAlign='left';ctx.fillStyle=navy;ctx.font="700 18px 'Fira Sans', Arial, sans-serif";ctx.fillText(leaderboardRankLabel(a.rank),xRank,y+rowH/2);
      drawExportName(ctx,a.name,xName,y+rowH/2,500,"600 19px 'Fira Sans', Arial, sans-serif",ink);
      ctx.fillStyle=ink;ctx.font="600 18px 'Fira Sans', Arial, sans-serif";ctx.fillText(scoreOverTotalLabel(a.score,a.total),xScore,y+rowH/2);
      ctx.textAlign='right';ctx.fillStyle=navy;ctx.font="700 18px 'Fira Sans', Arial, sans-serif";ctx.fillText(percentLabel(a.percent),xPercent,y+rowH/2);
    });

    const footerY=height-footerH;ctx.fillStyle=navy;ctx.fillRect(0,footerY,width,footerH);ctx.fillStyle=gold;ctx.fillRect(0,footerY,width,5);
    ctx.textAlign='left';ctx.fillStyle=paper;ctx.font="400 20px 'DM Serif Display', Georgia, serif";ctx.fillText('Gifted Brainz Assessment Hub',pad,footerY+48);
    ctx.fillStyle='#DCE6F1';ctx.font="500 13px 'Fira Sans', Arial, sans-serif";ctx.fillText('No cramming, just understanding.',pad,footerY+77);
    ctx.textAlign='right';ctx.fillStyle='#DCE6F1';ctx.font="600 13px 'Fira Sans', Arial, sans-serif";ctx.fillText('OFFICIAL RESULTS',width-pad,footerY+62);

    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('The leaderboard image could not be created.');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${sanitizeFileName(q.title)}-leaderboard-top-${rows.length}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    toast(`Top ${rows.length} leaderboard image exported.`);
  }catch(e){console.error('Leaderboard export failed',e);toast(e.message||'Could not export leaderboard image.')}
}

function drawExportName(ctx,text,x,y,maxW,font,fill){
  let f=font;ctx.font=f;
  while(ctx.measureText(String(text)).width>maxW&&parseInt(f.match(/\d+/)?.[0]||'17')>12){
    const n=Math.max(12,parseInt(f.match(/\d+/)?.[0]||'17')-1);f=f.replace(/\d+px/,`${n}px`);ctx.font=f;
  }
  ctx.fillStyle=fill;ctx.fillText(String(text),x,y);
}
function roundRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();}

function saveDraftModal(){return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><div><h2>Save AI questions to CBT</h2><div class="sub">Up to 500 reviewed draft questions can be added in one save. All questions must pass validation before they are stored.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeModal()">×</button></div><div class="field" style="margin-top:18px"><label>CBT</label><select id="draftQuiz">${state.quizzes.map(q=>`<option value="${q.id}" ${state.builderQuizId===q.id?'selected':''}>${esc(q.title)}</option>`).join('')}</select></div><div class="field" style="margin-top:14px"><label>Section</label><select id="draftSection"><option value="">Select a section</option></select></div><div class="toolbar end" style="margin-top:20px"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveDraftToQuiz()">Save questions</button></div></div></div>`}
function togglePassageFields(){$('#passageFields')?.classList.toggle('hidden',$('#mType').value!=='passage');}
function addFieldRow(){const box=$('#fieldRows');box.insertAdjacentHTML('beforeend',fieldRow({label:'New field',type:'text',required:false,leaderboard:false},Date.now()));}
function addSectionRow(){const box=$('#sectionRows');box.querySelector('.notice')?.remove();box.insertAdjacentHTML('beforeend',sectionRow({title:'New Section',description:''},Date.now()));updateSectionMarksTotal();}
function updateSectionMarksTotal(){const box=$('#sectionMarksTotal');if(!box)return;const vals=$$('[data-s-marks]').map(e=>e.value.trim()).filter(v=>v!=='').map(Number).filter(Number.isFinite);const total=vals.reduce((a,b)=>a+Math.max(0,b),0);box.textContent=vals.length?`Allocated section marks total: ${Math.round(total)}`:'No section marks allocated yet. Enter marks such as English 100, Mathematics 100, Physics 100.';}
function collectFields(){return $$('[data-field-row]').map((r,i)=>({key:($('[data-f-label]',r).value||`field_${i+1}`).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||`field_${i+1}`,label:$('[data-f-label]',r).value.trim()||`Field ${i+1}`,type:$('[data-f-type]',r).value,required:$('[data-f-required]',r).checked,leaderboard:$('[data-f-leaderboard]',r).checked}));}
function toggleUnlimitedAttempts(){const unlimited=Boolean($('#setUnlimitedAttempts')?.checked);const input=$('#qMaxAttempts');if(input){input.disabled=unlimited;if(unlimited&&!input.value)input.value='1';}const note=input?.parentElement?.querySelector('.sub');if(note)note.textContent=unlimited?'Unlimited: students can retake this CBT as many times as they want on this device.':'Set how many attempts each device may use for this CBT.';}
async function saveQuizForm(id){
  try{
    const title=$('#qTitle').value.trim();
    if(!title){toast('Quiz title is required.');return;}
    const duration=Number($('#qDuration').value);
    if(!Number.isFinite(duration)||duration<1){toast('Duration must be at least 1 minute.');return;}
    const pass=Number($('#qPass').value);
    if(!Number.isFinite(pass)||pass<0||pass>100){toast('Pass mark must be between 0 and 100.');return;}
    const secRows=$$('[data-section-row]').filter(r=>$('[data-s-title]',r).value.trim());
    if(!secRows.length){toast('You have not completed this. Please add at least one section before continuing.');return;}
    const totalMarksVal=Number($('#qTotalMarks')?.value);
    const equalMarks=Boolean($('#setEqualMarks')?.checked);
    if(equalMarks&&(!totalMarksVal||totalMarksVal<1)){toast('Enter a total marks value greater than 0 when distributing marks equally.');return;}
    const sectionMarkValues=secRows.map(r=>String($('[data-s-marks]',r)?.value??'').trim());
    const anySectionMarks=sectionMarkValues.some(v=>v!=='');
    const partialSectionMarks=anySectionMarks&&sectionMarkValues.some(v=>v==='');
    if(partialSectionMarks){toast('Allocate marks for every section, or leave all section marks blank.');return;}
    if(anySectionMarks&&equalMarks){toast('Use either section mark allocation or equal distribution, not both.');return;}
    if(anySectionMarks&&sectionMarkValues.reduce((sum,v)=>sum+(Number(v)||0),0)<=0){toast('The total section marks must be greater than 0.');return;}
    const startInput=$('#qStartAt')?.value||'',endInput=$('#qEndAt')?.value||'';
    const startAt=startInput?new Date(cbtWatIso(startInput)):null,endAt=endInput?new Date(cbtWatIso(endInput)):null;
    if((startAt&&!Number.isFinite(startAt.getTime()))||(endAt&&!Number.isFinite(endAt.getTime())))return toast('Enter valid scheduling dates.');
    if(startAt&&endAt&&endAt<=startAt)return toast('The closing time must be later than the opening time.');
    const unlimitedAttempts=Boolean($('#setUnlimitedAttempts')?.checked);const enteredMaxAttempts=Math.trunc(Number($('#qMaxAttempts')?.value)||1);if(!unlimitedAttempts&&(enteredMaxAttempts<1||enteredMaxAttempts>10000)){toast('Maximum attempts must be between 1 and 10,000, or choose Unlimited attempts.');return;}const body={title:$('#qTitle').value,description:$('#qDescription').value,instructions:$('#qInstructions').value,accessMode:$('#qAccessMode')?.value==='private'?'private':'public',duration:$('#qDuration').value,passMark:$('#qPass').value,studentFields:collectFields(),settings:{assessmentMode:$('#qAssessmentMode')?.value==='study'?'study':'practice',resultEnabled:$('#setResult').checked,leaderboardEnabled:$('#setLeaderboard').checked,shuffleQuestions:$('#setShuffleQ').checked,shuffleOptions:$('#setShuffleO').checked,reviewEnabled:$('#setReview')?.checked!==false,totalMarks:totalMarksVal||null,equalMarks,maxAttempts:unlimitedAttempts?null:enteredMaxAttempts,startAt:startAt?startAt.toISOString():null,endAt:endAt?endAt.toISOString():null}};
    let quiz;if(id)quiz=(await api('quiz-update',{method:'PUT',body:{id,...body}})).quiz;else quiz=(await api('quiz-create',{method:'POST',body})).quiz;
    const rows=$$('[data-section-row]');
    const existing=((id?state.quizzes.find(x=>x.id===id)?.sections:quiz.sections)||[]).map(x=>x.id);const kept=[];
    for(let i=0;i<rows.length;i++){const r=rows[i],st=$('[data-s-title]',r).value.trim();if(!st)continue;const sid=r.dataset.id||undefined;if(sid)kept.push(sid);await api('section-save',{method:'POST',body:{id:sid,quizId:quiz.id,title:st,description:$('[data-s-desc]',r).value.trim(),marks:($('[data-s-marks]',r)?.value===''?null:Number($('[data-s-marks]',r).value)||0),position:i}});}
    for(const sid of existing.filter(x=>!kept.includes(x)))await api('section-delete',{method:'DELETE',query:{id:sid}});
    state.modal=null;const ok=await refreshAdmin(id?'CBT updated':'CBT created successfully');if(ok){state.modal={type:'builder',quizId:quiz.id};renderModal();}
  }catch(e){toast(e.message)}
}
async function saveManualQuestion(id){try{const targetQuizId=$('#mQuiz')?.value||null;const sectionId=$('#mSection')?.value||null;const text=$('#mText').value.trim();if(!text)return toast('Question text is required.');const opts=[0,1,2,3].map(i=>$(`#mOpt${i}`).value.trim());if(opts.some(o=>!o))return toast('All four options are required.');const imageEl=$('#mImageData');const imageField=imageEl?.value||'';const imageWasCleared=imageEl?.dataset.cleared==='true';if(imageField.length>1200000)return toast('This diagram is too large after compression. Remove it or choose a smaller image.');if(targetQuizId&&!sectionId)return toast('A section is required for every CBT question.');const existingQuestion=state.modal?.question||state.questions.find(x=>x.id===id)||null;const existingImage=existingQuestion?.image_data||null;const preserveOversizedImage=Boolean(existingQuestion?.image_omitted)&&!imageField&&!imageWasCleared;const body={id:id||undefined,type:$('#mType').value,text:$('#mText').value,subject:$('#mSubject').value,topic:$('#mTopic').value,difficulty:$('#mDifficulty').value,options:[0,1,2,3].map(i=>$(`#mOpt${i}`).value),answer:Number($('#mAnswer').value),explanation:$('#mExplanation').value,marks:Number($('#mMarks')?.value)||1,passageTitle:$('#mPassageTitle')?.value||'',passageContent:$('#mPassage')?.value||'',passageId:id?(existingQuestion?.passage_id||null):null,quizId:targetQuizId,sectionId};if(imageWasCleared)body.image_data=null;else if(imageField)body.image_data=imageField;else if(!preserveOversizedImage)body.image_data=existingImage||null;const saveResult=await api('question-save',{method:'POST',body});state.modal=null;const regradedCount=saveResult?.regraded?.regraded;const successMessage=id?(Number.isFinite(regradedCount)&&regradedCount>0?`Question updated — ${regradedCount} student score${regradedCount===1?'':'s'} recalculated`:'Question updated'):'Question added to Question Bank';const ok=await refreshAdmin(successMessage);if(ok&&targetQuizId){state.builderQuizId=targetQuizId;state.modal={type:'builder',quizId:targetQuizId};renderModal();}}catch(e){toast(e.message)}}
function previewQuestionImage(input){const file=input?.files?.[0];if(!file)return;if(file.size>5*1024*1024)return toast('Please use an image smaller than 5 MB.');const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1400/img.width,900/img.height);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);let data=c.toDataURL('image/jpeg',0.72);if(data.length>1100000)data=c.toDataURL('image/jpeg',0.52);if(data.length>1200000)return toast('This diagram is still too large after compression. Please choose a smaller image.');const el=$('#mImageData');if(el){el.value=data;el.dataset.cleared='false';}let p=$('#mImagePreview');if(!p){input.insertAdjacentHTML('afterend',`<img class="question-image" id="mImagePreview" alt="Question diagram preview">`);p=$('#mImagePreview')}p.src=data;updateManualPreview()};img.src=reader.result};reader.readAsDataURL(file)}
function clearQuestionImage(){const d=$('#mImageData');if(d){d.value='';d.dataset.cleared='true';}const p=$('#mImagePreview');if(p)p.remove();const f=$('#mImage');if(f)f.value='';updateManualPreview()}
function addQuestionToQuiz(id){if(!state.quizzes.length){toast('Create a CBT first.');return}state.modal={type:'add-question',questionId:id};renderModal();setTimeout(()=>loadSectionOptions('addQuiz','addSection'),0)}
async function loadSectionOptions(quizSelect,sectionSelect){const q=state.quizzes.find(x=>x.id===$(`#${quizSelect}`)?.value);if(!q)return;const el=$(`#${sectionSelect}`);if(!el)return;const secs=q.sections||[];const prev=el.value;el.innerHTML=secs.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('')||`<option value="">No sections yet</option>`;if(secs.some(s=>s.id===prev))el.value=prev;else if(secs.length)el.value=secs[0].id;}
async function saveAddQuestion(qid){try{const quizId=$('#addQuiz').value;const sectionId=$('#addSection').value||null;if(!sectionId)return toast('Choose a section for this CBT.');await api('question-add',{method:'POST',body:{questionId:qid,quizId,sectionId}});state.modal=null;await refreshAdmin('Question added to CBT');}catch(e){toast(e.message)}}
function syncBuilderSelectionUI(){const selected=state.builderSelectedIds.size;$$('[data-builder-selection-count]').forEach(el=>el.textContent=`${selected} selected`);const deleteBtn=$('[data-builder-bulk-delete]');if(deleteBtn)deleteBtn.disabled=!selected;const move=$('[data-builder-move-section]');if(move)move.disabled=!selected;const moveBtn=move?.parentElement?.querySelector('button[onclick*="moveBuilderQuestions"]');if(moveBtn)moveBtn.disabled=!selected;const q=state.quizzes.find(x=>x.id===state.modal?.quizId),qs=q?.questions||[];const all=qs.length>0&&qs.every(x=>state.builderSelectedIds.has(String(x.id)));const allBox=$('[data-builder-select-all]');if(allBox){allBox.checked=all;allBox.indeterminate=!all&&selected>0;}}
function toggleBuilderSelection(id){const key=String(id);state.builderSelectedIds.has(key)?state.builderSelectedIds.delete(key):state.builderSelectedIds.add(key);syncBuilderSelectionUI();}
function toggleAllBuilder(checked){const q=state.quizzes.find(x=>x.id===state.modal?.quizId);const qs=q?.questions||[];state.builderSelectedIds=checked?new Set(qs.map(x=>String(x.id))):new Set();$$('[data-builder-q-select]').forEach(el=>{el.checked=checked});syncBuilderSelectionUI();}
async function bulkDeleteBuilderQuestions(){const quizId=state.modal?.quizId;const ids=[...state.builderSelectedIds].map(String).filter(Boolean);if(!quizId)return toast('CBT context is missing. Close and reopen the Question Builder.');if(!ids.length)return toast('Select at least one question.');if(!await appConfirm('Delete selected questions?',`${ids.length} question${ids.length===1?'':'s'} will be permanently removed from this CBT.`,'Delete selected'))return;try{const r=await api('builder-bulk-delete',{method:'POST',body:{ids,quizId}});state.builderSelectedIds.clear();const ok=await refreshAdmin();if(ok){state.modal={type:'builder',quizId};renderModal();toast(`${Number(r.removed||0)} question${Number(r.removed)===1?'':'s'} deleted successfully.`);}}catch(e){toast(e.message)}}
async function moveBuilderQuestions(){const quizId=state.modal?.quizId;const ids=[...state.builderSelectedIds].map(String).filter(Boolean);const sectionId=$('#builderMoveSection')?.value;if(!quizId)return toast('CBT context is missing. Close and reopen the Question Builder.');if(!ids.length)return toast('Select at least one question.');if(!sectionId)return toast('Choose a destination section.');try{const r=await api('builder-bulk-move',{method:'POST',body:{ids,quizId,sectionId}});state.builderSelectedIds.clear();const ok=await refreshAdmin();if(ok){state.modal={type:'builder',quizId};renderModal();toast(`${Number(r.moved||0)} question${Number(r.moved)===1?'':'s'} moved successfully.`);}}catch(e){toast(e.message)}}
async function deleteQuizQuestion(id){if(!await appConfirm('Delete question?','This question will be removed from the CBT.','Delete'))return;const quizId=state.modal?.quizId;try{await api('question-delete',{method:'DELETE',query:{id}});await refreshAdmin();if(quizId){state.modal={type:'builder',quizId};renderModal();}toast('Question deleted');}catch(e){toast(e.message)}}
async function deleteBankQuestion(id){if(!await appConfirm('Delete question?','This question will be permanently removed from the Question Bank.','Delete'))return;try{await api('question-delete',{method:'DELETE',query:{id}});await refreshAdmin('Question deleted');}catch(e){toast(e.message)}}
async function duplicateQuiz(id){
  const q=state.quizzes.find(x=>x.id===id);
  if(!q)return;
  if(!await appConfirm('Duplicate CBT?',`Create a complete copy of “${q.title}”, including its sections and questions? Student submissions and leaderboard entries will not be copied.`,'Duplicate CBT'))return;
  try{const r=await api('quiz-duplicate',{method:'POST',body:{id}});await refreshAdmin('CBT duplicated');if(r.quizId){state.modal={type:'quiz',quiz:state.quizzes.find(x=>x.id===r.quizId)||null};renderModal();}}catch(e){toast(e.message)}}
async function deleteLeaderboardStudent(attemptId, studentName, quizId){
  const id=String(attemptId||'').trim();
  if(!id||id==='undefined'||id==='null')return toast('This leaderboard row is missing its attempt identifier. Refresh the leaderboard and try again.');
  if(!await appConfirm('Remove student from leaderboard?',`Remove “${studentName||'Student'}” from this CBT leaderboard? The leaderboard entry will be removed, its answer records will be deleted, and the student may submit a later retake. If they do, their first remaining submitted attempt can appear on the leaderboard.`,'Remove'))return;
  try{await api('attempt-delete',{method:'DELETE',query:{id}});state.leaderboards=state.leaderboards||{};if(quizId)await refreshLeaderboard(quizId,false);else await refreshAdmin();if(state.modal?.type==='leaderboard')renderModal();toast('Student removed from leaderboard.');}catch(e){toast(e.message)}}
async function deleteQuiz(id){if(!await appConfirm('Delete CBT?','This permanently removes the CBT, all its questions, sections, passages, submissions, leaderboard entries and result data.','Delete'))return;try{await api('quiz-delete',{method:'DELETE',query:{id}});await refreshAdmin('CBT deleted');}catch(e){toast(e.message)}}
async function copyQuizLink(slug){const link=`${location.origin}${location.pathname}?quiz=${encodeURIComponent(slug)}`;try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);else{const ta=document.createElement('textarea');ta.value=link;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}toast('Student link copied');}catch{toast(link)}}
async function showLeaderboard(id){try{await refreshLeaderboard(id,false);}catch(e){toast(e.message);state.leaderboards=state.leaderboards||{};state.leaderboards[id]=leaderboardRowsForQuiz(id);}state.modal={type:'leaderboard',quizId:id};renderModal();}
function closeModal(){state.modal=null;renderModal()}
function draftHasDuplicateOptions(q){const options=Array.isArray(q?.options)?q.options.map(v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ')):[];return options.length===4&&options.every(Boolean)&&new Set(options).size!==4;}
function draftExplanationDisagrees(q){
  const note=String(q?.explanation||'');
  const m=note.match(/(?:^|\n)\s*(?:correct\s+(?:answer|option)|answer\s+is)\s*[:\-]?\s*(?:option\s*)?([A-D])(?=[.)\s]|$)/i);
  const selected=normalizeDraftAnswer(q);
  return !!m&&selected!==null&&(m[1].toUpperCase().charCodeAt(0)-65)!==selected;
}
function extractionReadyStats(){const draft=state.aiDraft||[];const ready=draft.filter(q=>Array.isArray(q.options)&&q.options.length===4&&q.options.every(x=>String(x||'').trim())&&normalizeDraftAnswer(q)!==null&&!draftHasDuplicateOptions(q)&&!draftExplanationDisagrees(q)&&!q.needsReview).length;return {total:draft.length,ready,review:draft.length-ready};}
function extractionWorkflowHtml(){const stage=state.extractionStage||'upload';const stages=[['upload','Upload'],['reading','Read'],['extracting','Extract'],['review','Review'],['saved','Save']];const idx=stage==='error'?Math.max(0,stages.findIndex(x=>x[0]===state.extractionLastStage)):Math.max(0,stages.findIndex(x=>x[0]===stage));const stats=extractionReadyStats();return `<div class="extraction-workflow" aria-label="Document extraction stages"><ol class="extraction-stepper">${stages.map(([key,label],i)=>`<li class="${i<idx?'complete':i===idx?'active':''}"><span class="extraction-step-num">${i<idx?'✓':i+1}</span><span>${label}</span></li>`).join('')}</ol><div class="extraction-workflow-status" role="status" aria-live="polite"><span class="extraction-workflow-dot ${stage==='error'?'error':stage==='review'||stage==='saved'?'ready':''}"></span><span id="extractionProgressMessage">${esc(state.extractionMessage||'Select a document to begin. Review every extracted question before saving.')}</span></div>${stage!=='upload'&&stats.total?`<div class="extraction-totals"><span><b>${stats.total}</b> extracted</span><span class="success"><b>${stats.ready}</b> ready</span><span class="attention"><b>${stats.review}</b> need review</span></div>`:''}</div>`;}
function setExtractionProgress(stage,message,lastStage){state.extractionStage=stage;state.extractionMessage=String(message||'');if(stage!=='error')state.extractionLastStage=stage;else if(lastStage)state.extractionLastStage=lastStage;const root=document.querySelector('.extraction-workflow');if(root){const temp=document.createElement('div');temp.innerHTML=extractionWorkflowHtml();root.replaceWith(temp.firstElementChild);}}
function ai(){return shell(`<div class="ai-banner"><div class="ai-copy"><div class="ai-icon">✦</div><div><h3>Gifted Brainz AI Question Studio</h3><p>Groq-powered generation and document extraction. Always review AI content before publishing.</p></div></div><span class="tag gold">Groq • Human review</span></div><div class="grid two"><div class="card"><h2>Generate questions</h2><div class="sub">Describe what you need naturally. The AI can infer multiple-choice or passage-based intent.</div><div class="form-grid three" style="margin-top:18px"><div class="field"><label>Subject</label><input id="aiSubject" placeholder="e.g. Mathematics"></div><div class="field"><label>Topic</label><input id="aiTopic" placeholder="e.g. Quadratic equations"></div><div class="field"><label>Number</label><input id="aiCount" type="number" min="1" value="10" placeholder="Any number"></div><div class="field"><label>Difficulty</label><select id="aiDifficulty"><option>Mixed</option><option>Easy</option><option>Medium</option><option>Hard</option></select></div><div class="field"><label>Question type</label><select id="aiType"><option value="auto">Auto-detect</option><option value="multiple_choice">Multiple choice</option><option value="passage">Passage-based</option></select></div><div class="field"><label>Exam style</label><input id="aiExam" value="UTME"></div><div class="field full"><label>Instruction</label><textarea id="aiInstructions" rows="5" placeholder="Example: Create UTME-standard questions with plausible distractors. If passage-based, create one passage followed by several questions."></textarea></div></div><button class="btn btn-primary" onclick="generateAI()">✦ Generate Questions</button></div><div class="card"><h2>Extract from PDF or document</h2><div class="sub">Extract up to 1,000 questions from a PDF, Word document, TXT or CSV in one upload. Structured files are parsed locally; complex documents are processed in smaller Groq batches. Review the questions before saving.</div>${extractionWorkflowHtml()}<div class="upload-zone" onclick="$('#docFile').click()"><div class="upload-icon">⇧</div><strong>Choose a document</strong><span>PDF • DOCX • TXT • CSV</span></div><input id="docFile" type="file" accept=".pdf,.docx,.txt,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv" hidden onchange="extractDocument(this.files[0])"><div class="field" style="margin-top:14px"><label>Extraction instruction</label><textarea id="extractInstructions" rows="3" placeholder="Extract complete questions, four A-D options, answer keys and explanations/reasons/solutions when present. Flag anything missing for review."></textarea></div></div></div>${state.builderPoolId?`<div class="notice" style="margin-top:14px">Generated questions will be offered to <b>Question Pool: ${esc(state.pools.find(p=>p.id===state.builderPoolId)?.name||'the selected Question Pool')}</b> → <b>${esc((state.pools.find(p=>p.id===state.builderPoolId)?.topics||[]).find(t=>t.id===state.builderTopicId)?.name||'the selected topic')}</b> when you save below.</div>`:state.builderQuizId?`<div class="notice" style="margin-top:14px">Generated questions will be offered to <b>CBT: ${esc(state.quizzes.find(q=>q.id===state.builderQuizId)?.title||'the selected CBT')}</b> when you save below.</div>`:''}${state.aiDraft.length?`<div class="card" style="margin-top:18px"><div class="section-head"><div><h2>Review generated content</h2><div class="sub">${state.aiDraft.length} questions ready for review. Edit or remove anything before saving; review is paginated for speed.</div></div><div class="toolbar"><button class="btn btn-ghost" onclick="saveDraftToBank()">Save all to Question Bank</button>${state.builderPoolId?`<button class="btn btn-primary" onclick="saveDraftToPoolTopic()">Save to Question Pool: ${esc((state.pools.find(p=>p.id===state.builderPoolId)?.name||'Pool'))} → ${esc((state.pools.find(p=>p.id===state.builderPoolId)?.topics||[]).find(t=>t.id===state.builderTopicId)?.name||'Topic')}</button>`:state.builderQuizId?`<button class="btn btn-primary" onclick="openSaveDraftModal()">Save to CBT: ${esc(state.quizzes.find(q=>q.id===state.builderQuizId)?.title||'Selected CBT')}</button>`:`<button class="btn btn-primary" onclick="openSaveDraftModal()">Save to CBT</button>`}</div></div><div class="draft-page-toolbar"><span class="sub">Showing ${Math.max(1,(state.aiDraftPage||0)*DRAFT_REVIEW_PAGE_SIZE+1)}–${Math.min(state.aiDraft.length,((state.aiDraftPage||0)+1)*DRAFT_REVIEW_PAGE_SIZE)} of ${state.aiDraft.length} · Page ${(state.aiDraftPage||0)+1} of ${Math.ceil(state.aiDraft.length/DRAFT_REVIEW_PAGE_SIZE)}</span><div class="toolbar"><button type="button" class="btn btn-ghost" onclick="changeDraftPage(-1)" ${(state.aiDraftPage||0)===0?'disabled':''}>← Previous</button><button type="button" class="btn btn-ghost" onclick="changeDraftPage(1)" ${((state.aiDraftPage||0)+1)*DRAFT_REVIEW_PAGE_SIZE>=state.aiDraft.length?'disabled':''}>Next →</button></div></div>${state.aiDraft.slice((state.aiDraftPage||0)*DRAFT_REVIEW_PAGE_SIZE,((state.aiDraftPage||0)+1)*DRAFT_REVIEW_PAGE_SIZE).map((q,i)=>draftCard(q,i+(state.aiDraftPage||0)*DRAFT_REVIEW_PAGE_SIZE)).join('')}</div>`:''}`)}
function draftCard(q,i){const opts=Array.isArray(q.options)?q.options:['','','',''];const missing=opts.length!==4||opts.some(o=>!String(o??'').trim());const answerMissing=q.answer===null||!Number.isInteger(Number(q.answer))||Number(q.answer)<0||Number(q.answer)>3;const repeated=draftHasDuplicateOptions(q),conflict=draftExplanationDisagrees(q);const flagged=missing||answerMissing||repeated||conflict||q.needsReview;return `<div class="draft-card ${flagged?'draft-needs-review':''}"><div class="q-head"><strong>${i+1}. ${q.type==='passage'?'Passage question':'Multiple choice'}</strong><span class="tag ${flagged?'red':'green'}">${flagged?'⚠ Review required':'✓ Ready'}</span><button class="mini danger-mini" onclick="removeDraft(${i})">Remove</button></div>${flagged?`<div class="extract-warning">⚠️ ${missing?'Missing one or more answer options. ':''}${answerMissing?'Correct answer is missing or invalid. ':''}${repeated?'Two or more options are identical. ':''}${conflict?'The explanation identifies a different option as correct. ':''}</div>`:''}${q.passage?.content?`<div class="gb-draft-passage-editor"><div class="field"><label for="draftPassageTitle-${i}">Passage title — preserved exactly as entered</label><input id="draftPassageTitle-${i}" data-draft-passage-title="${i}" value="${escAttr(q.passage.title||'')}" oninput="updateDraftPassage(${i},'title',this.value)" placeholder="Passage title"></div><div class="field"><label for="draftPassageContent-${i}">Passage text (paragraph breaks are retained)</label><textarea id="draftPassageContent-${i}" rows="7" data-draft-passage-content="${i}" oninput="updateDraftPassage(${i},'content',this.value)">${esc(q.passage.content)}</textarea></div><div class="passage-preview"><b>📖 ${esc(q.passage.title||'Passage')}</b><div class="gb-paragraph-preview">${passageParagraphsHtml(q.passage.content)}</div></div></div>`:''}${safeImageSrc(q.image_data)?`<img class="question-image" src="${escAttr(safeImageSrc(q.image_data))}" alt="Question diagram">`:''}<label class="draft-label">Question / stem</label><textarea class="ai-q" data-draft-text="${i}" oninput="updateDraftPreview(${i})">${esc(q.text)}</textarea><div class="draft-live-preview" id="draftPreview-${i}">${questionStemHtml(q.text)}</div><div class="draft-options">${[0,1,2,3].map(j=>`<div><input class="ai-opt" data-draft-opt="${i}:${j}" value="${escAttr(opts[j]||'')}" oninput="updateDraftPreview(${i})" placeholder="Option ${String.fromCharCode(65+j)}"><label><input type="radio" name="answer-${i}" ${q.answer!==null&&q.answer!==undefined&&Number(q.answer)===j?'checked':''} onchange="state.aiDraft[${i}].answer=${j};state.aiDraft[${i}].needsReview=!(Array.isArray(state.aiDraft[${i}].options)&&state.aiDraft[${i}].options.length===4&&state.aiDraft[${i}].options.every(v=>String(v||'').trim()))||draftHasDuplicateOptions(state.aiDraft[${i}])||draftExplanationDisagrees(state.aiDraft[${i}])"> Correct</label></div>`).join('')}</div><div class="draft-answer-verification"><b>Extracted answer:</b> ${normalizeDraftAnswer(q)===null?"Not identified — select the correct option":`${String.fromCharCode(65+normalizeDraftAnswer(q))}. ${mathHtml(opts[normalizeDraftAnswer(q)]||"")}`} <span>Verify this answer against the question and explanation before saving.</span></div><div class="field" style="margin-top:10px"><label>Explanation / reason</label><textarea data-draft-explanation="${i}" rows="3" oninput="state.aiDraft[${i}].explanation=this.value">${esc(q.explanation||'')}</textarea><div class="draft-live-preview explanation-preview" id="draftExplanationPreview-${i}">${mathHtml(q.explanation||'No explanation provided.')}</div></div><div class="field" style="margin-top:10px"><label>Marks</label><input class="ai-marks" data-draft-marks="${i}" type="number" min="0.01" step="0.01" value="${q.marks??1}"></div><div class="sub">${esc(q.subject)} • ${esc(q.topic)} • ${esc(q.difficulty)}${q.source_page?` • Source page ${q.source_page}`:''}</div></div>`}
function updateDraftPassage(i,key,value){
  const q=state.aiDraft[i];if(!q?.passage||!['title','content'].includes(key))return;
  const previous={...q.passage};
  for(const other of state.aiDraft){
    if(other?.passage?.title===previous.title&&other?.passage?.content===previous.content){other.passage={...other.passage,[key]:value};}
  }
  const box=document.querySelector(`[data-draft-passage-${key}="${i}"]`)?.closest('.gb-draft-passage-editor')?.querySelector('.passage-preview');
  if(box){box.innerHTML=`<b>📖 ${esc(q.passage.title||'Passage')}</b><div class="gb-paragraph-preview">${passageParagraphsHtml(q.passage.content)}</div>`;renderMath(box)}
}
function updateDraftPreview(i){const q=state.aiDraft[i];if(!q)return;const t=$(`[data-draft-text="${i}"]`);if(t)q.text=t.value;for(let j=0;j<4;j++){const o=$(`[data-draft-opt="${i}:${j}"]`);if(o)q.options[j]=o.value;}const e=$(`[data-draft-explanation="${i}"]`);if(e)q.explanation=e.value;const p=$(`#draftPreview-${i}`);if(p){p.innerHTML=questionStemHtml(q.text);renderMath(p)}const ep=$(`#draftExplanationPreview-${i}`);if(ep){ep.innerHTML=mathHtml(q.explanation||'No explanation provided.');renderMath(ep)}}
function changeDraftPage(direction){syncDraftEdits();const maxPage=Math.max(0,Math.ceil(state.aiDraft.length/DRAFT_REVIEW_PAGE_SIZE)-1);state.aiDraftPage=Math.max(0,Math.min(maxPage,(state.aiDraftPage||0)+direction));render()}
function removeDraft(i){syncDraftEdits();state.aiDraft.splice(i,1);state.aiDraftPage=Math.min(state.aiDraftPage||0,Math.max(0,Math.ceil(state.aiDraft.length/DRAFT_REVIEW_PAGE_SIZE)-1));render()}
function normalizeDraftAnswer(q){const a=q?.answer;if(a===null||a===undefined||a==='')return null;if(Number.isInteger(a)&&a>=0&&a<=3)return a;const raw=String(a).trim();if(/^[A-D]$/i.test(raw))return raw.toUpperCase().charCodeAt(0)-65;if(/^[1-4]$/.test(raw))return Number(raw)-1;const opts=Array.isArray(q.options)?q.options.map(v=>String(v??'').trim()):[];let idx=opts.findIndex(v=>v.toLowerCase()===raw.toLowerCase());if(idx<0){const cleaned=raw.replace(/^(?:option\s*)?[A-D][.)\-:]\s*/i,'').trim();idx=opts.findIndex(v=>v.toLowerCase()===cleaned.toLowerCase());}return idx>=0?idx:null}
function syncDraftEdits(){state.aiDraft.forEach((q,i)=>{const t=$(`[data-draft-text="${i}"]`);if(t)q.text=t.value;for(let j=0;j<4;j++){const o=$(`[data-draft-opt="${i}:${j}"]`);if(o)q.options[j]=o.value;}const e=$(`[data-draft-explanation="${i}"]`);if(e)q.explanation=e.value;const pt=$(`[data-draft-passage-title="${i}"]`),pc=$(`[data-draft-passage-content="${i}"]`);if(q.passage){if(pt)q.passage.title=pt.value;if(pc)q.passage.content=pc.value;}const m=$(`[data-draft-marks="${i}"]`);if(m)q.marks=Number(m.value)||1;q.answer=normalizeDraftAnswer(q);})}
async function generateAI(){
  try{
    syncDraftEdits();
    const total=Math.max(1,Math.min(200,Number($('#aiCount').value)||10)),subject=$('#aiSubject').value,topic=$('#aiTopic').value,difficulty=$('#aiDifficulty').value,type=$('#aiType').value,exam=$('#aiExam').value,instructions=$('#aiInstructions').value;
    const all=[];
    for(let done=0;done<total;done+=10){
      const batch=Math.min(10,total-done);toast(`Generating questions ${done+1}–${done+batch} of ${total}…`);
      if(done>0)await new Promise(resolve=>setTimeout(resolve,1500));
      try{
        const r=await api('ai-generate',{method:'POST',body:{count:batch,subject,topic,difficulty,type,exam,instructions}});
        const generated=Array.isArray(r.questions)?r.questions:[];
        if(generated.length!==batch)throw new Error(`The AI returned ${generated.length} questions for this batch instead of ${batch}.`);
        all.push(...generated);
      }catch(batchError){
        if(all.length){state.aiDraftPage=0;state.aiDraft=all;render();toast(`${all.length} valid question${all.length===1?'':'s'} were generated before the next batch failed. No invalid questions were added.`);}
        throw batchError;
      }
    }
    state.aiDraftPage=0;state.aiDraft=all;render();toast(`${all.length} question${all.length===1?'':'s'} generated. Review before saving.`);
  }catch(e){toast(e.message)}
}
// A passage label is not necessarily its title. Respect a clearly marked custom
// title, including "Passage C: The Moon" and "Passage Title: The Moon".
function parseImportedPassageSection(section){
  const raw=String(section??'').replace(/\r\n?/g,'\n');
  const header=/(?:^|\n)[ \t]*((?:passage[ \t]+title|passage(?:[ \t]+(?:[IVXLCDM]+|\d+|[A-Z]))?|comprehension(?:[ \t]+passage)?(?:[ \t]+[A-Z0-9]+)?|cloze(?:[ \t]+passage)?(?:[ \t]+[A-Z0-9]+)?))[ \t]*(?::|[—–-])?[ \t]*([^\n]*)(?:\n|$)/gi;
  const found=[...raw.matchAll(header)];if(!found.length)return null;
  const hit=found.at(-1),label=hit[1].trim(),inline=String(hit[2]||'').trim();
  let body=raw.slice(hit.index+hit[0].length).trim();
  let title=inline || label;
  if(!inline){
    const explicit=body.match(/^(?:passage\s+title|title|heading)\s*:\s*([^\n]+)\n?/i);
    if(explicit){title=explicit[1].trim();body=body.slice(explicit[0].length).trim();}
    else{
      const lines=body.split('\n'),candidate=String(lines[0]||'').trim();
      if(lines.length>=3&&candidate.length>=3&&candidate.length<=85&&!/[.!?;:]$/.test(candidate)&&String(lines.slice(1).join(' ')).trim().length>65){title=candidate;body=lines.slice(1).join('\n').trim();}
    }
  }
  return body?{title,content:body.slice(0,30000)}:null;
}
function parseImportedDocumentLocally(text){
  const raw=String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();if(!raw)return [];
  const ah=/(?:^|\n)\s*(?:answer\s*key|answers|correct\s*answers)\s*:?\s*\n?/im,eh=/(?:^|\n)\s*(?:explanations?|reasons?|solutions?|rationales?)\s*:?\s*\n?/im;const answerHeader=ah.exec(raw),explanationHeader=eh.exec(raw);const hs=[answerHeader,explanationHeader].filter(Boolean);const mainEnd=hs.length?Math.min(...hs.map(m=>m.index)):raw.length;const main=raw.slice(0,mainEnd).trim(),tail=raw.slice(mainEnd).trim();
  const starts=[...main.matchAll(/(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.)\-:]\s+(?=\S)/gi)];if(!starts.length)return [];if(starts.length>MAX_DOCUMENT_EXTRACTION_QUESTIONS)throw new Error(`This document contains ${starts.length} numbered questions. Import up to ${MAX_DOCUMENT_EXTRACTION_QUESTIONS} at once; split larger documents.`);
  // Never scan explanation paragraphs as answer-key entries. A line beginning
  // '12. A ...' in the explanations is not evidence that question 12 is A.
  const answerBody=answerHeader?raw.slice(answerHeader.index+answerHeader[0].length,explanationHeader&&explanationHeader.index>answerHeader.index?explanationHeader.index:raw.length):'';
  const answers=new Map();let m;const ar=/(?:^|[\s,;])(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.)\-:]?\s*([A-D])(?=\s|$|\d{1,4}\s*[.)\-:])/gi;
  while((m=ar.exec(answerBody))){const id=Number(m[1]),index=m[2].toUpperCase().charCodeAt(0)-65;if(answers.has(id)&&answers.get(id)!==index)answers.set(id,null);else if(!answers.has(id))answers.set(id,index);}
  const explanations=new Map();const explanationBody=explanationHeader?raw.slice(explanationHeader.index+explanationHeader[0].length):'';const er=/(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.)\-:]\s*([\s\S]*?)(?=(?:\n\s*(?:Q(?:uestion)?\s*)?\d{1,4}\s*[.)\-:]\s)|$)/gi;while((m=er.exec(explanationBody)))explanations.set(Number(m[1]),m[2].trim());
  const pages=[...main.matchAll(/\[PAGE\s+(\d+)\]/gi)],out=[];let passage=null;
  for(let i=0;i<starts.length;i++){const qnum=Number(starts[i][1]),start=starts[i].index+(starts[i][0].length-starts[i][0].trimStart().length),next=i+1<starts.length?starts[i+1].index:main.length,between=main.slice(i?starts[i-1].index:0,start).trim();const detectedPassage=parseImportedPassageSection(between);if(detectedPassage)passage=detectedPassage;
    const rawChunk=main.slice(start,next),im=/\[\[GBIMG:(\d+)\]\]/i.exec(rawChunk),sourceImageIndex=im?Number(im[1]):null;let chunk=rawChunk.replace(/\[PAGE\s+\d+\]/gi,' ').replace(/\[\[GBIMG:\d+\]\]/gi,' ').replace(/(?:^|\n)\s*(?:Gifted\s*Brainz[^\n]*?)?Page\s+\d+\s*$/gim,'').replace(/^\d{1,4}\s*[.)\-:]\s*/,'').replace(/\n\s*(?:explanation|reason|solution|rationale)\s*:?\s*[\s\S]*$/i,'').trim();
    const optionLabelRe=/^[ \t]*\(?([A-Da-d])\)?[.)\-:][ \t]+/gm;
    const matches=[...chunk.matchAll(optionLabelRe)].filter((x,j)=>x[1].toUpperCase()===(j===0?'A':String.fromCharCode(65+j)));let qtext=chunk,opts=['','','',''];
    if(matches.length>=4){opts=matches.slice(0,4).map((x,j)=>chunk.slice(x.index+x[0].length,j<3?matches[j+1].index:chunk.length).trim().replace(/\s+/g,' '));qtext=chunk.slice(0,matches[0].index).trim().replace(/[ \t]+/g,' ');}
    const answer=answers.has(qnum)?answers.get(qnum):null;out.push({type:passage?'passage':'multiple_choice',text:qtext,options:opts,answer:answer,explanation:explanations.get(qnum)||'',subject:$('#aiSubject')?.value||'General',topic:$('#aiTopic')?.value||'General',difficulty:'Medium',marks:1,source_page:Number([...pages].filter(x=>x.index<=start).at(-1)?.[1])||null,source_image_index:sourceImageIndex,image_data:null,passage:passage?{title:passage.title,content:passage.content}:null,needsReview:opts.some(o=>!o)||new Set(opts.map(o=>o.trim().toLowerCase())).size!==4||answer===null});
  }return out.filter(q=>q.text);
}
// AI extraction is bounded per request to avoid model/output-token truncation.
// Preserve numbered question boundaries and supply answer-key lines relevant to
// each batch; one upload can therefore contain 1,000 questions.
function splitDocumentForExtraction(text){
  const source=String(text||'').replace(/\r/g,'');
  const headings=[...source.matchAll(/(?:^|\n)\s*(?:answer\s*key|answers|correct\s*answers|explanations?|reasons?|solutions?|rationales?)\s*:?\s*\n/gi)];
  const contentEnd=headings.length?Math.min(...headings.map(m=>m.index)):source.length;
  const main=source.slice(0,contentEnd),tail=source.slice(contentEnd);
  const starts=[...main.matchAll(/(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.)\-:]\s+(?=\S)/gi)];
  if(starts.length>MAX_DOCUMENT_EXTRACTION_QUESTIONS)throw new Error(`Found ${starts.length} numbered questions. The maximum per document is ${MAX_DOCUMENT_EXTRACTION_QUESTIONS}; please split the file.`);
  const chunks=[];
  if(starts.length){
    let group=[],size=0,nums=[];
    const flush=()=>{if(!group.length)return;chunks.push({text:group.join('\n'),numbers:nums.slice(),estimated:nums.length});group=[];size=0;nums=[];};
    for(let i=0;i<starts.length;i++){
      const block=(i===0?main.slice(0,starts[0].index):'')+main.slice(starts[i].index,i+1<starts.length?starts[i+1].index:main.length).trim();
      // Long passages stay whole; they are never silently cut in the middle.
      if(group.length&&(group.length>=DOCUMENT_EXTRACT_CHUNK_QUESTIONS||size+block.length>14000))flush();
      group.push(block);size+=block.length;nums.push(Number(starts[i][1]));
    }
    flush();
  }else{
    // Unnumbered source: split along paragraph boundaries, with no text lost.
    let rest=main.trim();
    while(rest){
      if(rest.length<=14000){chunks.push({text:rest,numbers:[],estimated:25});break;}
      let at=rest.lastIndexOf('\n\n',14000);
      if(at<7000)at=rest.lastIndexOf('\n',14000);
      if(at<7000)at=14000;
      chunks.push({text:rest.slice(0,at),numbers:[],estimated:25});rest=rest.slice(at).trimStart();
    }
  }
  // Key references are filtered to the question numbers in each numbered batch.
  // The complete original document is not truncated to 180,000 characters.
  const keyMatches=[...tail.matchAll(/(?:^|[\s,;])(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.)\-:]?\s*([A-D])(?=\s|$|\d{1,4}\s*[.)\-:])/gi)];
  const key=new Map(keyMatches.map(m=>[Number(m[1]),m[2].toUpperCase()]));
  const explanationHead=/(?:^|\n)\s*(?:explanations?|reasons?|solutions?|rationales?)\s*:?\s*\n/im.exec(tail);
  const explanationText=explanationHead?tail.slice(explanationHead.index+explanationHead[0].length):'';
  const explanationStarts=[...explanationText.matchAll(/(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.)\-:]\s+(?=\S)/gi)];
  const explanations=new Map();
  for(let i=0;i<explanationStarts.length;i++){
    const m=explanationStarts[i],end=i+1<explanationStarts.length?explanationStarts[i+1].index:explanationText.length;
    const explanation=explanationText.slice(m.index+m[0].length,end).trim();
    if(explanation)explanations.set(Number(m[1]),explanation);
  }
  for(const chunk of chunks){
    if(chunk.numbers.length&&key.size){
      const selected=chunk.numbers.filter(num=>key.has(num)).map(num=>`${num}. ${key.get(num)}`);
      if(selected.length)chunk.text+=`\n\nANSWER KEY FOR THIS BATCH:\n${selected.join('\n')}`;
    }
    if(chunk.numbers.length&&explanations.size){
      const selected=chunk.numbers.filter(num=>explanations.has(num)).map(num=>`${num}. ${explanations.get(num)}`);
      if(selected.length)chunk.text+=`\n\nSOURCE EXPLANATIONS FOR THIS BATCH:\n${selected.join('\n')}`;
    }
  }
  return chunks;
}
async function extractDocument(file){
  if(!file)return;
  window._gbDiagramPages={};
  window._gbDocxImages=[];
  try{
    if(file.size>20*1024*1024)throw new Error('Please upload a document smaller than 20 MB.');
    setExtractionProgress('reading',`Reading ${file.name}…`);toast('Reading document…');
    let text=''; const ext=file.name.toLowerCase().split('.').pop();
    if(ext==='pdf'){
      if(window.pdfjsReady)await window.pdfjsReady;
      if(!window.pdfjsLib)throw new Error('PDF reader is not available. Refresh the page and try again.');
      const data=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data}).promise,pages=[],diagramPages={};
      const IMG_OPS=new Set([pdfjsLib.OPS.paintImageXObject,pdfjsLib.OPS.paintImageMaskXObject,pdfjsLib.OPS.paintSolidColorImageMask,pdfjsLib.OPS.paintInlineImageXObject,pdfjsLib.OPS.paintImageXObjectRepeat,pdfjsLib.OPS.paintFormXObjectBegin,pdfjsLib.OPS.paintXObject]);
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i),c=await page.getTextContent();
        const lines=[];
        for(const item of c.items){
          const y=Number(item.transform?.[5]||0), x=Number(item.transform?.[4]||0), value=String(item.str||'').trim();
          if(!value)continue;
          let line=lines.find(row=>Math.abs(row.y-y)<=3);
          if(!line){line={y,items:[]};lines.push(line)}
          line.items.push({x,value});
        }
        lines.sort((a,b)=>b.y-a.y);
        const pageText=lines.map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.value).join(' ')).join('\n');
        pages.push(`[PAGE ${i}]\n${pageText}`);
        try{
          const ops=await page.getOperatorList(),hasImage=ops.fnArray.some(fn=>IMG_OPS.has(fn));
          if(hasImage){const viewport=page.getViewport({scale:1.35}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{alpha:false});await page.render({canvasContext:ctx,viewport}).promise;diagramPages[i]=canvas.toDataURL('image/jpeg',0.62);}
        }catch(err){console.warn('Could not inspect PDF page',i,err)}
      }
      text=pages.join('\n\n');window._gbDiagramPages=diagramPages;
    }else if(ext==='docx'){
      if(!window.mammoth)throw new Error('Word document reader is not loaded. Refresh the page and try again.');
      const result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{convertImage:mammoth.images.dataUri});
      const doc=new DOMParser().parseFromString(result.value,'text/html'),images=[];
      doc.querySelectorAll('img').forEach((img,index)=>{const src=img.getAttribute('src')||'';if(src.startsWith('data:image/')){images[index]=src;img.replaceWith(doc.createTextNode(` [[GBIMG:${index}]] `));}else img.remove();});
      doc.body.querySelectorAll('br').forEach(br=>br.replaceWith(doc.createTextNode('\n')));doc.body.querySelectorAll('p,li,h1,h2,h3,h4,table,tr').forEach(el=>el.appendChild(doc.createTextNode('\n')));
      window._gbDocxImages=images;text=doc.body.textContent||'';
    }else{text=await file.text();}
    if(!text.trim())throw new Error('No readable text was found in that document.');
    setExtractionProgress('extracting','Identifying question boundaries, options and answer keys…');
    const local=parseImportedDocumentLocally(text);
    const localUsable=local.length>0 && (local.every(q=>Array.isArray(q.options)&&q.options.length===4&&q.options.every(o=>String(o||'').trim())) || (local.length>=50 && local.filter(q=>Array.isArray(q.options)&&q.options.length===4&&q.options.every(o=>String(o||'').trim())).length/local.length>=.8));
    if(localUsable){
      const pageImageUsed=new Set();
      state.aiDraftPage=0;state.aiDraft=local.map(q=>{
        const page=Number(q.source_page);let imageData=q.image_data||null;
        if(!imageData&&Number.isInteger(q.source_image_index)&&window._gbDocxImages?.[q.source_image_index])imageData=window._gbDocxImages[q.source_image_index];
        if(!imageData&&page&&window._gbDiagramPages?.[page]&&!pageImageUsed.has(page)){imageData=window._gbDiagramPages[page];pageImageUsed.add(page);}
        return {...q,image_data:imageData};
      });
       setExtractionProgress('review',`${state.aiDraft.length} questions extracted locally. Check answers before saving.`);render();toast(`${state.aiDraft.length} questions extracted locally. Review before saving.`);
      return;
    }
    toast(local.length ? 'The document needs additional structured extraction. Processing it in smaller batches…' : 'Extracting questions in batches without truncating the document…');
    const chunks=splitDocumentForExtraction(text);
    if(!chunks.length)throw new Error('No content was found for question extraction.');
    const extracted=[],seen=new Set(),pageImageUsed=new Set();
    state.aiDraftPage=0;
    for(let ci=0;ci<chunks.length;ci++){
      const chunk=chunks[ci];
      setExtractionProgress('extracting',`Extracting batch ${ci+1} of ${chunks.length}… ${extracted.length} questions recognised so far.`);
      toast(`Extracting batch ${ci+1} of ${chunks.length} (up to ${MAX_DOCUMENT_EXTRACTION_QUESTIONS} questions per upload)…`);
      try{
        const result=await api('ai-extract',{method:'POST',body:{text:chunk.text,instructions:$('#extractInstructions').value,count:Math.min(200,chunk.estimated||25)}});
        const batch=Array.isArray(result.questions)?result.questions:[];
        for(const q of batch){
          const key=`${String(q.text||'').trim().toLowerCase()}||${(q.options||[]).map(o=>String(o).trim().toLowerCase()).join('|')}`;
          if(!q.text||seen.has(key))continue;
          seen.add(key);
          const page=Number(q.source_page);let imageData=q.image_data||null;
          if(!imageData&&page&&window._gbDiagramPages?.[page]&&!pageImageUsed.has(page)){imageData=window._gbDiagramPages[page];pageImageUsed.add(page);}
          extracted.push({...q,image_data:imageData});
          if(extracted.length>MAX_DOCUMENT_EXTRACTION_QUESTIONS)throw new Error(`More than ${MAX_DOCUMENT_EXTRACTION_QUESTIONS} questions were extracted. Split the document into smaller files.`);
        }
      }catch(batchError){
         state.aiDraft=extracted;setExtractionProgress('error',`Extraction paused at batch ${ci+1} of ${chunks.length}. Earlier questions remain available for review.`,'extracting');render();
        throw new Error(`Extraction stopped at batch ${ci+1}/${chunks.length}: ${batchError.message}. ${extracted.length} earlier questions remain in Review and can be saved; retry a smaller file for the remainder.`);
      }
    }
    state.aiDraft=extracted;
    setExtractionProgress('review',`${extracted.length} questions extracted. Review flagged items before saving.`);
    render();toast(`${state.aiDraft.length} questions extracted across ${chunks.length} batch${chunks.length===1?'':'es'}. Review answers before saving.`);
  }catch(e){setExtractionProgress('error',e.message);toast(e.message)}finally{$('#docFile')&&($('#docFile').value='')}}
async function saveDraftQuestions(quizId,sectionId,poolId,topicId){
  syncDraftEdits();
  if(!state.aiDraft.length){toast('No AI questions to save.');return false;}
  if(state.savingDraft)return false;
  if(state.aiDraft.length>MAX_DOCUMENT_EXTRACTION_QUESTIONS){toast(`A maximum of ${MAX_DOCUMENT_EXTRACTION_QUESTIONS} questions can be imported at once.`);return false;}
  for(let i=0;i<state.aiDraft.length;i++){
    const q=state.aiDraft[i], opts=Array.isArray(q.options)?q.options.map(o=>String(o??'').trim()):[];
    if(q.image_data&&String(q.image_data).length>1100000){
      const compressed=await compressImageDataForUpload(q.image_data);
      if(compressed)q.image_data=compressed;
      if(!q.image_data||String(q.image_data).length>MAX_STORED_IMAGE_CHARS){toast(`Question ${i+1} has a diagram that is too large to save. Please replace it with a smaller image.`);return false;}
    }
    if(!q.text||!q.text.trim()){toast(`Question ${i+1} needs text.`);return false;}
    if(opts.length!==4||opts.some(o=>!o)||!Number.isInteger(Number(q.answer))||Number(q.answer)<0||Number(q.answer)>3){toast(`Question ${i+1} is incomplete. Add four options and select the correct answer before saving.`);return false;}
    if(new Set(opts.map(o=>o.toLowerCase().replace(/\s+/g,' '))).size!==4){toast(`Question ${i+1} contains repeated options. Please correct the alternatives before saving.`);return false;}
    if(draftExplanationDisagrees(q)){toast(`Question ${i+1} has an explanation that conflicts with the selected answer. Please correct it before saving.`);return false;}
    if(q.type==='passage'&&(!q.passage||!String(q.passage.content||'').trim())){toast(`Question ${i+1} needs passage content.`);return false;}
  }
  const total=state.aiDraft.length;let saved=0;
  if(state.extractionStage&&state.extractionStage!=='upload')setExtractionProgress('review',`Saving ${total} reviewed questions in batches…`);
  state.savingDraft=true;
  try{
    while(state.aiDraft.length){
      const batch=state.aiDraft.slice(0,DRAFT_SAVE_BATCH_SIZE);
      toast(`Saving questions ${saved+1}–${saved+batch.length} of ${total}…`);
      const r=await api('ai-save-batch',{method:'POST',body:{quizId:quizId||null,sectionId:sectionId||null,poolId:poolId||null,topicId:topicId||null,questions:batch}});
      if(Number(r.inserted)!==batch.length)throw new Error(`Server did not confirm the batch of ${batch.length}. Check your question bank before retrying to avoid duplicates.`);
      saved+=batch.length;
      state.aiDraft.splice(0,batch.length);
    }
    state.aiDraftPage=0;
    if(state.extractionStage&&state.extractionStage!=='upload')setExtractionProgress('saved',`${saved} questions saved successfully to the selected destination.`);
    return true;
  }catch(e){
    state.aiDraftPage=0;if(typeof setExtractionProgress==='function'&&state.extractionStage&&state.extractionStage!=='upload')setExtractionProgress('error',`${saved} of ${total} confirmed saved; ${state.aiDraft.length} remain available to review.`);render();
    toast(`${saved} of ${total} questions confirmed saved. ${state.aiDraft.length} remain in Review. ${e.message}`);
    return false;
  }finally{state.savingDraft=false;}
}
async function saveDraftToBank(){try{if(!state.aiDraft.length)return toast('No AI questions to save.');if(false===await saveDraftQuestions(null,null))return;state.aiDraft=[];await refreshAdmin('Questions saved to Question Bank');}catch(e){toast(e.message)}}
function openSaveDraftModal(){syncDraftEdits();if(!state.aiDraft.length)return toast('No AI questions to save.');if(!state.quizzes.length)return toast('Create a CBT first.');state.modal={type:'save-draft'};renderModal();setTimeout(()=>loadSectionOptions('draftQuiz','draftSection'),0)}
async function saveDraftToQuiz(){try{const quizId=$('#draftQuiz').value,sectionId=$('#draftSection').value||null;if(!quizId)return toast('Select a CBT.');if(false===await saveDraftQuestions(quizId,sectionId))return;state.aiDraft=[];state.modal=null;const ok=await refreshAdmin('AI questions saved to CBT');if(ok){state.builderQuizId=quizId;state.modal={type:'builder',quizId};renderModal();}}catch(e){toast(e.message)}}
async function saveDraftToPoolTopic(){try{
  const poolId=state.builderPoolId,topicId=state.builderTopicId;
  if(!poolId||!topicId)return toast('Open a Question Pool topic first, then generate with AI.');
  const count=state.aiDraft.length;
  if(false===await saveDraftQuestions(null,null,poolId,topicId))return;
  state.aiDraft=[];
  delete state.poolTopicQuestions[topicId]; // refetch once, so the new questions show
  const pool=state.pools.find(p=>p.id===poolId);const topic=pool?.topics?.find(t=>t.id===topicId);if(topic)topic.questionCount=(topic.questionCount||0)+count;
  toast('AI questions saved to the topic');
  state.modal={type:'poolTopic',poolId,topicId};renderModal();
}catch(e){toast(e.message)}}
function logoutAdmin(){storage.remove('gb_admin_token');auth.token='';state.quizzes=[];state.questions=[];state.attempts=[];state.leaderboards={};state.bootstrapWarnings=[];state.modal=null;render()}
async function checkHealth(force=false){if(state.healthLoading||(!force&&state.healthChecked))return;state.healthLoading=true;state.healthChecked=true;if(!state.studentQuiz)render();try{state.health=await api('health');state.authError=state.health.databaseOk?'':(state.health.databaseError||'The database is not ready. Run the supplied schema.sql in Supabase.');}catch(e){state.health={databaseOk:false,aiConfigured:false,databaseError:e.message};if(!state.studentQuiz)state.authError=e.message;}finally{state.healthLoading=false;if(!state.studentQuiz)render();}}
async function loginAdmin(){try{const password=$('#loginPassword')?.value;if(!password)return toast('Enter your password.');const r=await api('login',{method:'POST',body:{password}});auth.token=r.token;storage.set('gb_admin_token',auth.token);state.authError='';state.authRecovery=false;const loaded=await loadAdmin(true);if(loaded)toast('Welcome to Gifted Brainz');}catch(e){if(e.status===401){state.authError='Invalid admin password.';}else{state.authError=e.message;}render();}}
async function retryAdminLoad(){state.authRecovery=true;state.authError='';render();await loadAdmin(true);}
async function loadAdmin(showRecovery=false){
  try{
    const r=await api('bootstrap');
    state.quizzes=r.quizzes||[];state.questions=r.questions||[];state.attempts=r.attempts||[];state.libraries=r.libraries||[];state.pools=r.pools||[];state.adminWhatsAppNumber=r.settings?.administratorWhatsAppNumber||'';state.eduSpaceLink=r.settings?.eduSpaceLink||'';state.bootstrapWarnings=Array.isArray(r.warnings)?r.warnings:[];state.authError='';state.authRecovery=false;
    render();return true;
  }catch(e){
    if(e.status===401){
      state.authError='Your administrator session has expired. Please sign in again.';state.authRecovery=false;
    }else{
      let message=e.message||'Dashboard data could not be loaded.';
      if(Number(e.status)>=500){
        try{
          const h=await api('health');
          if(h?.databaseError)message+=`\nDatabase diagnostic: ${h.databaseError}`;
          else if(h?.databaseOk)message+='\nBasic Supabase table checks are healthy; the failure is in the dashboard bootstrap data load.';
        }catch(healthError){
          message+=`\nHealth check also failed: ${healthError.message||'unknown error'}`;
        }
      }
      state.authError=message;state.authRecovery=true;
    }
    render();return false;
  }
}
async function refreshAdmin(message){const ok=await loadAdmin();if(ok&&message)toast(message);return ok;}
function nav(p){state.page=p;if(p==='biltz'&&!state.biltzLoaded&&!state.biltzLoading)loadBiltzChallenges();if(p==='boost')boostLoadAdmin();if(p==='ai'){state.builderQuizId=null;state.builderPoolId=null;state.builderTopicId=null;}render();if(p==='feedback')loadFeedback(false);}
function openAiForQuiz(id){state.page='ai';state.builderQuizId=id;state.builderPoolId=null;state.builderTopicId=null;render();}
function openAiForPoolTopic(poolId,topicId){state.page='ai';state.builderPoolId=poolId;state.builderTopicId=topicId;state.builderQuizId=null;render();}
function render(){if(state.studentBoost){boostRenderStudent();return;}if(state.studentBiltzPage&&!state.studentQuiz){applyStudentTheme();renderBiltzLanding();return}if(state.studentPool){applyStudentTheme();renderStudentPool();return}if(state.studentQuiz){applyStudentTheme();renderStudent();return}applyAdminTheme();if(!auth.token||state.authRecovery){app.innerHTML=login();applyAdminTheme();if(!state.healthChecked)checkHealth();return}const views={dashboard,quizzes,questions,ai,results,libraries,pools,biltz:brainzBiltz,boost:boostAdmin,analytics,feedback,settings};const view=views[state.page]||dashboard;app.innerHTML=view();applyAdminTheme();if(state.page==='questions')filterAdminQuestionBank(false);else renderMath(app);}
// Student experience: dedicated quiz-only environment. No admin routes are exposed when a quiz is open.
const WHATSAPP_CHANNEL='https://whatsapp.com/channel/0029VbC1jX73QxRtsF3Kms3r';
function whatsappActivationLink(itemLabel,itemName,deviceId,number=state.adminWhatsAppNumber){
  const digits=String(number||'').replace(/\D/g,'');
  const text=`Hi Gifted Brainz Tutorial, I want to activate my device for ${itemLabel} "${itemName}". My device ID is ${deviceId}.`;
  return digits?`https://wa.me/${digits}?text=${encodeURIComponent(text)}`:'#';
}
// A link is trusted only after server confirmation, not on the basis of a saved URL.
let eduSpaceStudentState = {checked:false,linked:false,configured:false,returnUrl:''};
function eduSpaceLinkPanel() {
  return `<section class="gb-eduspace-link" aria-label="EduSpace account connection">
    <div class="gb-eduspace-link-head"><div><strong>Connect your EduSpace</strong><small>Connect this browser to your EduSpace learning centre with a one-time code.</small></div></div>
    <p id="eduSpaceConnectState" class="gb-eduspace-state" role="status">${eduSpaceStudentState.linked?'✅ EduSpace linked successfully.':eduSpaceStudentState.checked&&!eduSpaceStudentState.configured?'Integration not yet available. The administrator must configure both websites.':'Enter your one-time link code from EduSpace.'}</p>
    ${eduSpaceStudentState.linked?`<a class="btn btn-light" href="${escAttr(eduSpaceStudentState.returnUrl)}">Open EduSpace</a> <button class="btn btn-light" type="button" onclick="disconnectEduSpace()">Unlink this browser</button>`:`<div class="gb-eduspace-fields"><label class="sr-only" for="eduSpaceOneTimeCode">One-time link code</label><input id="eduSpaceOneTimeCode" maxlength="14" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="12-character link code" aria-describedby="eduSpaceConnectState"><button class="btn btn-primary" type="button" onclick="connectEduSpace()">Link EduSpace</button></div>`}
  </section>`;
}
async function refreshEduSpaceStudentStatus() {
  try {
    const result = await api('eduspace-status');
    eduSpaceStudentState = {checked:true,linked:!!result.linked,configured:!!result.configured,returnUrl:result.returnUrl||''};
  } catch { eduSpaceStudentState = {...eduSpaceStudentState,checked:true}; }
  const panel = document.querySelector('.gb-eduspace-link');
  if (panel) panel.outerHTML = eduSpaceLinkPanel();
}
async function connectEduSpace() {
  const input=document.getElementById('eduSpaceOneTimeCode');
  const code=String(input?.value||'').toUpperCase().replace(/\s/g,'');
  const status=document.getElementById('eduSpaceConnectState');
  if (!/^[A-Z0-9_-]{12}$/.test(code)) {if(status) status.textContent='Enter the 12-character code generated in your EduSpace Learning Centre.';return;}
  const button=document.querySelector('.gb-eduspace-fields button');
  if(button)button.disabled=true;
  if(status)status.textContent='Verifying your one-time code securely…';
  try {
    const response=await api('eduspace-connect',{method:'POST',body:{code}});
    eduSpaceStudentState={checked:true,linked:!!response.linked,configured:true,returnUrl:response.returnUrl||''};
    document.querySelector('.gb-eduspace-link').outerHTML=eduSpaceLinkPanel();
    toast('EduSpace linked successfully.');
  }catch(e){if(status)status.textContent=e.message||'Unable to connect EduSpace.';}
  finally{if(button)button.disabled=false;}
}
async function disconnectEduSpace(){
  const status=document.getElementById('eduSpaceConnectState');
  if(status)status.textContent='Disconnecting this browser…';
  try{
    await api('eduspace-disconnect',{method:'POST',body:{}});
    eduSpaceStudentState={...eduSpaceStudentState,checked:true,linked:false};
    const panel=document.querySelector('.gb-eduspace-link');if(panel)panel.outerHTML=eduSpaceLinkPanel();
    toast('EduSpace disconnected from this browser. Your learning records are unchanged.');
  }catch(e){if(status)status.textContent=e.message||'Unable to unlink this device.';}
}
function returnToCbtLibrary(){
 const library=new URLSearchParams(location.search).get('library');
 if(!library){toast('This assessment was not opened from a CBT Library.');return}
 location.assign(`${location.pathname}?library=${encodeURIComponent(library)}`);
}
function libraryReturnButton(){
 const library=new URLSearchParams(location.search).get('library');
 return library?`<button class="btn btn-light" onclick="returnToCbtLibrary()">← Return to CBT Library</button>`:'';
}
async function returnToEduSpace(){
  if(!eduSpaceStudentState.checked)await refreshEduSpaceStudentStatus();
  if (eduSpaceStudentState.returnUrl) {
    try {const url=new URL(eduSpaceStudentState.returnUrl);if(url.protocol==='https:') {location.assign(url.href);return;}}catch{}
  }
  toast('The administrator must configure the EduSpace website address to enable this return link.');
  exitStudent();
}
function studentIntro(){const q=state.studentQuiz;const schedulePhase=state.studentBiltz?'open':hubSchedulePhase(q.settings?.startAt,q.settings?.endAt);let saved=null;try{saved=JSON.parse(localStorage.getItem(`gb:last-result:${q.id}`)||'null');}catch{}const prior=saved?.result?.resultToken&&saved?.result?.score!==undefined&&saved?.result?.percent!==undefined&&q.result_released?`<div class="saved-result-notice"><div><strong>Your previous result is available</strong><span>${esc(scoreOverTotalLabel(saved.result.score,saved.result.total))} • ${percentLabel(saved.result.percent)}</span></div><a class="btn btn-light" href="${location.pathname}?resultToken=${encodeURIComponent(saved.result.resultToken)}">View Result</a></div>`:'';return `<div class="student-landing"><div class="student-card student-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><div class="gb-student-identity"><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><div><strong>GIFTED BRAINZ</strong><small>ASSESSMENT HUB · NO CRAMMING, JUST UNDERSTANDING</small></div></div><div class="gb-assessment-preview"><div class="gb-assessment-copy"><div class="eyebrow">${state.studentBiltz?'⚡ BRAINZ BILTZ CHALLENGE':'ONLINE ASSESSMENT'}</div><h1>${esc(q.title)}</h1><p class="student-description">${esc(q.description||'Online assessment')}</p></div></div><div class="premium-exam-badge"><span class="premium-exam-badge-mark" aria-hidden="true">✓</span><span>Secure assessment workspace</span><span class="premium-exam-badge-divider" aria-hidden="true"></span><span>Designed for focus</span></div><div class="student-summary"><div><span>Mode</span><b>${!state.studentBiltz&&q.settings?.assessmentMode==='study'?'Study · No timer':`${q.duration} min`}</b></div><div><span>Questions</span><b>${Number(state.studentBiltz?.question_count||q.question_count||q.questions.length)||0}</b></div><div><span>Pass mark</span><b>${q.pass_mark}%</b></div><div><span>Sections</span><b>${q.sections?.length||1}</b></div></div>${eduSpaceLinkPanel()}${prior}${!state.studentBiltz&&q.settings?.startAt?`<div class="hub-student-schedule ${schedulePhase}" role="status"><strong>${schedulePhase==='upcoming'?'⏳ This CBT has not opened yet':schedulePhase==='closed'?'This CBT has closed':'✅ This CBT is open'}</strong>${schedulePhase==='upcoming'?`<span>Opens in <b data-countdown-to="${escAttr(q.settings.startAt)}">${hubCountdownLabel(q.settings.startAt)}</b></span>`:''}<small>Opening: ${esc(formatDateTime(q.settings.startAt))}${q.settings?.endAt?' · Closing: '+esc(formatDateTime(q.settings.endAt)):''}</small></div>`:!state.studentBiltz&&q.settings?.endAt?`<div class="hub-student-schedule ${schedulePhase}" role="status"><strong>${schedulePhase==='closed'?'This CBT has closed':'✅ This CBT is open'}</strong><small>Closes ${esc(formatDateTime(q.settings.endAt))}</small></div>`:''}${new URLSearchParams(location.search).get('review')==='1'&&!saved?.result?.resultToken?'<div class="notice">No result was saved for this assessment on this browser. Complete the CBT to generate a result.</div>':''}<div class="student-actions">${schedulePhase==='open'?`<button class="btn btn-primary big start-assessment-btn" onclick="advanceStudentIntro()">${state.studentBiltz?'⚡ Continue to Brainz Biltz':'▶ Start Assessment'}</button>`:`<button class="btn btn-primary big start-assessment-btn" disabled>${schedulePhase==='upcoming'?'⏳ Waiting for scheduled opening':'Assessment closed'}</button>`}</div><a class="optional-channel-card" href="${WHATSAPP_CHANNEL}" target="_blank" rel="noopener" aria-label="Follow our WhatsApp Channel"><span class="optional-channel-icon" aria-hidden="true"><span>▦</span></span><span class="optional-channel-copy"><strong>Follow our WhatsApp Channel</strong><small>Tap here – get announcements, updates &amp; learning alerts instantly ✅</small></span><span class="optional-channel-arrow" aria-hidden="true">↗</span></a><div class="student-note"><span aria-hidden="true">ⓘ</span> Please make sure you have enough time to complete the assessment. Your answers will be saved as you progress.</div></div></div>`}function studentDetails(){
 const fields=state.studentQuiz.student_fields?.length?state.studentQuiz.student_fields:[{key:'full_name',label:'Full Name',type:'text',required:true,leaderboard:true}];
 const nameField=candidateNameField(fields),saved=candidateSavedName();
 const rows=fields.map(f=>{
   if(saved&&nameField?.key===f.key)return `<div class="candidate-remembered-name"><span>✓ Saved candidate name: <strong>${esc(saved)}</strong></span><button type="button" class="btn btn-light" onclick="changeCandidateName()">Change name</button></div>`;
   return `<div class="field"><label for="sf_${escAttr(f.key)}">${esc(f.label)} ${f.required?'<span class="required">*</span>':''}</label><input id="sf_${escAttr(f.key)}" type="${escAttr(f.type||'text')}" value="${escAttr(state.student?.[f.key]||'')}" placeholder="Enter ${escAttr(f.label).toLowerCase()}" ${f.required?'required':''}></div>`;
 }).join('');
 return `<div class="student-landing"><div class="student-card student-card-themed left"><div class="student-card-topbar">${studentThemeToggle()}</div><div class="step">STEP 1 OF 2</div><h1>Student details</h1><p class="sub">Choose the name you want displayed across your CBT assessments. Additional fields are requested only when needed by this test.</p><div class="student-form">${rows}</div>${!saved&&nameField?'<label class="candidate-save-choice"><input id="rememberCandidateName" type="checkbox" checked> Save my preferred name for future Gifted Brainz assessments on this browser</label>':''}<div class="toolbar end"><button class="btn btn-ghost" onclick="state.studentStage='intro';renderStudent()">Back</button><button class="btn btn-primary" onclick="continueStudentDetails()">Continue</button></div></div></div>`;
}
function continueStudentDetails(){
 const fields=state.studentQuiz.student_fields?.length?state.studentQuiz.student_fields:[{key:'full_name',label:'Full Name',type:'text',required:true}];
 const saved=candidateSavedName(),nameField=candidateNameField(fields),data={};
 for(const f of fields){const el=$(`#sf_${f.key}`);data[f.key]=el?.value?.trim()||((saved&&f.key===nameField?.key)?saved:'');if(f.required&&!data[f.key])return toast(`${f.label} is required.`);}
 if(nameField&&data[nameField.key]&&$('#rememberCandidateName')?.checked){storage.set(CANDIDATE_NAME_KEY,data[nameField.key]);}
 state.student=data;state.studentSkippedDetails=false;state.studentStage='instructions';renderStudent();
}

function studentInstructions(){const q=state.studentQuiz;return `<div class="student-landing"><div class="student-card student-card-themed left"><div class="student-card-topbar">${studentThemeToggle()}</div><div class="step">STEP 2 OF 2</div><h1>Instructions</h1><div class="instructions-box">${esc(q.instructions||'Read each question carefully and select the best answer. You may move between sections during the CBT. Your answers are saved as you progress.')}</div><div class="rules"><div><b>Mode:</b> ${!state.studentBiltz&&q.settings?.assessmentMode==='study'?'Study Mode (untimed)':`Practice Mode · ${q.duration} minutes`}</div><div><b>Questions:</b> ${Number(state.studentBiltz?.question_count||q.question_count||q.questions.length)||0}</div><div><b>Navigation:</b> You can move between sections and return to unanswered questions.</div><div><b>Submission:</b> ${!state.studentBiltz&&q.settings?.assessmentMode==='study'?'Submit when you finish. Feedback appears after each answer.':'The CBT submits automatically when the timer reaches zero.'}</div>${!state.studentBiltz&&q.settings?.assessmentMode==='study'?'':`<div><b>Exam security:</b> Switching away from the exam screen ${TAB_SWITCH_LIMIT} times will automatically submit your CBT.</div>`}</div><div class="toolbar end"><button class="btn btn-ghost" onclick="state.studentStage=state.studentSkippedDetails?'intro':'details';renderStudent()">Back</button><button class="btn btn-primary" onclick="beginStudentTest()">${state.studentBiltz?'⚡ Begin Brainz Biltz':'Begin CBT'}</button></div></div></div>`}
function studentQuestions(){
  const qs=state.studentQuiz.questions||[];
  const firstId=(state.studentQuiz.sections||[])[0]?.id||'';
  const filtered=state.studentSection?qs.filter(q=>(q.section_id||firstId)===state.studentSection):qs;
  // Keep shared-passage questions together even if an older cached/public payload
  // was not grouped by the API.
  const blocks=[],by=new Map();
  for(const q of filtered){
    const key=q.passage?.id?`p:${q.passage.id}`:'';
    if(key){if(!by.has(key)){const block=[];by.set(key,block);blocks.push(block);}by.get(key).push(q);}else blocks.push([q]);
  }
  blocks.forEach(b=>b.sort((a,c)=>(Number(a.position)||0)-(Number(c.position)||0)));
  return blocks.flat();
}
function currentStudentQuestion(){return studentQuestions()[state.studentIndex]||null}
async function loadStudentQuestionImage(questionId){
  const q=state.studentQuiz?.questions?.find(x=>x.id===questionId);
  if(!q||!q.image_available||state.studentImageCache[questionId]||state.studentImagePending.has(questionId)||state.studentImageFailed.has(questionId))return;
  state.studentImagePending.add(questionId);
  try{
    const r=await api('question-media',{query:{quizId:state.studentQuiz.id,questionId,biltz:state.studentBiltz?.slug||'',attemptId:state.studentAttemptId||''}});
    const src=safeImageSrc(r.image_data);
    if(src){
      state.studentImageCache[questionId]=src;
      // Persist the resolved source on the public question object as well so every
      // subsequent student re-render (answer, navigation, theme switch, etc.)
      // keeps the diagram visible instead of losing it to a fresh HTML render.
      q.image_data=src;
    }else{
      state.studentImageFailed.add(questionId);
    }
  }catch(error){
    state.studentImageFailed.add(questionId);
    console.warn('Question image unavailable',error);
  }finally{
    state.studentImagePending.delete(questionId);
    if(state.studentQuiz?.questions?.some(x=>x.id===questionId))renderStudent();
  }
}

// Preserve author-supplied line breaks. Only recognise a Roman-numeral list if
// at least two consecutive enumerators occur; ordinary uses of "I" stay prose.
function questionStemHtml(text){
  const raw=String(text??'').replace(/\r\n?/g,'\n').trim();
  const markers=[...raw.matchAll(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s+(?=\S)/g)];
  const ordinal=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  if(markers.length<2 || markers[0][1]!=='I' || !markers.every((m,i)=>ordinal.indexOf(m[1])===i))return mathHtml(raw);
  const start=markers[0].index;
  const intro=raw.slice(0,start).trim();
  const items=markers.map((m,i)=>({roman:m[1],value:raw.slice(m.index+m[0].length,i+1<markers.length?markers[i+1].index:raw.length).trim()}));
  if(items.some(x=>!x.value))return mathHtml(raw);
  return `${intro?`<div class="gb-question-intro">${mathHtml(intro)}</div>`:''}<div class="gb-roman-list" role="list" aria-label="Numbered statements">${items.map(item=>`<div class="gb-roman-item" role="listitem"><span class="gb-roman-number">${item.roman}.</span><span>${mathHtml(item.value)}</span></div>`).join('')}</div>`;
}
function passageParagraphsHtml(text){
  const paragraphs=String(text??'').replace(/\r\n?/g,'\n').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  return paragraphs.map(par=>`<p>${mathHtml(par)}</p>`).join('');
}
const GB_CALCULATOR_ICON='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2.5" width="16" height="19" rx="2.4"/><rect x="7" y="5.5" width="10" height="4.5" rx="1"/><path d="M7.5 13.3h1m3.5 0h1m3.5 0h1M7.5 17.2h1m3.5 0h1m3.5 0h1"/></svg>';
function calculatorToolButton(){return `<button class="gb-exam-tool gb-calculator-toggle" type="button" onclick="toggleCalculator()" aria-label="Open calculator" title="Calculator">${GB_CALCULATOR_ICON}<span>Calculator</span></button>`;}
function studentQuestionPassage(q){
  const p=q?.passage?.content?q.passage:(q?.passage_content?{title:q.passage_title||'Comprehension Passage',content:q.passage_content}:null);
  if(p?.content)return `<section class="passage-box reading-passage" role="region" aria-label="Comprehension passage"><h3>📖 ${esc(p.title||'Comprehension Passage')}</h3><div class="reading-passage-content">${passageParagraphsHtml(p.content)}</div></section>`;
  if(q?.type==='passage'||q?.passage_id)return `<div class="extract-warning" role="alert">The reading passage linked to this question is unavailable. Please notify the administrator.</div>`;
  return '';
}
function studentPassageIsOpen(open){state.studentPassageOpen=Boolean(open)}
function toggleExamNavigator(open){
  const shell=document.querySelector('.gb-exam-workspace');
  if(!shell)return;
  const next=typeof open==='boolean'?open:!shell.classList.contains('gb-exam-navigator-open');
  shell.classList.toggle('gb-exam-navigator-open',next);
  const button=document.querySelector('.gb-exam-question-toggle');
  if(button)button.setAttribute('aria-expanded',String(next));
  const aside=document.querySelector('.gb-exam-navigator');
  if(aside)aside.setAttribute('aria-hidden',String(!next&&window.matchMedia('(max-width: 860px)').matches));
}
function isOrdinaryStudyMode(){return !state.studentBiltz && state.studentQuiz?.settings?.assessmentMode==='study';}
function studyCorrectOption(q,feedback,i){return Number(q.optionMap?.[i]??i)===Number(feedback?.correctAnswer)}
function studyCorrectDisplayLetter(q,feedback){const j=(q.optionMap||[0,1,2,3]).indexOf(Number(feedback?.correctAnswer));return String.fromCharCode(65+Math.max(0,j));}
function studentTest(){
  const qz=state.studentQuiz;
  const studyMode=isOrdinaryStudyMode();
  const qs=studentQuestions();
  const q=currentStudentQuestion();
  if(!q)return `<div class="student-empty"><div><h2>This section has no questions.</h2><p class="sub">Choose another section to continue.</p></div></div>`;
  const secList=[...(qz.sections||[])].map(s=>({...s,question_count:qz.questions.filter(x=>x.section_id===s.id).length}));
  const allIndex=qz.questions.findIndex(x=>x.id===q.id);
  const answeredCount=qs.filter(x=>state.studentAnswers[x.id]!==undefined).length;
  const flaggedCount=qs.filter(x=>state.studentFlags.has(x.id)).length;
  const sectionProgress=qs.length?Math.round(answeredCount*100/qs.length):0;
  const imageSrc=safeImageSrc(q.image_data)||safeImageSrc(state.studentImageCache[q.id]);
  const imageMarkup=imageSrc
    ? `<figure class="question-figure"><img class="question-image" src="${escAttr(imageSrc)}" alt="Question diagram or illustration" loading="eager" decoding="async"></figure>`
    : q.image_available
      ? `<div class="question-image-loading" role="status"><span class="question-image-spinner" aria-hidden="true">◌</span><span>${state.studentImageFailed.has(q.id)?'Diagram could not be loaded.':'Loading question diagram…'}</span></div>`
      : '';
  const tabSwitchOverlay=!studyMode&&state.tabSwitchPending?`<div class="tab-switch-overlay" role="dialog" aria-modal="true" aria-labelledby="tabSwitchTitle"><div class="tab-switch-dialog"><div class="tab-switch-icon" aria-hidden="true">⚠️</div><div class="eyebrow">Exam security notice</div><h2 id="tabSwitchTitle">You left the exam screen</h2><p>You switched away from the CBT. This is violation ${Math.min(TAB_SWITCH_LIMIT,state.violations)} of ${TAB_SWITCH_LIMIT}. A third switch automatically submits the CBT.</p><div class="tab-switch-choice"><div><strong>Return to the exam</strong><span>Continue this attempt and keep your answers and timer.</span></div><button class="btn btn-primary" type="button" onclick="resumeStudentAfterTabSwitch()">Return to Exam</button></div><div class="tab-switch-choice danger"><div><strong>Forfeit the exam</strong><span>End this attempt now and submit it with the answers recorded so far.</span></div><button class="btn btn-danger" type="button" onclick="forfeitStudentAfterTabSwitch()">Forfeit Exam</button></div><p class="tab-switch-footnote">This tab-switch event has been recorded for the attempt.</p></div></div>`:'';
  const pMarkup=studentQuestionPassage(q);
  const readablePassage=Boolean(q?.passage?.content||q?.passage_content);
  const missingPassage=!readablePassage?pMarkup:'';
  const passageDesktop=readablePassage?`<section class="gb-exam-passage-desktop" aria-label="Reading passage">${pMarkup}</section>`:'';
  const passageMobile=readablePassage?`<details class="gb-exam-passage-mobile" ${state.studentPassageOpen?'open':''} ontoggle="studentPassageIsOpen(this.open)"><summary><span>📖 Reading passage</span><span class="gb-passage-hint">Tap to read</span></summary>${pMarkup}</details>`:'';
  const questionNavigator=`<aside class="navigator gb-exam-navigator" id="gbExamNavigator" aria-label="Question navigator"><div class="gb-navigator-heading"><div><div class="navigator-title">Questions</div><small>Jump to any question</small></div><button class="gb-close-navigator" type="button" onclick="toggleExamNavigator(false)" aria-label="Close question navigator">×</button></div><div class="navigator-overview"><strong>${answeredCount}<span> / ${qs.length}</span></strong><small>Answered in this section</small></div><div class="navigator-progress-track"><span style="width:${sectionProgress}%"></span></div><div class="navigator-flags">${flaggedCount?`${flaggedCount} flagged for review`:'No questions flagged'}</div><div class="legend"><span><i class="dot answered"></i> Answered</span><span><i class="dot flag"></i> Flagged</span><span><i class="dot current"></i> Current</span></div><div class="nav-grid">${qs.map((x,i)=>`<button type="button" class="qdot ${i===state.studentIndex?'current':''} ${state.studentAnswers[x.id]!==undefined?'answered':''} ${state.studentFlags.has(x.id)?'flag':''}" aria-label="Question ${i+1}${state.studentAnswers[x.id]!==undefined?' answered':' unanswered'}${state.studentFlags.has(x.id)?' flagged':''}" ${i===state.studentIndex?'aria-current="step"':''} onclick="goStudent(${i})">${i+1}</button>`).join('')}</div><button class="btn btn-primary wide gb-aside-submit" type="button" onclick="confirmSubmit()">Submit Examination</button></aside>`;
  return `<div class="cbt-shell gb-exam-workspace"><header class="cbt-header gb-exam-header"><div class="cbt-brand"><img src="assets/icon.png" alt="Gifted Brainz"><div><b>GIFTED BRAINZ</b><small>ASSESSMENT HUB</small></div></div><div class="gb-exam-header-progress"><span>Exam progress</span><strong>${answeredCount} / ${qs.length} answered</strong></div><div class="cbt-tools">${studyMode?'<span class="gb-study-no-timer">Study Mode · No timer</span>':`<div class="timer" id="studentTimer" role="timer" aria-label="Time remaining" ${state.timeLeft<=60?'data-urgent="true"':''}>${fmt(state.timeLeft)}</div>`}${calculatorToolButton()}<button class="gb-exam-tool gb-exam-question-toggle" type="button" onclick="toggleExamNavigator()" aria-controls="gbExamNavigator" aria-expanded="false">▦ <span>Questions</span></button></div></header>${studyMode?'':`<div class="tab-warning-banner gb-exam-security" role="status"><span class="warning-icon">ⓘ</span><span>Remain on the examination screen. Switching tabs ${TAB_SWITCH_LIMIT} times automatically submits your CBT.</span><span class="warning-note">${state.violations}/${TAB_SWITCH_LIMIT} warnings</span></div>`}${secList.length>1?`<nav class="section-tabs gb-exam-sections" aria-label="CBT sections">${secList.map(s=>{const count=Number(s.question_count)||qz.questions.filter(x=>x.section_id===s.id).length;return `<button class="section-tab ${state.studentSection===s.id?'active':''}" ${count?'':'disabled'} onclick="switchStudentSection('${s.id}')">${esc(s.title)}</button>`}).join('')}</nav>`:''}<main class="cbt-body gb-exam-body"><div class="gb-exam-content ${pMarkup?'gb-exam-has-passage':''}">${passageDesktop}<section class="question-main gb-exam-question" aria-label="Examination question"><div class="question-top gb-exam-question-meta"><span>QUESTION ${allIndex+1} OF ${qz.questions.length}</span><span class="question-progress-caption">${answeredCount} of ${qs.length} answered</span></div><div class="question-progress-bar" role="progressbar" aria-label="Questions answered in this section" aria-valuemin="0" aria-valuemax="${qs.length}" aria-valuenow="${answeredCount}"><span style="width:${sectionProgress}%"></span></div>${passageMobile}${missingPassage}${imageMarkup}<div class="question-text">${questionStemHtml(q.text)}</div><div class="gb-exam-answer-list" role="radiogroup" aria-label="Answer options">${q.options.map((o,i)=>`<label class="cbt-option ${isStudentOptionSelected(q,i)?'selected':''} ${studyMode&&state.studentStudyFeedback?.[q.id]?(studyCorrectOption(q,state.studentStudyFeedback[q.id],i)?'study-correct':isStudentOptionSelected(q,i)?'study-wrong':''):''}"><input type="radio" name="studentAnswer" ${isStudentOptionSelected(q,i)?'checked':''} ${studyMode&&(state.studentStudyFeedback?.[q.id]||state.studentStudyPending?.has(q.id))?'disabled':''} onchange="chooseStudentAnswer('${q.id}',${i})"><span class="gb-answer-letter" aria-hidden="true">${String.fromCharCode(65+i)}</span><span class="gb-answer-text">${mathHtml(o)}</span></label>`).join('')}</div>${studyMode&&state.studentStudyFeedback?.[q.id]?`<div class="gb-study-feedback ${state.studentStudyFeedback[q.id].isCorrect?'gb-study-good':'gb-study-needs-work'}" role="status"><strong>${state.studentStudyFeedback[q.id].isCorrect?'Correct answer!':'Review the correct answer'}</strong><p>The correct answer is ${studyCorrectDisplayLetter(q,state.studentStudyFeedback[q.id])}.</p>${state.studentStudyFeedback[q.id].explanation?`<div>${mathHtml(state.studentStudyFeedback[q.id].explanation)}</div>`:''}</div>`:studyMode?`<p class="gb-study-hint">Choose an option to see the answer and explanation.</p>`:''}<div class="cbt-nav gb-exam-actions"><button type="button" class="btn btn-ghost" onclick="prevStudent()" ${state.studentIndex===0?'disabled':''}>← Previous</button><button type="button" class="btn btn-light gb-mark-review" onclick="toggleFlag('${q.id}')">${state.studentFlags.has(q.id)?'★ Marked for Review':'☆ Mark for Review'}</button>${state.studentIndex===qs.length-1?`<button class="btn btn-primary" type="button" onclick="confirmSubmit()">Submit Examination</button>`:`<button class="btn btn-primary" type="button" onclick="nextStudent()">Next →</button>`}</div></section></div>${questionNavigator}</main><button class="gb-exam-nav-backdrop" type="button" aria-label="Close question navigator" onclick="toggleExamNavigator(false)"></button><div id="calculatorRoot"></div>${tabSwitchOverlay}</div>`;
}

function toggleCalculator(){
 const root=$('#calculatorRoot');if(!root)return;
 if(root.innerHTML){root.innerHTML='';return;}
 const keys=['C','⌫','(',')','7','8','9','÷','4','5','6','×','1','2','3','−','0','.','=','+'];
 root.innerHTML=`<section class="calculator gb-pro-calculator" role="dialog" aria-label="Exam calculator"><div class="q-head"><b>Calculator</b><button type="button" class="mini" onclick="toggleCalculator()" aria-label="Close calculator">×</button></div><input id="calcDisplay" class="calc-display" value="0" aria-label="Calculator display" readonly><div class="calc-grid">${keys.map(k=>`<button type="button" class="${'÷×−+'.includes(k)?'op':''} ${k==='='?'equals':''}" aria-label="${k==='⌫'?'Backspace':k==='C'?'Clear':k}" onclick="calcPress('${k}')">${k}</button>`).join('')}</div></section>`;
}
function safeCalculate(expression){
 const expr=String(expression).replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replace(/\s/g,'');
 if(!/^[0-9+*/().-]+$/.test(expr)||expr.length>150)throw Error('Invalid expression');
 let i=0;const peek=()=>expr[i]||'';
 function primary(){if(peek()==='+'||peek()==='-'){const sign=expr[i++];const v=primary();return sign==='-'?-v:v;}if(peek()==='('){i++;const value=add();if(peek()!==')')throw Error('Unclosed bracket');i++;return value;}const match=expr.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!match)throw Error('Invalid number');i+=match[0].length;return Number(match[0]);}
 function multiply(){let value=primary();while(peek()==='*'||peek()==='/'){const op=expr[i++],other=primary();value=op==='*'?value*other:value/other;}return value;}
 function add(){let value=multiply();while(peek()==='+'||peek()==='-'){const op=expr[i++],other=multiply();value=op==='+'?value+other:value-other;}return value;}
 const value=add();if(i!==expr.length||!Number.isFinite(value))throw Error('Invalid expression');return Number(value.toPrecision(12)).toString();
}
function calcPress(key){
 const field=$('#calcDisplay');if(!field)return;let value=field.value||'0';
 if(key==='C'){field.value='0';return;}
 if(key==='⌫'){field.value=value.length>1?value.slice(0,-1):'0';return;}
 if(key==='='){try{field.value=safeCalculate(value)}catch{field.value='Error'}return;}
 if(value==='Error')value='0';
 if(/^\d$/.test(key)){field.value=value==='0'?key:value+key;return;}
 if(key==='.'){const activeNumber=value.match(/(?:^|[+−×÷(])(-?\d*\.?\d*)$/)?.[1]||'';if(activeNumber.includes('.'))return;field.value=value==='0'?'0.':/[+−×÷(]$/.test(value)?value+'0.':value+'.';return;}
 if(['+','−','×','÷'].includes(key)){if(/[+−×÷]$/.test(value))value=value.slice(0,-1);field.value=value+key;return;}
 if(key==='('){field.value=value==='0'?key:value+key;return;}
 if(key===')'){field.value=value+key;}
}

function isStudentOptionSelected(q,displayIndex){
  const chosen=state.studentAnswers[q.id];
  return chosen!==null&&chosen!==undefined&&Number(chosen)===(Array.isArray(q.optionMap)?q.optionMap[displayIndex]:displayIndex);
}
async function chooseStudentAnswer(id,i){
  const q=state.studentQuiz?.questions?.find(x=>x.id===id);
  if(!q||!Number.isInteger(i)||i<0||i>3)return toast('This answer could not be recorded. Please reload the question.');
  const map=q.optionMap;
  if(map&&(!Array.isArray(map)||map.length!==4||new Set(map).size!==4||map.some(v=>!Number.isInteger(v)||v<0||v>3)))return toast('Question options are inconsistent. Please reload the assessment.');
  if(typeof isOrdinaryStudyMode==='function' && isOrdinaryStudyMode()){
    if(state.studentStudyFeedback?.[id]||state.studentStudyPending?.has(id))return;
    state.studentStudyPending=state.studentStudyPending||new Set();state.studentStudyPending.add(id);
    const canonical=map?map[i]:i;
    state.studentAnswers[id]=canonical;
    persistStudentProgress(true);
    renderStudent();
    try{
      const feedback=await api('attempt-study-feedback',{method:'POST',body:{attemptId:state.studentAttemptId,attemptToken:state.studentAttemptToken,quizId:state.studentQuiz.id,deviceId:getDeviceId(),questionId:id,selectedAnswer:canonical}});
      state.studentStudyFeedback=state.studentStudyFeedback||{};state.studentStudyFeedback[id]=feedback;
      persistStudentProgress(true);
    }catch(error){delete state.studentAnswers[id];toast(error.message||'Could not retrieve the explanation. Please retry.');}
    finally{state.studentStudyPending.delete(id);renderStudent();}
    return;
  }
  state.studentAnswers[id]=map?map[i]:i; // Always submit canonical original-option index.
  const previousScroll=typeof window==='undefined'?null:window.scrollY;
  persistStudentProgress(true);renderStudent();
  if(previousScroll!==null&&typeof requestAnimationFrame==='function')requestAnimationFrame(()=>window.scrollTo({top:previousScroll,behavior:'instant'}));
}
function switchStudentSection(id){if(id===state.studentSection)return;state.studentSectionIndexes[state.studentSection||'__all__']=state.studentIndex;state.studentSection=id;state.studentIndex=state.studentSectionIndexes[id||'__all__']||0;persistStudentProgress(true);renderStudent()}
function goStudent(i){state.studentIndex=Math.max(0,Math.min(i,Math.max(0,studentQuestions().length-1)));state.studentSectionIndexes[state.studentSection||'__all__']=state.studentIndex;persistStudentProgress(true);renderStudent()}
function nextStudent(){const qs=studentQuestions();if(state.studentIndex<qs.length-1){state.studentIndex++;state.studentSectionIndexes[state.studentSection||'__all__']=state.studentIndex;persistStudentProgress(true);renderStudent()}}
function prevStudent(){if(state.studentIndex>0){state.studentIndex--;state.studentSectionIndexes[state.studentSection||'__all__']=state.studentIndex;persistStudentProgress(true);renderStudent()}}
function toggleFlag(id){state.studentFlags.has(id)?state.studentFlags.delete(id):state.studentFlags.add(id);persistStudentProgress(true);renderStudent()}
async function confirmSubmit(){if(state.submitting)return;const questions=state.studentQuiz?.questions||[];const answered=questions.filter(q=>state.studentAnswers[q.id]!==undefined).length;const flags=questions.filter(q=>state.studentFlags.has(q.id)).length;const message=`You answered ${answered} of ${questions.length} questions.${questions.length-answered?` ${questions.length-answered} remain unanswered.`:''}${flags?` ${flags} flagged for review.`:''} You cannot change answers after submission.`;if(await appConfirm('Review before submission',message,'Submit CBT'))submitStudent(false,false)}
function onVisibilityChange(){
  if(document.hidden&&state.studentStage==='test'&&state.studentAttemptId&&!state.submitting&&!state.tabSwitchPending&&!state.autoSubmitQueued){
    state.violations=Math.min(TAB_SWITCH_LIMIT,(state.violations||0)+1);
    if(state.violations>=TAB_SWITCH_LIMIT){
      state.tabSwitchPending=false;
      state.autoSubmitQueued=true;
      clearInterval(state.timer);
      submitStudent(true,true);
      return;
    }
    state.tabSwitchPending=true;
  }else if(!document.hidden&&state.studentStage==='test'){
    if(state.autoSubmitQueued&&!state.submitting){
      submitStudent(true,true);
      return;
    }
    if(state.tabSwitchPending)renderStudent();
  }
}
function resumeStudentAfterTabSwitch(){
  if(state.studentStage!=='test')return;
  state.tabSwitchPending=false;
  renderStudent();
}
function forfeitStudentAfterTabSwitch(){
  if(state.studentStage!=='test'||state.submitting)return;
  state.tabSwitchPending=false;
  clearInterval(state.timer);
  state.autoSubmitQueued=true;
  submitStudent(true,true);
}
function attachStudentGuard(){detachStudentGuard();document.addEventListener('visibilitychange',onVisibilityChange);}
function detachStudentGuard(){document.removeEventListener('visibilitychange',onVisibilityChange);}
async function beginStudentTest(){
  const phase=state.studentBiltz?'open':hubSchedulePhase(state.studentQuiz?.settings?.startAt,state.studentQuiz?.settings?.endAt);
  if(phase!=='open'){state.studentStage='intro';renderStudent();return toast(phase==='upcoming'?'This CBT has not opened yet.':'This CBT is closed.');}

  try{
    if(state.studentAttemptId)return;
    const isBiltz=Boolean(state.studentBiltz?.slug);
    let sections=Array.isArray(state.studentQuiz?.sections)?state.studentQuiz.sections:[];
    let questions=Array.isArray(state.studentQuiz?.questions)?state.studentQuiz.questions:[];
    if(!sections.length)return toast('This CBT has no sections and cannot be started.');
    if(!isBiltz&&!questions.length)return toast('This CBT has no questions and cannot be started.');
    if(isBiltz&&Number(state.studentBiltz?.question_count||state.studentQuiz?.question_count||0)<1)return toast('This challenge has no available questions. Please contact the administrator.');
    state.studentSection=sections[0]?.id||null;
    if(!isBiltz&&!studentQuestions().length){
      const fallback=sections.find(sec=>questions.some(q=>String(q.section_id||'')===String(sec.id)));
      if(fallback)state.studentSection=fallback.id;
    }
    if(!isBiltz&&!studentQuestions().length)return toast('This CBT has no questions in its sections and cannot be started.');
    const r=await api('attempt-start',{method:'POST',body:{quizId:state.studentQuiz.id,studentName:leaderboardName({student_name:state.student?.full_name}),studentData:state.student,deviceId:getDeviceId(),challengeSlug:state.studentBiltz?.slug||''}});
    state.studentAttemptId=r.attempt.id;state.studentAttemptToken=r.attempt.token;state.studentAttemptNumber=Number(r.attempt.attemptNumber)||1;state.studentMaxAttempts=r.attempt.maxAttempts===null?null:(Number(r.attempt.maxAttempts)||1);state.startedAt=r.attempt.startedAt;state.timeLeft=Number(r.attempt.duration)*60;state.studentAnswers={};state.studentFlags=new Set();state.studentIndex=0;state.studentSectionIndexes={};state.violations=0;state.autoSubmitQueued=false;state.tabSwitchPending=false;state.submitting=false;state.studentProgressLastSaved=0;
    if(isBiltz){
      if(!r.quiz||!Array.isArray(r.quiz.questions)||!r.quiz.questions.length){state.studentStage='test';persistStudentProgress(true);state.studentStage='instructions';toast('The challenge attempt was saved. Refreshing to recover the question set.');location.reload();return;}
      state.studentQuiz=r.quiz;sections=Array.isArray(r.quiz.sections)?r.quiz.sections:[];questions=Array.isArray(r.quiz.questions)?r.quiz.questions:[];
      if(!sections.length||!questions.length){state.studentStage='test';persistStudentProgress(true);state.studentStage='instructions';toast('The challenge attempt was saved. Refreshing to recover the question set.');location.reload();return;}
      state.studentSection=sections[0]?.id||null;
      if(!studentQuestions().length){const fallback=sections.find(sec=>questions.some(q=>String(q.section_id||'')===String(sec.id)));if(fallback)state.studentSection=fallback.id;}
      if(!studentQuestions().length){state.studentStage='test';persistStudentProgress(true);state.studentStage='instructions';toast('The challenge attempt was saved. Refreshing to recover the question set.');location.reload();return;}
    }
    state.studentStage='test';state.studentStudyFeedback={};state.studentStudyPending=new Set();state.studentImageCache={};state.studentImagePending=new Set();state.studentImageFailed=new Set();persistStudentProgress(true);if(!isOrdinaryStudyMode()){startTimer();attachStudentGuard();}renderStudent();
  }catch(e){toast(e.message)}
}
function startTimer(){clearInterval(state.timer);state.timer=setInterval(()=>{state.timeLeft--;persistStudentProgress();if(state.timeLeft<=0){clearInterval(state.timer);submitStudent(true);}else{const timer=$('#studentTimer');if(timer){timer.textContent=fmt(state.timeLeft);timer.classList.toggle('urgent',state.timeLeft<=60);timer.classList.toggle('timer-notice',state.timeLeft>60&&state.timeLeft<=300);timer.setAttribute('aria-label',`${fmt(state.timeLeft)} remaining`);}}},1000)}
function pendingSubmitKey(quizId){return `gb:pending-submit:${quizId}`;}
function activeProgressKey(quizId,challengeSlug=''){return `gb:active-progress:${quizId}:${encodeURIComponent(challengeSlug||'standard')}`;}
function clearActiveStudentProgress(quizId,challengeSlug=''){try{if(quizId)localStorage.removeItem(activeProgressKey(quizId,challengeSlug));}catch{}}
function persistStudentProgress(force=false){
  if(!state.studentQuiz||!state.studentAttemptId||!state.studentAttemptToken||state.studentStage!=='test')return;
  const now=Date.now();if(!force&&now-Number(state.studentProgressLastSaved||0)<4000)return;
  state.studentProgressLastSaved=now;
  const slug=state.studentBiltz?.slug||state.studentBiltzSlug||'';
  const payload={quizId:state.studentQuiz.id,quizSlug:state.studentQuiz.slug,attemptId:state.studentAttemptId,attemptToken:state.studentAttemptToken,attemptNumber:state.studentAttemptNumber,studentData:state.student,answers:state.studentAnswers||{},studyFeedback:state.studentStudyFeedback||{},flags:[...(state.studentFlags||[])],section:state.studentSection,sectionIndexes:state.studentSectionIndexes||{},index:state.studentIndex||0,violations:state.violations||0,startedAt:state.startedAt,durationSeconds:isOrdinaryStudyMode()?7*24*60*60:Math.max(60,Number(state.studentQuiz.duration)||1)*60,challengeSlug:slug,savedAt:now};
  try{localStorage.setItem(activeProgressKey(state.studentQuiz.id,slug),JSON.stringify(payload));}catch{}
}
async function submitStudent(auto,antiCheat=false){
  if(state.submitting||!state.studentAttemptId||!state.studentQuiz)return;
  state.lastSubmitAuto=auto;
  state.submitting=true;state.submitError=null;clearInterval(state.timer);
  state.studentStage='submitting';
  // Persist everything needed to finish this submission before the network call, so a
  // closed tab, crash or lost connection does not strand the attempt as unsubmitted: the
  // student (or this page, on reload) can safely retry the exact same attempt later.
  try{localStorage.setItem(pendingSubmitKey(state.studentQuiz.id),JSON.stringify({quizId:state.studentQuiz.id,quizSlug:state.studentQuiz.slug,attemptId:state.studentAttemptId,attemptToken:state.studentAttemptToken,answers:state.studentAnswers,violations:state.violations,auto,studentName:state.student?.full_name||'Student',studentData:state.student,challengeSlug:state.studentBiltz?.slug||state.studentBiltzSlug||'',savedAt:Date.now()}));}catch{}clearActiveStudentProgress(state.studentQuiz.id,state.studentBiltz?.slug||state.studentBiltzSlug||'');
  if(!antiCheat||!document.hidden)renderStudent();
  try{
    const r=await api('attempt',{method:'POST',body:{attemptId:state.studentAttemptId,attemptToken:state.studentAttemptToken,quizId:state.studentQuiz.id,deviceId:getDeviceId(),studentName:leaderboardName({student_name:state.student?.full_name}),studentData:state.student,answers:state.studentAnswers,autoSubmitted:auto,violations:state.violations,challengeSlug:state.studentBiltz?.slug||''}});
    state.autoSubmitQueued=false;state.submitting=false;state.submitError=null;state.submitRetryCount=0;state.studentResult=r.attempt;
    try{localStorage.removeItem(pendingSubmitKey(state.studentQuiz.id));localStorage.setItem(`gb:last-result:${state.studentQuiz.id}`,JSON.stringify({quizSlug:state.studentQuiz.slug,result:r.attempt,savedAt:Date.now()}));}catch{}clearActiveStudentProgress(state.studentQuiz.id,state.studentBiltz?.slug||state.studentBiltzSlug||'');
    state.studentStage='result';detachStudentGuard();renderStudent();
  }catch(e){
    state.submitting=false;
    const msg=e.message||'Submission failed. Please check your internet connection and try again.';
    state.submitError=msg;
    // A dead/expired session cannot be fixed by retrying the same request, so stop looping
    // and let the student start over instead of hammering the server forever.
    const sessionDead=/invalid or has expired|attempt not found|has been removed/i.test(msg);
    state.submitRetryCount=(state.submitRetryCount||0)+1;
    if(antiCheat)state.autoSubmitQueued=true;
    if(!antiCheat||!document.hidden)renderStudent();
    // Retry automatically a few times with a short backoff before asking the student to tap
    // "Try Again" themselves — most failures here are a brief network hiccup, not a dead
    // connection, and the attempt must not sit unsubmitted (and so missing from the
    // leaderboard) just because one request failed.
    if(!sessionDead&&state.submitRetryCount<=4){
      const delay=Math.min(20000,1500*state.submitRetryCount);
      setTimeout(()=>{if(state.studentAttemptId&&state.studentStage==='submitting'&&!state.submitting)submitStudent(auto,antiCheat);},delay);
    }
  }
}
function retrySubmitStudent(){if(state.submitting||!state.studentAttemptId)return;state.submitRetryCount=0;submitStudent(state.lastSubmitAuto,false);}
async function abandonStuckSubmission(){
  if(!await appConfirm('Start over?','This clears the stuck submission on this device and lets you begin a fresh attempt. Only do this if retrying keeps failing.','Start Over'))return;
  try{if(state.studentQuiz)localStorage.removeItem(pendingSubmitKey(state.studentQuiz.id));}catch{}if(state.studentQuiz)clearActiveStudentProgress(state.studentQuiz.id,state.studentBiltz?.slug||state.studentBiltzSlug||'');
  state.studentAttemptId=null;state.studentAttemptToken=null;state.studentAnswers={};state.studentFlags=new Set();state.violations=0;state.submitError=null;state.submitRetryCount=0;state.submitting=false;state.autoSubmitQueued=false;state.studentStage='intro';renderStudent();
}
async function submitStudentFeedback(){
  if(state.studentFeedbackSending||state.studentFeedbackSubmitted)return;
  const category=$('#studentFeedbackCategory')?.value||'general';
  const message=$('#studentFeedbackMessage')?.value.trim()||'';
  const contact=$('#studentFeedbackContact')?.value.trim()||'';
  if(message.length<8)return toast('Please enter a little more detail so we can understand the issue.');
  state.studentFeedbackSending=true;
  try{
    await api('feedback-submit',{method:'POST',body:{quizId:state.studentQuiz?.id||'',attemptId:state.studentAttemptId||null,attemptToken:state.studentAttemptToken||null,challengeSlug:state.studentBiltz?.slug||state.studentBiltzSlug||'',deviceId:getDeviceId(),studentName:state.student?.full_name||state.studentResult?.student_name||'Student',category,message,contact}});
    state.studentFeedbackSubmitted=true;
    toast('Thank you. Your feedback has been submitted.');
    renderStudent();
  }catch(e){toast(e.message||'Could not submit feedback. Please try again.');}
  finally{state.studentFeedbackSending=false;}
}
function studentFeedbackPanel(){
  if(state.studentFeedbackSubmitted)return `<section class="student-feedback-panel submitted" aria-live="polite"><div class="feedback-success-icon">✓</div><div><h3>Thank you for your feedback</h3><p>Your comments have been received by the Gifted Brainz team.</p></div></section>`;
  return `<section class="student-feedback-panel" aria-labelledby="studentFeedbackTitle"><div class="student-feedback-head"><div class="feedback-icon">💬</div><div><div class="eyebrow">HELP US IMPROVE</div><h2 id="studentFeedbackTitle">Complaint or feedback about this mock test?</h2><p>Tell us what went wrong, what needs correction, or what you would like improved.</p></div></div><div class="feedback-form-grid"><div class="field"><label for="studentFeedbackCategory">What would you like to report?</label><select id="studentFeedbackCategory"><option value="general">General feedback</option><option value="question_issue">Question or answer issue</option><option value="technical">Technical problem</option><option value="timing">Timing or submission issue</option><option value="accessibility">Accessibility or readability</option><option value="complaint">Complaint</option><option value="suggestion">Suggestion</option></select></div><div class="field"><label for="studentFeedbackContact">Contact (optional)</label><input id="studentFeedbackContact" type="text" maxlength="160" placeholder="Email or phone number, if you want a response"></div><div class="field full"><label for="studentFeedbackMessage">Your message</label><textarea id="studentFeedbackMessage" rows="5" maxlength="1800" placeholder="Describe the issue or share your feedback…"></textarea><div class="feedback-limit">Please do not include your password or other sensitive information.</div></div></div><div class="toolbar end feedback-submit-row"><button class="btn btn-primary" onclick="submitStudentFeedback()" ${state.studentFeedbackSending?'disabled':''}>${state.studentFeedbackSending?'Sending…':'Send Feedback'}</button></div></section>`;
}
function studentResult(){const r=state.studentResult,q=state.studentQuiz,s=Number(r.percent)>=Number(r.passMark),pct=Math.max(0,Math.min(100,Number(r.percent)||0));let tone='blue',remark='Excellent';if(pct<40){tone='red';remark='Needs Work'}else if(pct<60){tone='orange';remark='Room for Improvement'}else if(pct<80){tone='green';remark='Good — You Can Do Better'}const breakdown=subjectScoresHtml(r.subjectScores,r.score,r.total);const resultShown=q.settings?.resultEnabled!==false;
return `<div class="result-wrap student-result"><div class="result-card result-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="result-logo" alt="Gifted Brainz"><div class="eyebrow">🏁 CBT submitted successfully</div><h1>${s?'Well done!':'Test completed'}</h1>${!resultShown?`<p class="sub">Your submission has been recorded. The result is not currently displayed for this CBT.</p>`:`<div class="score-ring score-${tone}" style="--score-pct:0%"><strong>0%</strong></div><h3 class="score-remark score-${tone}">${remark}</h3><p class="result-performance-caption">${pct>=80?'A strong result. Keep practising to maintain your progress.':pct>=60?'Good progress. Review the questions you missed to improve further.':'Use your corrections to identify areas for focused revision.'}</p>${breakdown}<div class="result-stats"><div class="result-stat"><span>${breakdown?'Aggregate':'Score'}</span><b>${scoreOverTotalLabel(r.score,r.total)}</b></div><div class="result-stat"><span>Time</span><b>${fmt(r.timeUsed)}</b></div><div class="result-stat"><span>Status</span><b>${s?'Passed':'Not passed'}</b></div></div>`}<div class="result-actions">${q.settings?.reviewEnabled!==false&&r.corrections?.length?`<button class="btn btn-light" onclick="showStudentReview()">📖 View Corrections</button>`:''}${q.settings?.leaderboardEnabled!==false?`<button class="btn btn-light" onclick="showStudentLeaderboard()">🏆 View Leaderboard</button>`:''}${state.studentBiltz?`<button class="btn btn-primary" onclick="returnToBiltzLanding()">⚡ Return to Brainz Biltz</button>`:(r.attemptsRemaining===null||Number(r.attemptsRemaining||0)>0?`<button class="btn btn-primary" onclick="retakeStudent()">↻ Retake Test <span class="sub">${r.attemptsRemaining===null?'(Unlimited attempts)':`(${r.attemptsRemaining} remaining)`}</span></button>`:`<span class="sub" style="display:block;margin:10px 0">🔐 You have used all ${r.maxAttempts||1} allowed attempt${Number(r.maxAttempts||1)===1?'':'s'} for this CBT on this device.</span>`)}<button class="btn btn-light" onclick="returnToEduSpace()">↩ Return to EduSpace</button>${libraryReturnButton()}</div></div>${studentFeedbackPanel()}</div>`}
async function hydrateReviewImages(container,quizId){
  if(!container||!quizId)return;
  const pending=[...container.querySelectorAll('[data-review-image-id]')];
  for(const node of pending){
    const questionId=node.getAttribute('data-review-image-id');
    if(!questionId)continue;
    try{
      const r=await api('question-media',{query:{quizId,questionId,biltz:state.studentBiltz?.slug||'',attemptId:state.studentAttemptId||''}});
      const src=safeImageSrc(r.image_data);
      if(src){
        state.studentImageCache=state.studentImageCache||{};
        state.studentImageCache[questionId]=src;
        node.outerHTML=`<figure class="question-figure review-question-figure"><img class="question-image" src="${escAttr(src)}" alt="Question diagram or illustration" loading="lazy" decoding="async"></figure>`;
      }else node.textContent='Diagram could not be loaded.';
    }catch{node.textContent='Diagram could not be loaded.';}
  }
}
function correctionDisplay(x){
  const original=Array.isArray(x.options)?x.options:[];
  const q=state.studentQuiz?.questions?.find(item=>String(item.id)===String(x.questionId||x.id));
  const map=q?.optionMap;
  const valid=original.length===4&&Array.isArray(map)&&map.length===4&&new Set(map).size===4&&
    map.every((index,i)=>Number.isInteger(index)&&index>=0&&index<4&&String(q.options?.[i])===String(original[index]));
  const order=valid?map:[0,1,2,3];
  return {options:order.map(index=>original[index]),correct:order.indexOf(Number(x.correctAnswer)),
    selected:x.selectedAnswer===null||x.selectedAnswer===undefined?-1:order.indexOf(Number(x.selectedAnswer))};
}
function correctionOptionsHtml(x){
  const display=correctionDisplay(x);
  return display.options.map((option,i)=>`<div class="review-answer ${i===display.correct?'correct':''} ${i===display.selected&&i!==display.correct?'wrong':''}"><b>${String.fromCharCode(65+i)}.</b> ${mathHtml(option)} ${i===display.correct?'✓ Correct answer':''}${i===display.selected&&i!==display.correct?' — Your answer':''}${i===display.selected&&i===display.correct?' — Your answer':''}</div>`).join('');
}
function showStudentReview(){const rows=state.studentResult?.corrections||[];const html=`<div class="modal-backdrop" onclick="if(event.target===this)closeStudentOverlay()"><div class="modal modal-wide"><div class="modal-head"><div><h2>📖 View Corrections</h2><div class="sub">Green answers are correct. Red answers are incorrect.</div></div><button class="close" aria-label="Close" title="Close" onclick="closeStudentOverlay()">×</button></div>${rows.map((x,i)=>`<div class="review-item ${x.isCorrect?'correct':''}"><div class="q-head"><b>${i+1}. ${questionStemHtml(x.text)}</b></div>${safeImageSrc(x.image_data)?`<figure class="question-figure review-question-figure"><img class="question-image" src="${escAttr(safeImageSrc(x.image_data))}" alt="Question diagram or illustration" loading="lazy" decoding="async"></figure>`:x.image_available?`<div class="question-image-loading review-image-loading" data-review-image-id="${escAttr(String(x.questionId))}">Loading question diagram…</div>`:''}${x.passage?.content?`<div class="passage-box"><h3>${esc(x.passage.title||'Passage')}</h3><div>${mathHtml(x.passage.content)}</div></div>`:''}${correctionOptionsHtml(x)}<div class="sub" style="margin-top:10px"><b>Explanation:</b> ${mathHtml(x.explanation||'No explanation provided.')}</div></div>`).join('')}</div></div>`;$('#studentOverlay').innerHTML=html;hydrateReviewImages($('#studentOverlay'),state.studentQuiz?.id);}
async function showStudentLeaderboard(){try{const r=state.studentBiltz?await api('biltz-leaderboard',{query:{id:state.studentBiltz.slug,limit:1000}}):await api('leaderboard',{query:{id:state.studentQuiz.id,limit:1000}});const rows=(r.leaderboard||[]);const wrap=`<div class="modal-backdrop leaderboard-page-backdrop" onclick="if(event.target===this)closeStudentOverlay()"><div class="modal modal-wide leaderboard-modal official-leaderboard"><div class="official-leaderboard-header">${officialLogoHtml()}<div class="official-kicker">OFFICIAL</div><h2>${esc(state.studentQuiz.title||'Assessment')}</h2><div class="official-heading">LEADERBOARD</div><p class="official-leaderboard-caption">Verified assessment rankings · Highest scores first</p><div class="official-subheading">ALL PARTICIPANTS • ${rows.length}</div></div><button class="close official-close" onclick="closeStudentOverlay()" aria-label="Close" title="Close">×</button>${leaderboardListHtml(rows,{emptyText:'No submitted results yet.'})}</div></div>`;$('#studentOverlay').innerHTML=wrap;}catch(e){toast(e.message)}}
function closeStudentOverlay(){$('#studentOverlay').innerHTML=''}
function retakeStudent(){clearInterval(state.timer);detachStudentGuard();clearInterval(state.whatsappTimer);try{if(state.studentQuiz)localStorage.removeItem(pendingSubmitKey(state.studentQuiz.id));}catch{}state.whatsappOpened=false;state.whatsappCountdown=0;state.studentStage='intro';state.student=null;state.studentResult=null;state.studentAnswers={};state.studentFlags=new Set();state.studentFeedbackSubmitted=false;state.studentFeedbackSending=false;state.tabSwitchPending=false;state.studentImageCache={};state.studentImagePending=new Set();state.studentImageFailed=new Set();state.studentIndex=0;state.studentSection=null;state.studentSectionIndexes={};state.studentAttemptId=null;state.studentAttemptToken=null;state.studentAttemptNumber=0;const max=state.studentQuiz?.settings?.maxAttempts;state.studentMaxAttempts=(max===null||max===0||String(max).toLowerCase()==='unlimited')?null:Math.max(1,Number(max)||1);state.startedAt=null;state.timeLeft=0;state.submitting=false;state.submitError=null;state.submitRetryCount=0;state.autoSubmitQueued=false;state.studentStage='intro';state.whatsappOpened=false;renderStudent();}
function studentSubmitting(){const failed=Boolean(state.submitError);
return `<div class="student-landing"><div class="student-card student-card-themed submitting-card"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz">${failed?`<div class="submit-icon" aria-hidden="true">⚠️</div><div class="eyebrow">Submission problem</div><h1>We couldn't submit your attempt</h1><p class="sub">${esc(state.submitError)}</p><p class="sub">Your answers are saved on this device and have not been lost. Check your internet connection, then try again — do not close this tab.</p><button class="btn btn-primary wide" onclick="retrySubmitStudent()" ${state.submitting?'disabled':''}>${state.submitting?'Retrying…':'Try Again'}</button><button class="btn btn-ghost wide" onclick="abandonStuckSubmission()" ${state.submitting?'disabled':''}>Start over instead</button>`:`<div class="submit-icon spin" aria-hidden="true">⏳</div><div class="eyebrow">Please wait</div><h1>Submitting your attempt…</h1><p class="sub">Do not close this tab or refresh the page while we send your answers.</p>`}</div></div>`}
function exitStudent(){clearInterval(state.timer);clearInterval(state.whatsappTimer);detachStudentGuard();state.studentQuiz=null;state.studentResult=null;state.studentAnswers={};state.studentFlags=new Set();try{window.close()}catch{}setTimeout(()=>{if(!window.closed){try{history.replaceState(null,'',location.pathname);document.body.innerHTML='<div class="student-exit"><div><h1>✓ CBT session closed</h1><p>You may now close this tab.</p></div></div>';document.body.style.background='#f4f7fb'}catch{location.replace('about:blank')}}},80)}
function animateScore(root,target){
  const ring=root&&root.querySelector?root.querySelector('.score-ring'):null;
  const strong=root&&root.querySelector?root.querySelector('.score-ring strong'):null;
  if(!ring||!strong)return;
  target=Math.max(0,Math.min(100,Number(target)||0));
  const reduced=(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if(reduced){strong.textContent=target+'%';ring.style.setProperty('--score-pct',target+'%');return;}
  const dur=1200,start=performance.now();
  const step=(now)=>{const t=Math.min(1,(now-start)/dur);const eased=1-Math.pow(1-t,3);const val=Math.round(target*eased);strong.textContent=val+'%';ring.style.setProperty('--score-pct',val+'%');if(t<1)requestAnimationFrame(step);};
  requestAnimationFrame(step);
}
function renderResultAccess(result){
  applyStudentTheme();
  const leaderboard=Array.isArray(result.leaderboard)?result.leaderboard:[];
  if(result.noAttempted){
    const leaderboardHtml=`<div id="sharedLeaderboard" class="card shared-result-panel official-leaderboard" data-quiz-id="${escAttr(String(result.quizId||''))}"><div class="official-leaderboard-header">${officialLogoHtml()}<div class="official-kicker">OFFICIAL</div><h2>${esc(result.quizTitle||'Assessment')}</h2><div class="official-heading">LEADERBOARD</div><p class="official-leaderboard-caption">Verified assessment rankings · Highest scores first</p><div class="official-subheading">ALL PARTICIPANTS • ${leaderboard.length}</div></div><div class="no-result-state"><div class="no-result-icon">📝</div><h3>You have not attempted this quiz yet.</h3><p>Tap below to open the assessment and record your first attempt.</p><a class="btn btn-primary big" href="${location.pathname}?quiz=${encodeURIComponent(result.quizSlug||'')}">▶ Attempt Quiz</a></div>${leaderboardListHtml(leaderboard)}</div>`;
    app.innerHTML=`<div class="result-wrap student-result"><div class="result-card result-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="result-logo" alt="Gifted Brainz"><div class="eyebrow">🎓 ${esc(result.quizTitle||'Your Result')}</div><h1>Result Center</h1><p class="result-intro">You have not attempted this quiz yet. Your result will appear here after you complete the assessment.</p></div>${leaderboardHtml}</div>`;
    renderMath(app);return;
  }
  const pct=Math.max(0,Math.min(100,Number(result.percent)||0));
  const pass=Number(result.percent)>=Number(result.pass_mark);
  let tone='blue',remark='Excellent';
  if(pct<40){tone='red';remark='Needs Work';}else if(pct<60){tone='orange';remark='Room for Improvement';}else if(pct<80){tone='green';remark='Good — You Can Do Better';}
  const corrections=(result.corrections||[]);
  const breakdown=subjectScoresHtml(result.subjectScores,result.score,result.total);
  const correctionHtml=corrections.length
    ? `<div id="sharedCorrections" class="card shared-result-panel" data-quiz-id="${escAttr(String(result.quizId||''))}" hidden><div class="section-head"><div><h3>📖 Your Corrections</h3><div class="sub">Review your answers against the correct answers.</div></div></div>${corrections.map((x,i)=>`
        <div class="review-item ${x.isCorrect?'correct':''}">
          <div class="q-head"><b>${i+1}. ${questionStemHtml(x.text)}</b></div>
          ${safeImageSrc(x.image_data)?`<figure class="question-figure review-question-figure"><img class="question-image" src="${escAttr(safeImageSrc(x.image_data))}" alt="Question diagram or illustration" loading="lazy" decoding="async"></figure>`:x.image_available?`<div class="question-image-loading review-image-loading" data-review-image-id="${escAttr(String(x.questionId))}">Loading question diagram…</div>`:''}
          ${x.passage?.content?`<div class="passage-box"><h3>${esc(x.passage.title||'Passage')}</h3><div>${mathHtml(x.passage.content)}</div></div>`:''}
          ${correctionOptionsHtml(x)}
          <div class="sub" style="margin-top:10px"><b>Explanation:</b> ${mathHtml(x.explanation||'No explanation provided.')}</div>
        </div>`).join('')}</div>`
    : `<div id="sharedCorrections" class="card shared-result-panel" data-quiz-id="${escAttr(String(result.quizId||''))}" hidden><div class="empty">Corrections are not available for this result.</div></div>`;
  const leaderboardHtml=leaderboard.length
    ? `<div id="sharedLeaderboard" class="card shared-result-panel leaderboard-modal official-leaderboard" data-quiz-id="${escAttr(String(result.quizId||''))}" hidden><div class="official-leaderboard-header">${officialLogoHtml()}<div class="official-kicker">OFFICIAL</div><h3>${esc(result.quizTitle||'Assessment')}</h3><div class="official-heading">LEADERBOARD</div><p class="official-leaderboard-caption">Verified assessment rankings · Highest scores first</p><div class="official-subheading">ALL PARTICIPANTS • ${leaderboard.length}</div></div>${leaderboardListHtml(leaderboard)}</div>`
    : `<div id="sharedLeaderboard" class="card shared-result-panel" hidden><div class="empty">Leaderboard is not available.</div></div>`;
  const retakeAllowed=result.attemptsRemaining===null||Number(result.attemptsRemaining||0)>0;
  const actions=`<div class="result-actions shared-result-actions">${corrections.length&&result.settings?.reviewEnabled!==false?`<button class="btn btn-light" type="button" onclick="toggleSharedPanel('sharedCorrections',this)">📖 View Corrections</button>`:''}${result.settings?.leaderboardEnabled!==false?`<button class="btn btn-light" type="button" onclick="toggleSharedPanel('sharedLeaderboard',this)">🏆 View Leaderboard</button>`:''}${retakeAllowed?(result.challengeTitle?(result.challengeSlug?`<a class="btn btn-primary" href="${location.pathname}?biltz=${encodeURIComponent(result.challengeSlug)}">⚡ Open Brainz Biltz</a>`:`<span class="sub result-attempts-used">This challenge is no longer accepting attempts.</span>`):`<a class="btn btn-primary" href="${location.pathname}?quiz=${encodeURIComponent(result.quizSlug||'')}">↻ Reattempt Quiz</a>`):`<span class="sub result-attempts-used">🔐 You have used all ${result.maxAttempts||1} allowed attempt${Number(result.maxAttempts||1)===1?'':'s'} for this CBT on this device.</span>`}</div>`;
  app.innerHTML=`<div class="result-wrap student-result"><div class="result-card result-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="result-logo" alt="Gifted Brainz"><div class="eyebrow">🎓 ${esc(result.quizTitle||'Your Result')}</div><h1>Your Result</h1><div class="score-ring score-${tone}" style="--score-pct:0%"><strong>0%</strong></div><h3 class="score-remark score-${tone}">${remark}</h3><p class="result-performance-caption">${pct>=80?'A strong result. Keep practising to maintain your progress.':pct>=60?'Good progress. Review the questions you missed to improve further.':'Use your corrections to identify areas for focused revision.'}</p>${breakdown}<div class="result-stats"><div class="result-stat"><span>${breakdown?'Aggregate':'Score'}</span><b>${scoreOverTotalLabel(result.score,result.total)}</b></div><div class="result-stat"><span>Status</span><b>${pass?'Passed':'Not passed'}</b></div>${result.rank?`<div class="result-stat"><span>Leaderboard</span><b>${leaderboardRankLabel(result.rank)}</b></div>`:''}</div>${actions}</div>${correctionHtml}${leaderboardHtml}${studentFeedbackPanel()}</div>`;
  renderMath(app);setTimeout(()=>animateScore(app,pct),60);
}
function toggleSharedPanel(id,button){const panel=document.getElementById(id);if(!panel)return;const willShow=panel.hidden;panel.hidden=!willShow;if(button)button.textContent=(id==='sharedCorrections'?(willShow?'📕 Hide Corrections':'📖 View Corrections'):(willShow?'🏆 Hide Leaderboard':'🏆 View Leaderboard'));if(willShow){panel.scrollIntoView({behavior:'smooth',block:'start'});if(id==='sharedCorrections')hydrateReviewImages(panel,panel.getAttribute('data-quiz-id')||'');}}
function copyStudentResultLink(){const r=state.studentResult;if(!r?.resultToken||!state.studentQuiz?.slug)return;copyResultsUrl(`${location.origin}${location.pathname}?resultToken=${encodeURIComponent(r.resultToken)}`,'Personal result link copied');}
async function loadResultToken(token){try{const r=await api('result-access',{query:{token}});renderResultAccess(r.result);}catch(e){if(e.payload?.quizAccessRequired||e.payload?.accessKind==='quiz'){renderPrivateQuizGate({quizSlug:e.payload.quizSlug||'',quizName:e.payload.quizName||'Private quiz',deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||'',resultToken:token});return;}if(e.payload?.accessRequired){renderPrivateLibraryGate({librarySlug:e.payload.librarySlug||'',libraryName:e.payload.libraryName||'Private CBT Library',deviceId:e.payload.deviceId||getDeviceId(),resultToken:token,adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}app.innerHTML=`<div class="result-wrap student-result"><div class="result-card result-card-themed result-error-state"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="result-logo" alt="Gifted Brainz"><div class="eyebrow">RESULT CENTER</div><h1>Result Unavailable</h1><p class="result-error-message">${esc(e.message)}</p><a class="btn btn-primary" href="${location.pathname}?library=${encodeURIComponent(new URLSearchParams(location.search).get('library')||'')}" onclick="if(!new URLSearchParams(location.search).get('library')){event.preventDefault();if(history.length>1)history.back();else toast('Please reopen the CBT Library link shared by your teacher.')}">Return to CBT Library</a></div></div>`;}}
async function loadResult(slug){try{const r=await api('result-access',{query:{slug}});renderResultAccess(r.result);}catch(e){if(e.payload?.quizAccessRequired||e.payload?.accessKind==='quiz'){renderPrivateQuizGate({quizSlug:e.payload.quizSlug||'',quizName:e.payload.quizName||'Private quiz',deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||'',resultSlug:slug});return;}if(e.payload?.accessRequired){renderPrivateLibraryGate({librarySlug:e.payload.librarySlug||'',libraryName:e.payload.libraryName||'Private CBT Library',deviceId:e.payload.deviceId||getDeviceId(),resultSlug:slug,adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}app.innerHTML=`<div class="result-wrap student-result"><div class="result-card result-card-themed result-error-state"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="result-logo" alt="Gifted Brainz"><div class="eyebrow">RESULT CENTER</div><h1>Result Unavailable</h1><p class="result-error-message">${esc(e.message)}</p><a class="btn btn-primary" href="${location.pathname}?library=${encodeURIComponent(new URLSearchParams(location.search).get('library')||'')}" onclick="if(!new URLSearchParams(location.search).get('library')){event.preventDefault();if(history.length>1)history.back();else toast('Please reopen the CBT Library link shared by your teacher.')}">Return to CBT Library</a></div></div>`;}}
function copyResultsUrl(url,message='Results link copied'){
 try{
  const field=document.createElement('textarea');field.value=url;field.readOnly=true;field.setAttribute('aria-hidden','true');Object.assign(field.style,{position:'fixed',top:'0',left:'-9999px',opacity:'0'});document.body.appendChild(field);field.select();
  const copied=document.execCommand('copy');field.remove();
  if(copied){toast(message);return;}
 }catch{}
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(url).then(()=>toast(message),()=>toast('Copy this link: '+url));return;}
 toast('Copy this link: '+url);
}
function copyGeneralResultLink(slug){copyResultsUrl(`${location.origin}${location.pathname}?result=${encodeURIComponent(slug)}`,'Shared results link copied');}

async function releaseResultLink(quizId){
 const existing=state.quizzes.find(q=>q.id===quizId);
 if(existing?.result_released&&existing?.result_slug){copyGeneralResultLink(existing.result_slug);return;}
 try{const r=await api('result-release',{method:'POST',body:{quizId}});if(r.resultSlug)copyGeneralResultLink(r.resultSlug);await refreshAdmin('Shared result link released');if(state.modal?.type==='leaderboard'){state.modal={type:'leaderboard',quizId};renderModal();}}catch(e){toast(e.message)}
}
async function clearLeaderboard(quizId){if(!await appConfirm('Clear Leaderboard?',"This will remove all submitted results from this CBT's leaderboard. Your questions, sections, and CBT settings will not be affected.",'Clear Leaderboard'))return;try{const r=await api('clear-leaderboard',{method:'POST',body:{id:quizId}});state.leaderboards=state.leaderboards||{};state.leaderboards[quizId]=[];await refreshAdmin(`${r.removed||0} result${Number(r.removed)===1?'':'s'} cleared`);if(state.modal?.type==='leaderboard'&&state.modal.quizId===quizId)renderModal();}catch(e){toast(e.message)}}

async function shareLibraryAssessment(quizSlug,librarySlug){
 const url=`${location.origin}${location.pathname}?quiz=${encodeURIComponent(quizSlug)}&library=${encodeURIComponent(librarySlug)}`;
 try{
   if(navigator.share){await navigator.share({title:'Gifted Brainz Assessment',url});return}
   if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);toast('Assessment link copied.');return}
   toast(url);
 }catch(e){if(e?.name!=='AbortError')toast('Unable to share this assessment.');}
}
async function loadLibrary(slug){applyStudentTheme();app.innerHTML=studentLoadingMarkup('Loading CBT Library','Preparing your library and its published assessments.');try{const r=await api('public-library',{query:{id:slug}});const lib=r.library||{};app.innerHTML=`<div class="student-landing"><div class="student-card library-public student-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><div class="eyebrow">Gifted Brainz • CBT Library</div><h1>${esc(lib.name||'CBT Library')}</h1><p class="student-description">${esc(lib.description||'Select a published assessment below to begin.')}</p><div class="library-availability-card" role="status"><div><span>Available CBTs</span><b>${(lib.quizzes||[]).length}</b></div></div><div class="library-public-list">${(lib.quizzes||[]).map(q=>`<div class="library-public-item"><div><h3>${esc(q.title)}</h3><p>${esc(q.description||'Online assessment')} • ${q.duration} min</p>${cbtScheduleInline(q.settings?.startAt,q.settings?.endAt)}</div><div class="gb-library-actions">${hubSchedulePhase(q.settings?.startAt,q.settings?.endAt)==='open'?`<a class="btn btn-primary" href="${location.pathname}?quiz=${encodeURIComponent(q.slug)}&library=${encodeURIComponent(lib.slug||slug)}">Start Assessment 🎯</a>`:`<span class="btn btn-ghost" aria-disabled="true">${hubSchedulePhase(q.settings?.startAt,q.settings?.endAt)==='upcoming'?'Not Open Yet':'Assessment Closed'}</span>`}<a class="btn btn-light gb-library-results-link" href="${location.pathname}?result=${encodeURIComponent(q.result_slug||q.id)}&library=${encodeURIComponent(lib.slug||slug)}">Results &amp; Review 📊</a><button type="button" class="btn btn-ghost gb-library-share" onclick="shareLibraryAssessment('${escAttr(q.slug)}','${escAttr(lib.slug||slug)}')">Share</button></div></div>`).join('')||'<div class="empty">No published CBTs have been added to this library yet.</div>'}</div></div></div>`;applyStudentTheme();}catch(e){if(e.payload?.accessRequired){renderPrivateLibraryGate({librarySlug:e.payload.librarySlug||slug,libraryName:e.payload.libraryName||'Private CBT Library',deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}app.innerHTML=`<div class="student-landing"><div class="student-card student-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><h1>Library unavailable</h1><p class="sub">${esc(e.message)}</p></div></div>`;applyStudentTheme();}}
function renderPrivateQuizGate({quizSlug,quizName='Private quiz',deviceId=getDeviceId(),adminWhatsAppNumber=state.adminWhatsAppNumber,resultToken='',resultSlug=''}){
  applyStudentTheme();
  app.innerHTML=`<div class="student-landing private-library-gate-wrap"><section class="student-card student-card-themed private-library-gate"><div class="student-card-topbar">${studentThemeToggle()}</div><div class="private-gate-icon" aria-hidden="true">🔒</div><div class="eyebrow">Restricted quiz access</div><h1>This is a private quiz.</h1><p class="sub private-gate-message">This quiz requires an activation code. Contact the administrator to request access to this test.</p><div class="private-library-summary"><span>Quiz</span><strong>${esc(quizName||'Private quiz')}</strong></div><div class="field private-name-field"><label for="quizPrivateStudentName">Your name</label><input id="quizPrivateStudentName" autocomplete="name" placeholder="Enter your full name"></div><div class="field private-device-field"><label for="quizPrivateDeviceId">Your device ID</label><div class="device-id-entry"><input id="quizPrivateDeviceId" readonly value="${escAttr(deviceId)}"><button type="button" class="mini" onclick="copyQuizDeviceId()">Copy</button></div><small>Send this ID to the administrator. Your activation will apply only to this device and this quiz.</small></div><a class="whatsapp-contact-btn" href="${whatsappActivationLink('the private quiz',quizName||'this private quiz',deviceId,adminWhatsAppNumber)}" target="_blank" rel="noopener"><span class="whatsapp-contact-icon" aria-hidden="true">●</span>Contact administrator to get activation code</a><div class="field private-code-field"><label for="quizPrivateActivationCode">Activation code</label><input id="quizPrivateActivationCode" autocomplete="one-time-code" autocapitalize="characters" placeholder="Enter the code from the administrator"></div><button class="btn btn-primary wide" type="button" onclick="activatePrivateQuiz('${escAttr(quizSlug||'')}','${escAttr(resultToken)}','${escAttr(resultSlug)}')">Activate quiz</button><p id="quizPrivateActivationStatus" class="sub" aria-live="polite"></p><p class="private-gate-note">The code can be used once and only on this device for this quiz. After activation, access remains enabled until the administrator revokes it.</p></section></div>`;
}
async function copyQuizDeviceId(){const el=$('#quizPrivateDeviceId');if(!el)return;try{await navigator.clipboard.writeText(el.value);toast('Device ID copied.');}catch{el.select();document.execCommand('copy');toast('Device ID copied.');}}
async function activatePrivateQuiz(quizSlug,resultToken='',resultSlug=''){const studentName=String($('#quizPrivateStudentName')?.value||'').trim();const code=String($('#quizPrivateActivationCode')?.value||'').trim().toUpperCase();const status=$('#quizPrivateActivationStatus');if(!studentName){if(status)status.textContent='Enter your name first.';return;}if(!code){if(status)status.textContent='Enter the activation code provided by the administrator.';return;}if(status)status.textContent='Checking activation code…';try{await api('quiz-device-activate',{method:'POST',body:{quizSlug,deviceId:getDeviceId(),activationCode:code,studentName}});if(status)status.textContent='Device activated. Opening the quiz…';toast('Private quiz activated successfully.');if(resultToken)await loadResultToken(resultToken);else if(resultSlug)await loadResult(resultSlug);else await loadStudent(quizSlug);}catch(e){if(status)status.textContent=e.message||'The activation code could not be validated.';}}
function quizDeviceApprovalSection(q){
  const quizId=String(q?.id||'');
  if(q?.access_mode!=='private')return `<section class="library-device-admin quiz-device-admin"><div><h3>Private-quiz device approval</h3><p class="sub">To register approved devices for this quiz, change Quiz access to Private and save your changes first. The access setting is saved separately from quiz-library membership.</p></div></section>`;
  const devices=state.quizDevices?.[quizId];
  const code=state.quizActivationCode?.quizId===quizId?state.quizActivationCode:null;
  return `<section class="library-device-admin quiz-device-admin"><div><h3>Private-quiz device approval</h3><p class="sub">Paste the device ID supplied by the student. The generated one-time code is tied to this exact quiz and device and expires after seven days if unused.</p></div><div class="field"><label for="quizDeviceId">Student device ID</label><input id="quizDeviceId" autocomplete="off" placeholder="Paste the student's device ID"></div><button type="button" class="btn btn-light" onclick="generateQuizActivation('${escAttr(quizId)}')">Register device &amp; generate activation code</button><div id="quizActivationResult">${code?quizActivationCodeHtml(code.code):''}</div><section class="quiz-device-list-section"><div class="section-head"><div><h3>Activated devices</h3><p class="sub">Approved devices for this quiz only. Deactivation removes access immediately.</p></div></div><div id="quizDevicesList" class="pool-topic-list">${devices===undefined?'<div class="empty">Loading activated devices…</div>':quizDeviceRowsHtml(quizId)}</div></section></section>`;
}
function quizActivationCodeHtml(code){return `<div class="library-activation-code" role="status"><span>Activation code for this device</span><strong>${esc(code)}</strong><small>This code is shown only to the administrator. It is single-use and bound to the device ID entered above.</small><button type="button" class="mini" onclick="copyQuizActivationCode()">Copy code</button></div>`;}
function quizDeviceRowsHtml(quizId){const list=state.quizDevices?.[String(quizId)]||[];return list.length?list.map(d=>`<div class="pool-topic-row"><div class="pool-topic-info"><b>${esc(d.student_name||'Unnamed student')}</b><small>Device ${esc(String(d.device_id||''))} • Activated ${d.activated_at?new Date(d.activated_at).toLocaleString():'—'}</small></div><div class="pool-topic-actions"><button type="button" class="mini danger-mini" onclick="deactivateQuizDevice('${escAttr(String(quizId))}','${escAttr(String(d.id))}','${escAttr(d.student_name||'This device')}')">Deactivate</button></div></div>`).join(''):'<div class="empty">No devices have activated this quiz yet.</div>';}
async function loadQuizDevices(quizId){try{const r=await api('quiz-device-list',{query:{quizId}});state.quizDevices=state.quizDevices||{};state.quizDevices[String(quizId)]=r.devices||[];if(state.modal?.type==='quiz'&&String(state.modal.quiz?.id||'')===String(quizId)){const el=$('#quizDevicesList');if(el)el.innerHTML=quizDeviceRowsHtml(quizId);}}catch(e){const el=$('#quizDevicesList');if(el)el.innerHTML=`<div class="empty">${esc(e.message||'Could not load activated devices.')}</div>`;}}
async function generateQuizActivation(quizId){const input=$('#quizDeviceId');const deviceId=String(input?.value||'').trim();if(!deviceId)return toast('Enter the student device ID first.');try{const result=await api('quiz-device-code',{method:'POST',body:{quizId,deviceId}});state.quizActivationCode={quizId:String(quizId),deviceId,code:result.activationCode};const box=$('#quizActivationResult');if(box)box.innerHTML=quizActivationCodeHtml(result.activationCode);toast('Private-quiz activation code generated. Share it only with the approved student.');}catch(e){toast(e.message||'Could not generate the activation code.')}}
async function copyQuizActivationCode(){const code=state.quizActivationCode?.code;if(!code)return;try{await navigator.clipboard.writeText(code);toast('Activation code copied.');}catch{toast(`Activation code: ${code}`)}}
async function deactivateQuizDevice(quizId,id,name){if(!await appConfirm('Deactivate this device?',`${name||'This device'} will immediately lose access to this quiz. The student will need a new activation code to use it again. Are you sure?`,'Deactivate device'))return;try{await api('quiz-device-deactivate',{method:'POST',body:{id}});state.quizDevices[String(quizId)]=(state.quizDevices[String(quizId)]||[]).filter(d=>String(d.id)!==String(id));const el=$('#quizDevicesList');if(el)el.innerHTML=quizDeviceRowsHtml(quizId);toast('Quiz device deactivated.');}catch(e){toast(e.message||'Could not deactivate this device.')}}

function renderPrivateLibraryGate({librarySlug,libraryName='Private CBT Library',deviceId=getDeviceId(),quizSlug='',resultToken='',resultSlug='',adminWhatsAppNumber=state.adminWhatsAppNumber}){applyStudentTheme();const msg='You are not eligible to open this library. Contact the administrator for more details.';app.innerHTML=`<div class="student-landing private-library-gate-wrap"><section class="student-card student-card-themed private-library-gate"><div class="student-card-topbar">${studentThemeToggle()}</div><div class="private-gate-icon" aria-hidden="true">🔒</div><div class="eyebrow">Restricted library access</div><h1>Private CBT Library</h1><p class="sub private-gate-message">${esc(msg)}</p><div class="private-library-summary"><span>Library</span><strong>${esc(libraryName||'Private CBT Library')}</strong></div><div class="field private-name-field"><label for="privateStudentName">Your name</label><input id="privateStudentName" autocomplete="name" placeholder="Enter your full name"></div><div class="field private-device-field"><label for="privateDeviceId">Your device ID</label><div class="device-id-entry"><input id="privateDeviceId" readonly value="${escAttr(deviceId)}" aria-describedby="deviceIdHelp"><button type="button" class="mini" onclick="copyPrivateDeviceId()">Copy</button></div><small id="deviceIdHelp">Send this ID to the administrator so the correct device can be approved.</small></div><a class="whatsapp-contact-btn" href="${whatsappActivationLink('the CBT Library',libraryName||'this CBT Library',deviceId,adminWhatsAppNumber)}" target="_blank" rel="noopener"><span class="whatsapp-contact-icon" aria-hidden="true">●</span>Contact Administrator on WhatsApp</a><div class="field private-code-field"><label for="privateLibraryActivationCode">Activation code</label><input id="privateLibraryActivationCode" autocomplete="one-time-code" autocapitalize="characters" placeholder="Enter the code from the administrator"></div><button class="btn btn-primary wide" type="button" onclick="activatePrivateLibrary('${escAttr(librarySlug||'')}','${escAttr(quizSlug)}','${escAttr(resultToken)}','${escAttr(resultSlug)}')">Activate access</button><p id="privateActivationStatus" class="sub" aria-live="polite"></p><p class="private-gate-note">Activation is tied to this browser's device ID. Do not share your activation code with anyone else.</p></section></div>`;}
async function copyPrivateDeviceId(){const el=$('#privateDeviceId');if(!el)return;try{await navigator.clipboard.writeText(el.value);toast('Device ID copied.');}catch{el.select();document.execCommand('copy');toast('Device ID copied.');}}
async function activatePrivateLibrary(librarySlug,quizSlug='',resultToken='',resultSlug=''){const studentName=String($('#privateStudentName')?.value||'').trim();const code=String($('#privateLibraryActivationCode')?.value||'').trim().toUpperCase();const status=$('#privateActivationStatus');if(!studentName){if(status)status.textContent='Enter your name first.';return;}if(!code){if(status)status.textContent='Enter the activation code provided by the administrator.';return;}if(status)status.textContent='Checking activation code…';try{await api('library-device-activate',{method:'POST',body:{librarySlug,deviceId:getDeviceId(),activationCode:code,studentName}});if(status)status.textContent='Device activated. Opening the library…';toast('Device activated successfully.');if(resultToken)await loadResultToken(resultToken);else if(resultSlug)await loadResult(resultSlug);else if(quizSlug)await loadStudent(quizSlug);else await loadLibrary(librarySlug);}catch(e){if(status)status.textContent=e.message||'The activation code could not be validated.';}}

function studentLoadingMarkup(title='Loading CBT',description='Preparing your assessment. Please wait.'){
  const loadingTitle=title==='Loading CBT'?'Preparing Your Examination':title;
  return `<main class="gb-fullscreen-loading" role="status" aria-live="polite" aria-busy="true"><div class="gb-loading-topbrand"><img src="/assets/icon.png" onerror="this.onerror=null;this.src='/assets/logo-full.png'" alt="Gifted Brainz"><span>GIFTED BRAINZ <b>ASSESSMENT HUB</b></span></div><div class="gb-loading-content"><div class="loading-emblem" aria-hidden="true"><span class="loading-orbit loading-orbit-one"></span><span class="loading-orbit loading-orbit-two"></span><img src="/assets/icon.png" onerror="this.onerror=null;this.src='/assets/logo-full.png'" alt="Gifted Brainz"></div><div class="eyebrow">ONLINE ASSESSMENT WORKSPACE</div><h1>${esc(loadingTitle)}</h1><p>${esc(description)}</p><div class="loading-progress-track" role="progressbar" aria-label="Assessment loading"><span></span></div><span class="loading-status">Setting up a focused examination experience</span></div><footer class="gb-loading-footer">GIFTED BRAINZ <span>•</span> NO CRAMMING, JUST UNDERSTANDING</footer></main>`;
}
function renderStudent(){applyStudentTheme();clearInterval(state.quizScheduleTimer);state.quizScheduleTimer=null;if(state.studentStage==='loading'){app.innerHTML=studentLoadingMarkup();}else if(state.studentStage==='whatsapp'){state.studentStage='intro';app.innerHTML=studentIntro();}else if(state.studentStage==='intro'){app.innerHTML=studentIntro();startCbtScheduleClock();if(!eduSpaceStudentState.checked)void refreshEduSpaceStudentStatus();}else if(state.studentStage==='details')app.innerHTML=studentDetails();else if(state.studentStage==='instructions')app.innerHTML=studentInstructions();else if(state.studentStage==='test'){app.innerHTML=studentTest();const current=currentStudentQuestion();if(current?.image_available&&!state.studentImageCache[current.id]&&!state.studentImageFailed.has(current.id))queueMicrotask(()=>loadStudentQuestionImage(current.id));}else if(state.studentStage==='submitting'){app.innerHTML=studentSubmitting();}else if(state.studentStage==='result'){app.innerHTML=studentResult();if(!eduSpaceStudentState.checked)void refreshEduSpaceStudentStatus();setTimeout(()=>animateScore(app,Math.max(0,Math.min(100,Number(state.studentResult?.percent)||0))),60);}renderMath(app);}
async function loadStudent(slug,challengeSlug=''){
  if(new URLSearchParams(location.search).get('review')==='1'){
    // Existing result tokens remain bound to server-side result access rules.
    // A missing saved result simply opens the CBT's standard result/introduction view.
    try{const tokens=Object.keys(localStorage).filter(k=>k.startsWith('gb:last-result:'));
    for(const key of tokens){try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.quizSlug===slug&&saved?.result?.resultToken){await loadResultToken(saved.result.resultToken);return;}}catch{}}}
    catch{}
  }

  clearInterval(state.quizScheduleTimer);state.quizScheduleTimer=null;clearInterval(state.biltzCountdownTimer);
  state.studentBiltzSlug=challengeSlug||'';
  state.studentBiltzPage=false;state.studentStage='loading';state.studentFeedbackSubmitted=false;state.studentFeedbackSending=false;
  state.studentAttemptId=null;state.studentAttemptToken=null;state.studentAttemptNumber=0;state.studentAnswers={};state.studentStudyFeedback={};state.studentStudyPending=new Set();state.studentFlags=new Set();state.studentIndex=0;state.studentSection=null;state.studentSectionIndexes={};
  renderStudent();
  try{
    const expectedChallenge=state.studentBiltz?.slug||state.studentBiltzSlug||'';
    let pendingSubmit=null, preflightProgress=null;
    if(expectedChallenge && state.studentBiltz?.quiz_id){
      try{const raw=localStorage.getItem(pendingSubmitKey(state.studentBiltz.quiz_id));if(raw)pendingSubmit=JSON.parse(raw);}catch{}
      try{const raw=localStorage.getItem(activeProgressKey(state.studentBiltz.quiz_id,expectedChallenge));if(raw)preflightProgress=JSON.parse(raw);}catch{}
    }
    const recovery=(pendingSubmit?.attemptId&&pendingSubmit?.attemptToken&&(pendingSubmit.challengeSlug||'')===expectedChallenge)?pendingSubmit:(preflightProgress?.attemptId&&preflightProgress?.attemptToken&&(preflightProgress.challengeSlug||'')===expectedChallenge)?preflightProgress:null;
    const publicQuizQuery={id:slug,biltz:state.studentBiltzSlug||''};
    if(recovery){publicQuizQuery.attemptId=recovery.attemptId;publicQuizQuery.attemptToken=recovery.attemptToken;}
    const r=await api('public-quiz',{query:publicQuizQuery});
    state.studentQuiz=r.quiz;state.studentImageCache={};state.studentImagePending=new Set();state.studentImageFailed=new Set();state.tabSwitchPending=false;state.whatsappOpened=false;state.whatsappCountdown=0;clearInterval(state.whatsappTimer);
    if(!pendingSubmit){try{const raw=localStorage.getItem(pendingSubmitKey(r.quiz.id));if(raw)pendingSubmit=JSON.parse(raw);}catch{}}
    if(pendingSubmit&&pendingSubmit.attemptId&&pendingSubmit.attemptToken&&(pendingSubmit.challengeSlug||'')===expectedChallenge){
      state.student=pendingSubmit.studentData||(pendingSubmit.studentName?{full_name:pendingSubmit.studentName}:state.student);
      state.studentAttemptId=pendingSubmit.attemptId;state.studentAttemptToken=pendingSubmit.attemptToken;
      state.studentAnswers=pendingSubmit.answers||{};state.violations=Number(pendingSubmit.violations)||0;
      state.submitError=null;state.submitRetryCount=0;state.studentStage='submitting';renderStudent();submitStudent(Boolean(pendingSubmit.auto),false);return;
    }
    let activeProgress=null;
    try{const raw=localStorage.getItem(activeProgressKey(r.quiz.id,expectedChallenge));if(raw)activeProgress=JSON.parse(raw);}catch{}
    if(activeProgress&&activeProgress.attemptId&&activeProgress.attemptToken&&(activeProgress.challengeSlug||'')===expectedChallenge){
      if(expectedChallenge){
        const recovered=await api('public-quiz',{query:{id:slug,biltz:expectedChallenge,attemptId:activeProgress.attemptId,attemptToken:activeProgress.attemptToken}});
        state.studentQuiz=recovered.quiz;
      }
      const started=Date.parse(activeProgress.startedAt||'');
      const durationSeconds=r.quiz.settings?.assessmentMode==='study'&&!expectedChallenge?7*24*60*60:Math.max(60,Number(activeProgress.durationSeconds)||Number(r.quiz.duration)*60);
      const elapsed=Number.isFinite(started)?Math.max(0,Math.floor((Date.now()-started)/1000)):durationSeconds+301;
      if(elapsed<=durationSeconds+300){
        state.student=activeProgress.studentData||(activeProgress.studentData?.full_name?activeProgress.studentData:{full_name:'Student'});
        state.studentAttemptId=activeProgress.attemptId;state.studentAttemptToken=activeProgress.attemptToken;state.studentAttemptNumber=Number(activeProgress.attemptNumber)||1;
        state.studentAnswers=activeProgress.answers&&typeof activeProgress.answers==='object'?activeProgress.answers:{};state.studentStudyFeedback=activeProgress.studyFeedback||{};state.studentStudyPending=new Set();state.studentFlags=new Set(Array.isArray(activeProgress.flags)?activeProgress.flags:[]);
        state.studentSectionIndexes=activeProgress.sectionIndexes&&typeof activeProgress.sectionIndexes==='object'?activeProgress.sectionIndexes:{};
        const sectionExists=(r.quiz.sections||[]).some(sec=>String(sec.id)===String(activeProgress.section));
        state.studentSection=sectionExists?activeProgress.section:(r.quiz.sections?.[0]?.id||null);
        state.studentIndex=Math.max(0,Math.min(Number(activeProgress.index)||0,Math.max(0,(r.quiz.questions||[]).length-1)));
        state.violations=Math.max(0,Number(activeProgress.violations)||0);state.startedAt=activeProgress.startedAt;state.timeLeft=Math.max(0,durationSeconds-elapsed);state.submitting=false;state.submitError=null;state.submitRetryCount=0;state.autoSubmitQueued=false;state.studentProgressLastSaved=0;
        if(state.timeLeft<=0&&r.quiz.settings?.assessmentMode!=='study'){state.studentStage='test';persistStudentProgress(true);state.studentStage='submitting';renderStudent();submitStudent(true,false);return;}
        state.studentStage='test';if(r.quiz.settings?.assessmentMode!=='study'||expectedChallenge){startTimer();attachStudentGuard();}renderStudent();return;
      }
      clearActiveStudentProgress(r.quiz.id,expectedChallenge);
    }
    state.studentStage='intro';renderStudent();
  }catch(e){
    if(state.studentBiltzSlug){await loadBiltzChallenge(state.studentBiltzSlug);return;}
    if(e.payload?.quizAccessRequired||e.payload?.accessKind==='quiz'){renderPrivateQuizGate({quizSlug:e.payload.quizSlug||slug,quizName:e.payload.quizName||'Private quiz',deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}
    if(e.payload?.accessRequired){renderPrivateLibraryGate({librarySlug:e.payload.librarySlug,libraryName:e.payload.libraryName,quizSlug:slug,deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}
    app.innerHTML=`<div class="student-landing"><div class="student-card student-card-themed"><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><h1>CBT unavailable</h1><p class="sub">${esc(e.message)}</p></div></div>`;applyStudentTheme();
  }
}

function copyStudentLinkFromModal(){const slug=state.modal.quiz.slug;copyQuizLink(slug)}

window.poolStudyAiOpen=poolStudyAiOpen;window.poolStudyAiClose=poolStudyAiClose;window.poolStudyAiNew=poolStudyAiNew;window.poolStudyAiSubmit=poolStudyAiSubmit;window.poolStudyAiAsk=poolStudyAiAsk;window.poolStudyAiMistake=poolStudyAiMistake;
window.submitStudentFeedback=submitStudentFeedback;window.copyStudentResultLink=copyStudentResultLink;window.loadFeedback=loadFeedback;window.updateFeedbackStatus=updateFeedbackStatus;window.updateManualPreview=updateManualPreview;window.updateDraftPreview=updateDraftPreview;window.updateDraftPassage=updateDraftPassage;window.updateMarksPreview=updateMarksPreview;window.logoutAdmin=logoutAdmin;window.nav=nav;window.newQuiz=newQuiz;window.editQuiz=editQuiz;window.newQuestion=newQuestion;window.editQuestion=editQuestion;window.closeModal=closeModal;window.loginAdmin=loginAdmin;window.retryAdminLoad=retryAdminLoad;window.checkHealth=checkHealth;window.generateAI=generateAI;window.extractDocument=extractDocument;window.removeDraft=removeDraft;window.saveDraftToBank=saveDraftToBank;window.openSaveDraftModal=openSaveDraftModal;window.saveDraftToQuiz=saveDraftToQuiz;window.addQuestionToQuiz=addQuestionToQuiz;window.saveAddQuestion=saveAddQuestion;window.deleteBankQuestion=deleteBankQuestion;window.deleteQuiz=deleteQuiz;window.duplicateQuiz=duplicateQuiz;window.deleteLeaderboardStudent=deleteLeaderboardStudent;window.publishQuiz=publishQuiz;window.copyQuizLink=copyQuizLink;window.showLeaderboard=showLeaderboard;window.refreshLeaderboard=refreshLeaderboard;window.scrollLeaderboard=scrollLeaderboard;window.exportLeaderboardImage=exportLeaderboardImage;window.newLibrary=newLibrary;window.manageLibrary=manageLibrary;window.savePlatformSettings=savePlatformSettings;window.generateQuizActivation=generateQuizActivation;window.copyQuizActivationCode=copyQuizActivationCode;window.deactivateQuizDevice=deactivateQuizDevice;window.copyQuizDeviceId=copyQuizDeviceId;window.activatePrivateQuiz=activatePrivateQuiz;window.saveLibrary=saveLibrary;window.generateLibraryActivation=generateLibraryActivation;window.copyActivationCode=copyActivationCode;window.activatePrivateLibrary=activatePrivateLibrary;window.copyPrivateDeviceId=copyPrivateDeviceId;window.deleteLibrary=deleteLibrary;window.toggleAllLibraryQuizzes=toggleAllLibraryQuizzes;window.copyLibraryLink=copyLibraryLink;window.publishQuizNow=publishQuizNow;window.toggleUnlimitedAttempts=toggleUnlimitedAttempts;window.saveQuizForm=saveQuizForm;window.updateSectionMarksTotal=updateSectionMarksTotal;window.saveManualQuestion=saveManualQuestion;window.togglePassageFields=togglePassageFields;window.addFieldRow=addFieldRow;window.addSectionRow=addSectionRow;window.chooseStudentAnswer=chooseStudentAnswer;window.switchStudentSection=switchStudentSection;window.goStudent=goStudent;window.nextStudent=nextStudent;window.prevStudent=prevStudent;window.toggleFlag=toggleFlag;window.confirmSubmit=confirmSubmit;window.retakeStudent=retakeStudent;window.exitStudent=exitStudent;window.showStudentLeaderboard=showStudentLeaderboard;window.closeStudentOverlay=closeStudentOverlay;window.newQuestionForQuiz=newQuestionForQuiz;window.previewQuestionImage=previewQuestionImage;window.clearQuestionImage=clearQuestionImage;window.deleteQuizQuestion=deleteQuizQuestion;window.toggleBuilderSelection=toggleBuilderSelection;window.toggleAllBuilder=toggleAllBuilder;window.bulkDeleteBuilderQuestions=bulkDeleteBuilderQuestions;window.moveBuilderQuestions=moveBuilderQuestions;window.showStudentReview=showStudentReview;window.toggleCalculator=toggleCalculator;window.calcPress=calcPress;window.resumeStudentAfterTabSwitch=resumeStudentAfterTabSwitch;window.forfeitStudentAfterTabSwitch=forfeitStudentAfterTabSwitch;
window.newPool=newPool;window.managePool=managePool;window.savePool=savePool;window.deletePool=deletePool;window.copyPoolLink=copyPoolLink;window.generatePoolActivation=generatePoolActivation;window.copyPoolActivationCode=copyPoolActivationCode;window.addPoolTopic=addPoolTopic;window.renamePoolTopic=renamePoolTopic;window.deletePoolTopic=deletePoolTopic;window.openPoolTopic=openPoolTopic;window.loadPoolTopicQuestions=loadPoolTopicQuestions;window.newPoolQuestion=newPoolQuestion;window.editPoolQuestion=editPoolQuestion;window.deletePoolQuestionItem=deletePoolQuestionItem;window.togglePoolPassageFields=togglePoolPassageFields;window.updatePoolManualPreview=updatePoolManualPreview;window.previewPoolQuestionImage=previewPoolQuestionImage;window.clearPoolQuestionImage=clearPoolQuestionImage;window.savePoolManualQuestion=savePoolManualQuestion;window.saveDraftToPoolTopic=saveDraftToPoolTopic;window.togglePoolQuestionSelect=togglePoolQuestionSelect;window.togglePoolQuestionSelectAll=togglePoolQuestionSelectAll;window.movePoolSelectedQuestions=movePoolSelectedQuestions;window.bulkDeletePoolQuestions=bulkDeletePoolQuestions;
window.openAiForQuiz=openAiForQuiz;window.openAiForPoolTopic=openAiForPoolTopic;window.deactivateLibraryDevice=deactivateLibraryDevice;window.clearLibraryDevices=clearLibraryDevices;window.deactivatePoolDevice=deactivatePoolDevice;window.clearPoolDevices=clearPoolDevices;window.copyPoolDeviceId=copyPoolDeviceId;window.activatePrivatePool=activatePrivatePool;window.togglePoolTopicSelect=togglePoolTopicSelect;window.togglePoolSelectAll=togglePoolSelectAll;window.poolBeginStudy=poolBeginStudy;window.poolBeginPractice=poolBeginPractice;window.poolChooseAnswer=poolChooseAnswer;window.poolNextQuestion=poolNextQuestion;window.poolPrevQuestion=poolPrevQuestion;window.poolToggleFlag=poolToggleFlag;window.poolGotoQuestion=poolGotoQuestion;window.poolRestartStudy=poolRestartStudy;window.poolSubmitPractice=poolSubmitPractice;window.poolExit=poolExit;window.poolBackToTopics=poolBackToTopics;window.poolChoosePracticeAnswer=poolChoosePracticeAnswer;window.poolConfirmSubmitPractice=poolConfirmSubmitPractice;window.retrySubmitStudent=retrySubmitStudent;window.abandonStuckSubmission=abandonStuckSubmission;


// ===== Question Pools: student experience =====
async function loadPool(slug){applyStudentTheme();app.innerHTML=studentLoadingMarkup('Loading Question Pool','Preparing topics for this pool.');try{const r=await api('public-pool',{query:{id:slug}});state.studentPool=r.pool;state.studentPoolStage='topics';state.studentPoolSelectedTopics=new Set();state.studentPoolAnswers={};state.studentPoolFlags=new Set();state.studentPoolFeedbackMap={};state.studentPoolIndex=0;state.studentPoolQuestions=[];state.studentPoolAttempt=null;state.studentPoolResult=null;render();}catch(e){if(e.payload?.accessRequired){renderPrivatePoolGate({poolSlug:e.payload.poolSlug||slug,poolName:e.payload.poolName||'Private Question Pool',deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}app.innerHTML=`<div class="student-landing"><div class="student-card student-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><h1>Question Pool unavailable</h1><p class="sub">${esc(e.message)}</p></div></div>`;applyStudentTheme();}}
function renderPrivatePoolGate({poolSlug,poolName='Private Question Pool',deviceId=getDeviceId(),adminWhatsAppNumber=state.adminWhatsAppNumber}){applyStudentTheme();const msg='You are not eligible to open this Question Pool. Contact the administrator for more details.';app.innerHTML=`<div class="student-landing private-library-gate-wrap"><section class="student-card student-card-themed private-library-gate"><div class="student-card-topbar">${studentThemeToggle()}</div><div class="private-gate-icon" aria-hidden="true">🔒</div><div class="eyebrow">Restricted pool access</div><h1>Private Question Pool</h1><p class="sub private-gate-message">${esc(msg)}</p><div class="private-library-summary"><span>Question Pool</span><strong>${esc(poolName)}</strong></div><div class="field private-name-field"><label for="poolPrivateStudentName">Your name</label><input id="poolPrivateStudentName" autocomplete="name" placeholder="Enter your full name"></div><div class="field private-device-field"><label for="poolPrivateDeviceId">Your device ID</label><div class="device-id-entry"><input id="poolPrivateDeviceId" readonly value="${escAttr(deviceId)}"><button type="button" class="mini" onclick="copyPoolDeviceId()">Copy</button></div><small>Send this ID to the administrator so the correct device can be approved.</small></div><a class="whatsapp-contact-btn" href="${whatsappActivationLink('the Question Pool',poolName||'this Question Pool',deviceId,adminWhatsAppNumber)}" target="_blank" rel="noopener"><span class="whatsapp-contact-icon" aria-hidden="true">●</span>Contact Administrator on WhatsApp</a><div class="field private-code-field"><label for="poolPrivateActivationCode">Activation code</label><input id="poolPrivateActivationCode" autocomplete="one-time-code" autocapitalize="characters" placeholder="Enter the code from the administrator"></div><button class="btn btn-primary wide" type="button" onclick="activatePrivatePool('${escAttr(poolSlug||'')}')">Activate access</button><p id="poolPrivateActivationStatus" class="sub" aria-live="polite"></p><p class="private-gate-note">Activation is tied to this browser's device ID. Do not share your activation code with anyone else.</p></section></div>`;}
async function copyPoolDeviceId(){const el=$('#poolPrivateDeviceId');if(!el)return;try{await navigator.clipboard.writeText(el.value);toast('Device ID copied.');}catch{el.select();document.execCommand('copy');toast('Device ID copied.');}}
async function activatePrivatePool(poolSlug){const studentName=String($('#poolPrivateStudentName')?.value||'').trim();const code=String($('#poolPrivateActivationCode')?.value||'').trim().toUpperCase();const status=$('#poolPrivateActivationStatus');if(!studentName){if(status)status.textContent='Enter your name first.';return;}if(!code){if(status)status.textContent='Enter the activation code provided by the administrator.';return;}if(status)status.textContent='Checking activation code…';try{await api('pool-device-activate',{method:'POST',body:{poolSlug,deviceId:getDeviceId(),activationCode:code,studentName}});if(status)status.textContent='Device activated. Opening the pool…';toast('Device activated successfully.');await loadPool(poolSlug);}catch(e){if(status)status.textContent=e.message||'The activation code could not be validated.';}}

function renderStudentPool(){const pool=state.studentPool;if(!pool)return;if(state.studentPoolStage==='study'){app.innerHTML=poolStudyView(pool);}else if(state.studentPoolStage==='practice'){app.innerHTML=poolPracticeView(pool);}else if(state.studentPoolStage==='practice-result'){app.innerHTML=poolResultView(pool);}else{app.innerHTML=poolTopicsView(pool);}renderMath(app);}

function poolProgressBlock(progress){
  if(!progress||!progress.timesSeen)return '';
  const rec=progress.recommendation;
  const tone=rec?rec.tier:'';
  return `<div class="pool-progress-summary pool-tone-${tone}"><div class="pool-progress-summary-head"><b>Your progress</b><span class="sub">Cycle ${progress.cycle} • ${progress.accuracyPercent}% correct overall</span></div>${rec?`<p class="sub">${esc(rec.message)}</p>`:''}</div>`;
}
function poolTopicsView(pool){const topics=pool.topics||[];const sel=state.studentPoolSelectedTopics;const allSelected=topics.length>0&&topics.every(t=>sel.has(t.id));const totalQs=topics.filter(t=>sel.has(t.id)).reduce((s,t)=>s+(t.questionCount||0),0);
return `<div class="student-landing"><div class="student-card library-public student-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><div class="eyebrow">Gifted Brainz • Question Pool</div><h1>${esc(pool.name)}</h1><p class="student-description">${esc(pool.description||'Choose the topics you want to study or practise.')}</p>
${poolProgressBlock(pool.progress)}
<div class="section-head"><h3 style="margin:0">Choose your topics</h3><label class="check"><input type="checkbox" ${allSelected?'checked':''} onchange="togglePoolSelectAll(this.checked)"> Select all</label></div>
<div class="pool-topic-pick-list">${topics.map(t=>`<label class="pool-topic-pick"><input type="checkbox" ${sel.has(t.id)?'checked':''} onchange="togglePoolTopicSelect('${t.id}')"><div class="pool-topic-pick-info"><span class="pool-topic-name-count"><b>${esc(t.name)}</b><small class="pool-count-badge">${t.questionCount||0} question${t.questionCount===1?'':'s'}</small></span><small class="pool-topic-pick-pct">${t.percentSolved||0}% solved</small></div><div class="pool-topic-progress"><div class="pool-topic-progress-bar" style="width:${t.percentSolved||0}%"></div></div></label>`).join('')||'<div class="empty">No topics are available in this pool yet.</div>'}</div>
<div class="field" style="margin-top:10px"><small class="sub">${sel.size} topic${sel.size===1?'':'s'} selected • ${totalQs} question${totalQs===1?'':'s'} available</small></div>
<div class="pool-mode-grid"><div class="pool-mode-card"><h3>📘 Study Mode</h3><p class="sub">No timer. See the correct answer and explanation right after each question. Your progress is saved.</p><button class="btn btn-light wide" ${sel.size&&!state.studentPoolStarting?'':'disabled'} onclick="poolBeginStudy()">${state.studentPoolStarting?'Starting…':'Start Study Mode'}</button></div><div class="pool-mode-card"><h3>⏱️ Practice Mode</h3><p class="sub">Timed, exam-style, and never repeats a question until you've covered every one in the selected topics. Your score and a full review appear after you submit.</p><div class="form-grid" style="margin-top:8px"><div class="field"><label>Questions (optional)</label><input id="poolPracticeCount" type="number" min="1" placeholder="All ${totalQs||''}"></div><div class="field"><label>Minutes (optional)</label><input id="poolPracticeDuration" type="number" min="1" placeholder="Auto"></div></div><button class="btn btn-primary wide" ${sel.size&&!state.studentPoolStarting?'':'disabled'} onclick="poolBeginPractice()">${state.studentPoolStarting?'Starting…':'Start Practice Mode'}</button></div></div>
</div></div>`}
function togglePoolTopicSelect(id){if(state.studentPoolSelectedTopics.has(id))state.studentPoolSelectedTopics.delete(id);else state.studentPoolSelectedTopics.add(id);render();}
function togglePoolSelectAll(checked){const topics=state.studentPool?.topics||[];state.studentPoolSelectedTopics=checked?new Set(topics.map(t=>t.id)):new Set();render();}
async function poolBeginStudy(){const topicIds=[...state.studentPoolSelectedTopics];if(!topicIds.length)return toast('Select at least one topic.');state.studentPoolStarting=true;render();try{const r=await api('pool-session-start',{method:'POST',body:{poolSlug:state.studentPool.slug,topicIds,mode:'study'}});state.studentPoolQuestions=r.questions||[];state.studentPoolIndex=r.progress?.questionIndex||0;state.studentPoolAnswers=r.progress?.answers||{};state.studentPoolFlags=new Set(r.progress?.flags||[]);state.studentPoolFeedbackMap=r.feedbackMap||{};state.studentPoolMode='study';state.studentPoolStage='study';studyAiReset();}catch(e){if(e.payload?.accessRequired){renderPrivatePoolGate({poolSlug:e.payload.poolSlug||state.studentPool.slug,poolName:e.payload.poolName||state.studentPool.name,deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}toast(e.message);}finally{state.studentPoolStarting=false;render();}}
async function poolBeginPractice(){const topicIds=[...state.studentPoolSelectedTopics];if(!topicIds.length)return toast('Select at least one topic.');const count=Number($('#poolPracticeCount')?.value)||undefined;const duration=Number($('#poolPracticeDuration')?.value)||undefined;state.studentPoolStarting=true;render();try{const r=await api('pool-session-start',{method:'POST',body:{poolSlug:state.studentPool.slug,topicIds,mode:'practice',count,duration}});state.studentPoolQuestions=r.questions||[];state.studentPoolAttempt={id:r.attempt.id,token:r.attempt.token,duration:r.attempt.duration,startedAt:r.attempt.startedAt};state.studentPoolIndex=0;state.studentPoolAnswers={};state.studentPoolFlags=new Set();state.studentPoolTimeLeft=r.attempt.duration*60;state.studentPoolMode='practice';state.studentPoolStage='practice';studyAiReset();poolStartTimer();}catch(e){if(e.payload?.accessRequired){renderPrivatePoolGate({poolSlug:e.payload.poolSlug||state.studentPool.slug,poolName:e.payload.poolName||state.studentPool.name,deviceId:e.payload.deviceId||getDeviceId(),adminWhatsAppNumber:e.payload.adminWhatsAppNumber||''});return;}toast(e.message);}finally{state.studentPoolStarting=false;render();}}

function togglePoolNavigator(open){
  const shell=document.querySelector('.gb-pool-exam');
  if(!shell)return;
  const next=typeof open==='boolean'?open:!shell.classList.contains('gb-exam-navigator-open');
  shell.classList.toggle('gb-exam-navigator-open',next);
  const btn=shell.querySelector('.gb-exam-question-toggle');
  if(btn)btn.setAttribute('aria-expanded',String(next));
}
// Study-only AI tutoring. Conversations are scoped to the active question and
// kept in memory, rather than shared between candidates or stored as an auth token.
const studyAi={open:false,questionId:null,chats:{},busy:false,error:'',callId:0};
function studyAiReset(){studyAi.callId++;studyAi.open=false;studyAi.questionId=null;studyAi.busy=false;studyAi.error='';studyAi.chats={};}
function poolStudyAiCurrent(){return state.studentPoolStage==='study'&&state.studentPoolMode==='study'?state.studentPoolQuestions[state.studentPoolIndex]:null;}
function poolStudyAiUnlocked(q){return Boolean(q&&Object.prototype.hasOwnProperty.call(state.studentPoolAnswers,q.id)&&state.studentPoolFeedbackMap[q.id]&&Number.isInteger(Number(state.studentPoolFeedbackMap[q.id].correctAnswer)));}
function poolStudyAiClose(){studyAi.open=false;studyAi.error='';studyAi.callId++;studyAi.busy=false;render();}
function poolStudyAiOpen(){const q=poolStudyAiCurrent();if(!poolStudyAiUnlocked(q))return;studyAi.questionId=q.id;studyAi.open=true;studyAi.error='';if(!studyAi.chats[q.id])studyAi.chats[q.id]=[];render();if(!studyAi.chats[q.id].length)poolStudyAiAsk('explain');else poolStudyAiFocus();}
function poolStudyAiFocus(){setTimeout(()=>$('#gbStudyAiInput')?.focus(),0);}
function poolStudyAiNew(){const q=poolStudyAiCurrent();if(!poolStudyAiUnlocked(q))return;studyAi.chats[q.id]=[];studyAi.error='';studyAi.callId++;studyAi.busy=false;render();poolStudyAiFocus();}
function poolStudyAiAnswerHtml(value){
  // v51.6: Render structured, safe Markdown and typeset multi-line maths.
  // Never inject untrusted model output directly into HTML.
  if(typeof window.GiftedStudyAiFormat==='function'){
    return window.GiftedStudyAiFormat(value,{mathHtml,katex:window.katex});
  }
  // Degraded script-load fallback: escaped text, without raw HTML injection.
  return String(value||'').split(/\r?\n\s*\r?\n/).filter(Boolean).map(part=>`<p>${mathHtml(part.replace(/\*\*/g,'').replace(/\r?\n/g,' '))}</p>`).join('');
}
function poolStudyAiPanel(q){
 if(!poolStudyAiUnlocked(q))return '';
 const messages=studyAi.chats[q.id]||[];
 const chips=[['simple','Explain simply'],['options','Why not the others?'],['hint','Give me a hint'],['alternative','Another method'],['similar','Similar questions']];
 if(q.passage)chips.push(['passage','Explain the passage']);
 return `<div class="gb-study-ai-shade" onclick="poolStudyAiClose()" aria-hidden="true"></div>
 <section class="gb-study-ai-panel" role="dialog" aria-modal="true" aria-label="Ask AI study assistant">
  <header class="gb-study-ai-head"><div><span class="gb-study-ai-eyebrow">GIFTED BRAINZ · STUDY MODE</span><h2>✦ Ask AI <small>Learning assistant</small></h2></div><div class="gb-study-ai-head-actions"><button type="button" class="gb-study-ai-new" onclick="poolStudyAiNew()" aria-label="Start a new AI conversation">New chat</button><button type="button" class="gb-study-ai-dismiss" onclick="poolStudyAiClose()" aria-label="Close AI assistant">×</button></div></header>
  <div class="gb-study-ai-context"><span>QUESTION ${state.studentPoolIndex+1}</span><p>${mathHtml(String(q.text||'').slice(0,230))}${String(q.text||'').length>230?'…':''}</p></div>
  <div id="gbStudyAiMessages" class="gb-study-ai-messages" role="log" aria-live="polite">${messages.length?messages.map(m=>`<article class="gb-study-ai-message ${m.role==='assistant'?'gb-study-ai-bot':'gb-study-ai-user'}"><span>${m.role==='assistant'?'✦ Gifted Brainz AI':'You'}</span><div>${poolStudyAiAnswerHtml(m.content)}</div></article>`).join(''):'<div class="gb-study-ai-welcome">Ask for a complete solution, a hint or a simpler explanation.</div>'}${studyAi.busy?'<div class="gb-study-ai-loading" role="status">✦ Preparing your explanation…</div>':''}${studyAi.error?`<div class="gb-study-ai-error" role="alert">${esc(studyAi.error)}</div>`:''}</div>
  <div class="gb-study-ai-controls"><div class="gb-study-ai-chips">${chips.map(([mode,label])=>`<button type="button" onclick="poolStudyAiAsk('${mode}')" ${studyAi.busy?'disabled':''}>${label}</button>`).join('')}<button type="button" onclick="poolStudyAiMistake()" ${studyAi.busy?'disabled':''}>Check my working</button></div><form class="gb-study-ai-compose" onsubmit="poolStudyAiSubmit(event)"><label class="sr-only" for="gbStudyAiInput">Ask a follow-up question</label><textarea id="gbStudyAiInput" maxlength="900" rows="2" placeholder="Ask a follow-up question…" ${studyAi.busy?'disabled':''}></textarea><button type="submit" aria-label="Send AI message" ${studyAi.busy?'disabled':''}>➤</button></form><small>AI can make mistakes. Check important answers against your lesson notes.</small></div>
 </section>`;
}
function poolStudyAiMistake(){poolStudyAiFocus();const box=$('#gbStudyAiInput');if(box){box.placeholder='Paste your steps and ask where you made a mistake…';}}
function poolStudyAiSubmit(event){event.preventDefault();const box=$('#gbStudyAiInput');const message=String(box?.value||'').trim();if(message)poolStudyAiAsk('followup',message);}
async function poolStudyAiAsk(mode='explain',message=''){
 const q=poolStudyAiCurrent();if(!poolStudyAiUnlocked(q)||!studyAi.open||studyAi.busy||studyAi.questionId!==q.id)return;
 const prompts={explain:'Please solve this question and explain every important step.',simple:'Explain this question in simple language.',options:'Why is the correct option right and why are the others wrong?',hint:'Give me a hint without revealing the answer.',alternative:'Show a different method if one exists.',similar:'Give me three similar practice questions with answers after the questions.',passage:'Explain the passage and how it relates to this question.'};
 const userMessage=mode==='followup'?String(message||'').slice(0,900):prompts[mode];if(!userMessage)return;
 const messages=studyAi.chats[q.id]||(studyAi.chats[q.id]=[]);
 const history=messages.slice(-8).map(x=>({role:x.role,content:x.content.slice(0,2400)}));
 messages.push({role:'user',content:userMessage});studyAi.busy=true;studyAi.error='';const requestId=++studyAi.callId;render();
 try{
  const result=await api('pool-study-ai',{method:'POST',body:{poolSlug:state.studentPool.slug,questionId:q.id,mode,message:userMessage,history}});
  if(requestId!==studyAi.callId)return;
  messages.push({role:'assistant',content:String(result.answer||'No explanation was returned.').slice(0,14000)});
 }catch(error){if(requestId===studyAi.callId)studyAi.error=error.status===429?'AI study limit reached. Please try again after the limit resets.':error.message||'The AI assistant is temporarily unavailable.';}
 finally{if(requestId===studyAi.callId){studyAi.busy=false;render();setTimeout(()=>{const log=$('#gbStudyAiMessages');if(log)log.scrollTop=log.scrollHeight;},0);}}
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&studyAi.open)poolStudyAiClose();});
function poolStudyView(pool){const qs=state.studentPoolQuestions;const i=state.studentPoolIndex;const q=qs[i];if(!q)return `<div class="student-landing"><div class="student-card student-card-themed"><h1>No questions</h1><button class="btn btn-primary" onclick="poolBackToTopics()">Back</button></div></div>`;const fb=state.studentPoolFeedbackMap[q.id];const answered=state.studentPoolAnswers[q.id]!==undefined;
return `<div class="cbt-shell gb-pool-exam"><header class="cbt-header"><div class="cbt-brand"><img src="assets/icon.png" alt=""><div><b>${esc(pool.name)} • Study Mode</b><small>No timer — learn at your own pace</small></div></div><div class="cbt-tools"><button class="btn btn-light" onclick="poolExit()">← Topics</button>${calculatorToolButton()}${studentThemeToggle()}<button type="button" class="gb-exam-tool gb-exam-question-toggle" onclick="togglePoolNavigator()" aria-label="Questions" aria-expanded="false">▦</button></div></header><main class="cbt-body"><section class="question-main"><div class="question-top"><span>Question ${i+1} of ${qs.length}</span></div>${studentQuestionPassage(q)}${safeImageSrc(q.image_data)?`<img class="question-image" src="${escAttr(safeImageSrc(q.image_data))}" alt="Question diagram">`:''}<div class="question-text">${questionStemHtml(q.text)}</div><div>${q.options.map((o,j)=>{const isSelected=state.studentPoolAnswers[q.id]===j;const showResult=Boolean(fb);const isRight=showResult&&j===fb.correctAnswer;const isWrongPick=showResult&&isSelected&&!fb.isCorrect;return `<label class="cbt-option ${isSelected?'selected':''} ${isRight?'study-correct':''} ${isWrongPick?'study-wrong':''}"><input type="radio" name="poolAnswer" ${isSelected?'checked':''} ${answered?'disabled':''} onchange="poolChooseAnswer('${q.id}',${j})"><span><b>${String.fromCharCode(65+j)}.</b> ${mathHtml(o)}</span></label>`}).join('')}</div>${fb?`<div class="study-feedback ${fb.isCorrect?'correct':'incorrect'}"><b>${fb.isCorrect?'✓ Correct!':'✗ Not quite.'}</b> The correct answer is ${String.fromCharCode(65+fb.correctAnswer)}.${fb.explanation?`<p>${mathHtml(fb.explanation)}</p>`:''}</div>`:answered?'<p class="sub" role="status">Checking your answer…</p>':'<p class="sub">Select an answer to see immediate feedback.</p>'}${poolStudyAiUnlocked(q)?`<div class="gb-study-ai-entry"><button class="btn gb-study-ai-open" type="button" onclick="poolStudyAiOpen()" aria-haspopup="dialog" aria-label="Ask AI to explain this question">✦ Ask AI <span aria-hidden="true">↗</span></button><span>Step-by-step help and follow-up questions</span></div>`:''}<div class="cbt-nav"><button class="btn btn-ghost" onclick="poolPrevQuestion()" ${i===0?'disabled':''}>← Previous</button><button class="btn btn-light" onclick="poolToggleFlag('${q.id}')">${state.studentPoolFlags.has(q.id)?'★ Marked for Review':'☆ Mark for Review'}</button>${i===qs.length-1?`<button class="btn btn-primary" onclick="poolBackToTopics()">Finish</button>`:`<button class="btn btn-primary" onclick="poolNextQuestion()">Next →</button>`}</div></section><aside class="navigator gb-pool-navigator"><button type="button" class="gb-close-navigator gb-pool-nav-close" onclick="togglePoolNavigator(false)" aria-label="Close question navigator">×</button><div class="navigator-title">Questions</div><div class="legend"><span><i class="dot answered"></i> Answered</span><span><i class="dot flag"></i> Flagged</span><span><i class="dot current"></i> Current</span></div><div class="nav-grid">${qs.map((x,j)=>`<button class="qdot ${j===i?'current':''} ${state.studentPoolAnswers[x.id]!==undefined?'answered':''} ${state.studentPoolFlags.has(x.id)?'flag':''}" onclick="poolGotoQuestion(${j})">${j+1}</button>`).join('')}</div><button class="btn btn-ghost wide" onclick="poolRestartStudy()">Restart topic progress</button></aside></main><button class="gb-exam-nav-backdrop" type="button" aria-label="Close question navigator" onclick="togglePoolNavigator(false)"></button><div id="calculatorRoot"></div>${studyAi.open&&studyAi.questionId===q.id?poolStudyAiPanel(q):''}</div>`}
async function poolChooseAnswer(qid,idx){if(state.studentPoolAnswers[qid]!==undefined)return;state.studentPoolAnswers[qid]=idx;render();try{const r=await api('pool-study-answer',{method:'POST',body:{poolSlug:state.studentPool.slug,questionId:qid,selected:idx}});state.studentPoolFeedbackMap[qid]={isCorrect:r.isCorrect,correctAnswer:r.correctAnswer,explanation:r.explanation};render();}catch(e){delete state.studentPoolAnswers[qid];toast(e.message);render();}}
function poolSavePosition(){if(state.studentPoolMode!=='study'||!state.studentPool)return;api('pool-study-position',{method:'POST',body:{poolSlug:state.studentPool.slug,questionIndex:state.studentPoolIndex,flags:[...state.studentPoolFlags]}}).catch(()=>{});}
function poolNextQuestion(){if(state.studentPoolIndex<state.studentPoolQuestions.length-1){state.studentPoolIndex++;poolSavePosition();render();}}
function poolPrevQuestion(){if(state.studentPoolIndex>0){state.studentPoolIndex--;poolSavePosition();render();}}
function poolGotoQuestion(i){state.studentPoolIndex=i;poolSavePosition();render();}
function poolToggleFlag(qid){if(state.studentPoolFlags.has(qid))state.studentPoolFlags.delete(qid);else state.studentPoolFlags.add(qid);poolSavePosition();render();}
async function poolRestartStudy(){if(!await appConfirm('Restart progress?','This clears your saved answers and position for these topics.','Restart'))return;try{await api('pool-study-reset',{method:'POST',body:{poolSlug:state.studentPool.slug}});state.studentPoolAnswers={};state.studentPoolFlags=new Set();state.studentPoolFeedbackMap={};state.studentPoolIndex=0;await poolBeginStudy();}catch(e){toast(e.message)}}

function poolPracticeView(pool){const qs=state.studentPoolQuestions;const i=state.studentPoolIndex;const q=qs[i];if(!q)return '';const answeredCount=qs.filter(x=>state.studentPoolAnswers[x.id]!==undefined).length;const flaggedCount=qs.filter(x=>state.studentPoolFlags.has(x.id)).length;const sectionProgress=qs.length?Math.round(answeredCount*100/qs.length):0;
return `<div class="cbt-shell gb-pool-exam"><header class="cbt-header"><div class="cbt-brand"><img src="assets/icon.png" alt=""><div><b>${esc(pool.name)} • Practice Mode</b><small>Timed practice session</small></div></div><div class="cbt-tools"><div class="timer" id="poolPracticeTimer">${fmt(state.studentPoolTimeLeft)}</div>${calculatorToolButton()}${studentThemeToggle()}<button type="button" class="gb-exam-tool gb-exam-question-toggle" onclick="togglePoolNavigator()" aria-label="Questions" aria-expanded="false">▦</button></div></header><main class="cbt-body"><section class="question-main"><div class="question-top"><span>Question ${i+1} of ${qs.length}</span></div>${studentQuestionPassage(q)}${safeImageSrc(q.image_data)?`<img class="question-image" src="${escAttr(safeImageSrc(q.image_data))}" alt="Question diagram">`:''}<div class="question-text">${questionStemHtml(q.text)}</div><div>${q.options.map((o,j)=>`<label class="cbt-option ${state.studentPoolAnswers[q.id]===j?'selected':''}"><input type="radio" name="poolPracticeAnswer" ${state.studentPoolAnswers[q.id]===j?'checked':''} onchange="poolChoosePracticeAnswer('${q.id}',${j})"><span><b>${String.fromCharCode(65+j)}.</b> ${mathHtml(o)}</span></label>`).join('')}</div><div class="cbt-nav"><button class="btn btn-ghost" onclick="poolPrevQuestion()" ${i===0?'disabled':''}>← Previous</button><button class="btn btn-light" onclick="poolToggleFlag('${q.id}')">${state.studentPoolFlags.has(q.id)?'★ Marked for Review':'☆ Mark for Review'}</button>${i===qs.length-1?`<button class="btn btn-primary" onclick="poolConfirmSubmitPractice()">Submit</button>`:`<button class="btn btn-primary" onclick="poolNextQuestion()">Next →</button>`}</div></section><aside class="navigator gb-pool-navigator"><button type="button" class="gb-close-navigator gb-pool-nav-close" onclick="togglePoolNavigator(false)" aria-label="Close question navigator">×</button><div class="navigator-title">Question Navigator</div><div class="navigator-overview"><strong>${answeredCount}<span> / ${qs.length}</span></strong><small>Answered in this section</small></div><div class="navigator-progress-track"><span style="width:${sectionProgress}%"></span></div><div class="navigator-flags">${flaggedCount?`${flaggedCount} flagged for review`:'No questions flagged'}</div><div class="legend"><span><i class="dot answered"></i> Answered</span><span><i class="dot flag"></i> Flagged</span><span><i class="dot current"></i> Current</span></div><div class="nav-grid">${qs.map((x,j)=>`<button class="qdot ${j===i?'current':''} ${state.studentPoolAnswers[x.id]!==undefined?'answered':''} ${state.studentPoolFlags.has(x.id)?'flag':''}" onclick="poolGotoQuestion(${j})">${j+1}</button>`).join('')}</div><button class="btn btn-primary wide" onclick="poolConfirmSubmitPractice()">Submit Practice</button></aside></main><button class="gb-exam-nav-backdrop" type="button" aria-label="Close question navigator" onclick="togglePoolNavigator(false)"></button><div id="calculatorRoot"></div></div>`}
function poolChoosePracticeAnswer(qid,idx){state.studentPoolAnswers[qid]=idx;render();}
function poolStartTimer(){clearInterval(state.studentPoolTimer);state.studentPoolTimer=setInterval(()=>{state.studentPoolTimeLeft--;if(state.studentPoolTimeLeft<=0){clearInterval(state.studentPoolTimer);poolSubmitPractice(true);}else{const el=$('#poolPracticeTimer');if(el)el.textContent=fmt(state.studentPoolTimeLeft);}},1000)}
async function poolConfirmSubmitPractice(){const unanswered=state.studentPoolQuestions.filter(q=>state.studentPoolAnswers[q.id]===undefined).length;if(!await appConfirm('Submit practice?',unanswered?`You have ${unanswered} unanswered question${unanswered===1?'':'s'}. Submit anyway?`:'Submit your practice session now?','Submit'))return;poolSubmitPractice(false);}
async function refreshPoolProgress(){if(!state.studentPool)return;try{const r=await api('public-pool',{query:{id:state.studentPool.slug}});state.studentPool={...state.studentPool,topics:r.pool.topics,progress:r.pool.progress};}catch{/* keep showing the last known progress */}}
async function poolSubmitPractice(auto){if(state.studentPoolSubmitting)return;state.studentPoolSubmitting=true;clearInterval(state.studentPoolTimer);const elapsed=Math.max(0,(state.studentPoolAttempt.duration*60)-state.studentPoolTimeLeft);try{const r=await api('pool-practice-submit',{method:'POST',body:{attemptId:state.studentPoolAttempt.id,poolId:state.studentPool.id,attemptToken:state.studentPoolAttempt.token,answers:state.studentPoolAnswers,timeUsed:elapsed,autoSubmitted:Boolean(auto)}});state.studentPoolResult=r;state.studentPoolStage='practice-result';await refreshPoolProgress();}catch(e){toast(e.message);}finally{state.studentPoolSubmitting=false;render();}}

function poolResultView(pool){const r=state.studentPoolResult;if(!r)return '';
return `<div class="student-landing"><div class="student-card student-card-themed"><div class="student-card-topbar">${studentThemeToggle()}</div><img src="assets/icon.png" class="student-logo" alt="Gifted Brainz"><h1>Practice Results</h1><p class="sub">${esc(pool.name)}</p><div class="result-score-card"><div class="result-score-big">${r.percent}%</div><div class="sub">${r.score} / ${r.total} marks • ${fmt(r.timeUsed)} used</div></div>${poolProgressBlock(pool.progress)}<div class="subsection"><h3>Review</h3>${(r.review||[]).map((q,i)=>`<div class="quiz-row" style="align-items:flex-start;flex-direction:column;gap:6px"><b>${i+1}. ${questionStemHtml(q.text)}</b><div>${(q.options||[]).map((o,j)=>`<div class="option ${j===q.correctAnswer?'correct':''} ${j===q.selected&&!q.isCorrect?'wrong':''}"><b>${String.fromCharCode(65+j)}.</b> ${mathHtml(o)}</div>`).join('')}</div>${q.explanation?`<p class="sub">${mathHtml(q.explanation)}</p>`:''}</div>`).join('')}</div><div class="toolbar end" style="margin-top:18px"><button class="btn btn-primary" onclick="poolBackToTopics()">↩ Back to Topics</button></div></div></div>`}
async function poolBackToTopics(){studyAiReset();clearInterval(state.studentPoolTimer);state.studentPoolStage='topics';state.studentPoolQuestions=[];state.studentPoolIndex=0;state.studentPoolAnswers={};state.studentPoolFlags=new Set();state.studentPoolFeedbackMap={};state.studentPoolAttempt=null;state.studentPoolResult=null;render();await refreshPoolProgress();render();}
// A Question Pool is a reusable resource a student keeps coming back to, not a one-shot
// CBT, so "exit" here must never drop them out to the admin console (which is what used to
// happen once state.studentPool was cleared) — it returns them to this same pool's topic
// list so they can pick another topic or mode.
function poolExit(){poolBackToTopics();}

const _qs2=new URLSearchParams(location.search);const boostSlug=_qs2.get('biltzQuiz')||_qs2.get('boost');const quizSlug=_qs2.get('quiz');const resultSlug=_qs2.get('result');const resultToken=_qs2.get('resultToken');const librarySlug=_qs2.get('library');const poolSlug=_qs2.get('pool');const launchSlug=_qs2.get('launch');const biltzSlug=_qs2.get('biltz');if(boostSlug){boostLoadPublic(boostSlug);}else if(biltzSlug){loadBiltzRoute(biltzSlug,quizSlug||'');}else if(launchSlug){loadStudent(launchSlug);}else if(quizSlug){loadStudent(quizSlug);}else if(resultToken){loadResultToken(resultToken);}else if(resultSlug){loadResult(resultSlug);}else if(librarySlug){loadLibrary(librarySlug);}else if(poolSlug){loadPool(poolSlug);}else{render();if(auth.token)loadAdmin(true);else checkHealth();}
window.__gbBooted=true;

