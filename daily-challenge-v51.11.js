/* Gifted Brainz Assessment Hub — v51.11 Daily Challenge: admin, student, results. */
const dailyUi={items:[],loading:false,error:'',edit:null,openForm:false,submissions:[],selected:null,showSubmissions:false,
  challenge:null,challengeError:'',studentStage:'welcome',studentName:'',studentAnswer:'',studentBusy:false,studentResult:null,
  resultData:null,resultError:'',resultBusy:false,releasePoll:null,gradeBusy:false,gradeAttempts:0,gradeLastAttemptAt:0,gradeMessage:'',gradeTimer:null,
  guardActive:false,guardViolations:0,guardLocked:false,guardNotice:'',guardSaving:false,answerMode:'type',photoImage:'',photoPreview:'',photoBusy:false};
const dailyLocal=(key)=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
const dailyStore=(key,v)=>{try{localStorage.setItem(key,v);}catch{}};
// Preserve author-entered paragraphs, line breaks, tabs and repeated spaces.
// mathHtml escapes untrusted text and renders supported math tokens; CSS renders the spacing.
function dailyFormattedTextHtml(value){
 const original=String(value??'').replace(/\r\n?/g,'\n');
 return typeof window.GiftedRichContent==='function'?window.GiftedRichContent(original,{mode:'smart',mathHtml:typeof mathHtml==='function'?mathHtml:esc,katex:window.katex}):(typeof mathHtml==='function'?mathHtml(original):esc(original));
}
function dailyUpdateStudentDraft(field){
 const q=dailyUi.challenge;if(!q)return;
 dailyUi.studentAnswer=field.value;
 dailyStore(`gb:challenge:draft:${q.id}`,field.value);
 window.GBDrafts?.save(`daily-answer:${q.id}`,field.value);
}
function dailyChooseAnswerMode(mode){
 if(!['type','photo'].includes(mode)||dailyUi.studentBusy)return;
 dailyUi.answerMode=mode;
 const typed=document.getElementById('dailyTypedInput'),photo=document.getElementById('dailyPhotoInput');
 if(typed)typed.hidden=mode!=='type';if(photo)photo.hidden=mode!=='photo';
 document.querySelectorAll('[data-answer-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.answerMode===mode)));
}
async function dailyChoosePhoto(input){
 const file=input.files?.[0];if(!file)return;
 if(!/^image\/(?:jpeg|png|webp)$/i.test(file.type)){toast('Use a JPG, PNG or WebP photograph.');input.value='';return;}
 if(file.size>10*1024*1024){toast('Choose a photo smaller than 10 MB.');input.value='';return;}
 dailyUi.photoBusy=true;
 const status=document.getElementById('dailyPhotoStatus');if(status)status.textContent='Preparing the photograph…';
 try{
  const image=await new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('This photo could not be opened.'))};img.src=url;});
  if(image.naturalWidth<450||image.naturalHeight<450)throw Error('The photo is too small. Move closer and retake it clearly.');
  const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('The image could not be prepared on this device.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let quality=.84,data='';do{data=canvas.toDataURL('image/jpeg',quality);quality-=.10;}while(data.length>1120000&&quality>.39);
  if(data.length>1120000)throw Error('This image is too large. Retake the work closer to the page or choose Type answers.');
  dailyUi.photoImage=data;dailyUi.photoPreview=data;
  const preview=document.getElementById('dailyPhotoPreview');if(preview){preview.src=data;preview.hidden=false;}
  if(status)status.textContent='✓ Photo ready. Check that every answer is visible and readable before submitting.';
 }catch(e){dailyUi.photoImage='';dailyUi.photoPreview='';if(status)status.textContent=e.message||'Please try another photograph.';toast(e.message||'Photo could not be prepared.');}
 finally{dailyUi.photoBusy=false;}
}
function dailyPreviewText(field,targetId){
 const preview=document.getElementById(targetId);
 if(!preview)return;
 preview.innerHTML=dailyFormattedTextHtml(field.value);
 if(typeof renderMath==='function')renderMath(preview);
}

const dailyDateInput=(iso)=>{if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;};
const dailyDefaultRelease=()=>dailyDateInput(new Date(Date.now()+24*3600000).toISOString());
const dailyShareUrl=slug=>`${location.origin}/?challenge=${encodeURIComponent(slug)}`;
const dailyResultUrl=(id,token)=>`${location.origin}/?challengeResult=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
const dailySafeImage=value=>typeof safeImageSrc==='function'?safeImageSrc(value):'';
const dailyVideoHtml=value=>{
  if(!value)return '';
  try{
    const u=new URL(value);if(u.protocol!=='https:')return '';
    let id='';if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname)){
      id=u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})/)?.[1]||'';
    }else if(u.hostname==='youtu.be'){id=u.pathname.slice(1).split('/')[0];}
    if(/^[\w-]{11}$/.test(id))return `<div class="daily-video"><iframe src="https://www.youtube-nocookie.com/embed/${escAttr(id)}" title="Challenge video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
    if(/^https:\/\/[^?#]+\.(?:mp4|webm|ogv|ogg)(?:\?|$)/i.test(u.href))return `<video class="daily-video-player" controls preload="metadata" src="${escAttr(u.href)}">Video unavailable on this device.</video>`;
    return `<p class="daily-media-link"><a href="${escAttr(u.href)}" rel="noopener noreferrer" target="_blank">▶ Open challenge video ↗</a></p>`;
  }catch{return '';}
};
const dailyMediaHtml=q=>`${dailySafeImage(q?.image_url)?`<img class="daily-question-image" src="${escAttr(dailySafeImage(q.image_url))}" alt="Diagram supplied with the challenge" loading="lazy">`:''}${dailyVideoHtml(q?.video_url)}`;
function dailyAdminPage(){
  const items=dailyUi.items||[];
  return shell(`<div class="daily-admin"><div class="section-head"><div><div class="eyebrow">CONSTRUCTED-RESPONSE ASSESSMENTS</div><h1>Daily Challenges</h1><p class="sub">Create shareable untimed text, image or video challenges. Release answers automatically and review AI scoring.</p></div><button class="btn btn-primary" type="button" onclick="dailyNewChallenge()">+ Create Challenge</button></div>
  ${dailyUi.error?`<div class="error-banner" role="alert">${esc(dailyUi.error)}</div>`:''}
  ${dailyUi.openForm?dailyAdminEditor():''}
  <section class="daily-admin-list" aria-label="Published and draft challenges">${dailyUi.loading?'<div class="card">Loading challenges…</div>':items.length?items.map(q=>`<article class="daily-admin-item"><div class="daily-admin-item-body"><div class="daily-admin-overline">${esc(q.subject||'General')} · ${esc(q.status||'draft')} · ${q.participation?.total||0} submissions</div><h3>${esc(q.title)}</h3><p class="sub">Answer release: ${esc(formatDateTime(q.release_at))} · ${Number(q.max_marks)||10} marks · ${q.participation?.review||0} awaiting review</p></div><div class="daily-admin-actions"><button class="btn btn-light" onclick="dailyEditChallenge('${escAttr(q.id)}')">Edit</button><button class="btn btn-light" onclick="dailyCopyLink('${escAttr(q.slug)}')">Copy link</button><button class="btn btn-light" onclick="dailyOpenSubmissions('${escAttr(q.id)}')">Submissions</button><button class="btn btn-danger daily-delete-button" type="button" onclick="dailyDeleteChallenge('${escAttr(q.id)}')">🗑 Delete</button></div></article>`).join(''):'<div class="card daily-empty">No challenges yet. Create your first written-response challenge above.</div>'}</section>
  ${dailyUi.showSubmissions?dailyAdminSubmissions():''}</div>`);
}
function dailyAdminEditor(){
 const q=dailyUi.edit||{};
 const val=(k)=>escAttr(q[k]??'');
 return `<form class="card daily-editor" id="dailyEditorForm" onsubmit="dailySaveChallenge(event)"><div class="section-head"><h2>${q.id?'Edit Challenge':'Create a Challenge'}</h2><button type="button" class="mini" onclick="dailyCancelEdit()">Close ×</button></div>
 <div class="daily-edit-grid"><div class="field daily-full"><label>Challenge title</label><input name="title" required maxlength="140" value="${val('title')}" placeholder="e.g. Physics – Understanding acceleration"></div>
 <div class="field"><label>Subject</label><input name="subject" maxlength="90" value="${val('subject')}" placeholder="Physics"></div><div class="field"><label>Topic</label><input name="topic" maxlength="150" value="${val('topic')}" placeholder="Motion"></div>
 <div class="field"><label>Difficulty</label><select name="difficulty">${['Easy','Intermediate','Challenging'].map(v=>`<option ${q.difficulty===v?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="field"><label>Maximum marks</label><input type="number" name="maxMarks" min="1" max="100" step="1" value="${Number(q.max_marks)||10}" required></div>
 <div class="field daily-full"><label>Question or instructions</label><small class="daily-format-hint">↵ Enter, blank lines, indentation and spacing will be preserved on screen and in the PDF.</small><textarea name="questionText" rows="7" required maxlength="12000" oninput="dailyPreviewText(this,'dailyQuestionPreview')" placeholder="Write the full theory or problem-solving question...">${esc(q.question_text||'')}</textarea><details class="daily-preview-details" open><summary>👁 Live question preview</summary><div id="dailyQuestionPreview" class="daily-preserve-text daily-editor-preview">${dailyFormattedTextHtml(q.question_text||'')}</div></details></div>
 <div class="field daily-full"><label>Question image (optional)</label><div class="daily-media-upload"><input type="url" name="imageUrl" id="dailyImageUrl" placeholder="Image HTTPS URL or upload below" value="${val('image_url')}"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange="dailyUploadMedia(this,'dailyImageUrl')"><span>Max 3 MB · JPEG, PNG, WebP, GIF</span></div></div>
 <div class="field daily-full"><label>Question video (optional)</label><div class="daily-media-upload"><input type="url" name="videoUrl" id="dailyVideoUrl" placeholder="YouTube URL, video HTTPS URL or upload below" value="${val('video_url')}"><input type="file" accept="video/mp4,video/webm,video/ogg" onchange="dailyUploadMedia(this,'dailyVideoUrl')"><span>Max 15 MB · MP4, WebM, Ogg. Larger videos: paste a YouTube link.</span></div></div>
 <div class="field daily-full"><label>Official answer (hidden until release)</label><textarea name="officialAnswer" rows="7" required maxlength="12000" oninput="dailyPreviewText(this,'dailyOfficialAnswerPreview')">${esc(q.official_answer||'')}</textarea><details class="daily-preview-details"><summary>👁 Live answer preview (admin only)</summary><div id="dailyOfficialAnswerPreview" class="daily-preserve-text daily-editor-preview">${dailyFormattedTextHtml(q.official_answer||'')}</div></details></div>
 <div class="field daily-full"><label>Marking guide (how marks are allocated)</label><textarea name="markingRubric" rows="5" required maxlength="12000" oninput="dailyPreviewText(this,'dailyRubricPreview')" placeholder="e.g. correct formula: 2 marks; substitution: 3 marks; numerical answer: 3 marks; explanation and unit: 2 marks">${esc(q.marking_rubric||'')}</textarea><small>AI awards partial marks using this guide. You can override a score after release.</small><details class="daily-preview-details"><summary>👁 Live marking-guide preview (admin only)</summary><div id="dailyRubricPreview" class="daily-preserve-text daily-editor-preview">${dailyFormattedTextHtml(q.marking_rubric||'')}</div></details></div>
 <div class="field"><label>Answer release (your local time)</label><input type="datetime-local" name="releaseAt" required value="${escAttr(dailyDateInput(q.release_at)||dailyDefaultRelease())}"></div><div class="field"><label>Optional submission deadline</label><input type="datetime-local" name="closeAt" value="${escAttr(dailyDateInput(q.close_at))}"><small>Without a separate deadline, submissions close at answer release.</small></div>
 <div class="field"><label>Publication</label><select name="status">${['draft','published'].map(v=>`<option value="${v}" ${q.status===v?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}</select></div></div>
 <div class="daily-actions"><button class="btn btn-primary" type="submit" id="dailySaveButton">Save Challenge</button><button type="button" class="btn btn-ghost" onclick="dailyCancelEdit()">Cancel</button></div>
 <p class="daily-note">Once students have submitted, the question, official answer, maximum marks and marking guide cannot be changed. Create another challenge to revise them.</p></form>`;
}
function dailyAdminSubmissions(){const q=dailyUi.items.find(x=>x.id===dailyUi.selected),rows=dailyUi.submissions||[];const graded=rows.filter(x=>x.score!==null&&x.score!==undefined);const average=graded.length?(graded.reduce((sum,x)=>sum+Number(x.score||0),0)/graded.length).toFixed(1):'—';const review=rows.filter(x=>x.status==='needs_review').length;return `<div class="card daily-submissions"><div class="section-head"><div><h2>Submissions</h2><p class="sub">${esc(q?.title||'Challenge')} · ${rows.length} submissions · ${graded.length} graded · Average ${average}/${Number(q?.max_marks||10)} · ${review} for review</p></div><button class="mini" type="button" onclick="dailyUi.showSubmissions=false;render()">Close ×</button></div>${rows.length?rows.map(s=>`<details class="daily-submission"><summary><strong>${esc(s.student_name)}</strong><span>${esc(s.status)} · ${s.score===null?'Not graded':`${s.score}/${q?.max_marks||10}`}</span></summary><div><p><b>Submitted:</b> ${esc(formatDateTime(s.submitted_at))}</p><div class="daily-student-response daily-preserve-text">${dailyFormattedTextHtml(s.answer_text)}</div>${s.answer_image_path?`<button type="button" class="mini" onclick="dailyViewOriginalPhoto('${escAttr(s.id)}')">📷 View submitted photo</button>`:''}${s.feedback?`<p class="daily-preserve-text"><b>Feedback:</b> ${dailyFormattedTextHtml(s.feedback)}</p>`:''}<div class="daily-actions"><button type="button" class="btn btn-light" onclick="dailyGradeOne('${escAttr(s.id)}')">🤖 AI Grade / Retry</button><button type="button" class="btn btn-ghost" onclick="dailyManualGrade('${escAttr(s.id)}',${Number(s.score)||0})">✎ Review Score</button></div></div></details>`).join(''):'<p class="sub">No responses have been submitted yet.</p>'}</div>`;}
async function dailyLoadAdmin(){dailyUi.loading=true;dailyUi.error='';render();try{const data=await api('challenge-admin-list');dailyUi.items=data.challenges||[];}catch(e){dailyUi.error=e.message;}finally{dailyUi.loading=false;render();}}
function dailyNewChallenge(){dailyUi.openForm=true;dailyUi.edit=null;render();document.getElementById('dailyEditorForm')?.scrollIntoView({behavior:'smooth',block:'start'});}
function dailyEditChallenge(id){dailyUi.edit=dailyUi.items.find(x=>x.id===id)||null;dailyUi.openForm=true;render();document.getElementById('dailyEditorForm')?.scrollIntoView({behavior:'smooth',block:'start'});}
function dailyCancelEdit(){dailyUi.openForm=false;dailyUi.edit=null;render();}
async function dailyCopyLink(slug){const u=dailyShareUrl(slug);try{await navigator.clipboard.writeText(u);toast('Challenge link copied.');}catch{prompt('Copy this challenge link:',u);}}
async function dailySaveChallenge(event){event.preventDefault();const form=event.target,button=form.querySelector('#dailySaveButton');if(button.disabled)return;
 const f=new FormData(form),releaseAt=f.get('releaseAt')?new Date(f.get('releaseAt')).toISOString():'',closeAt=f.get('closeAt')?new Date(f.get('closeAt')).toISOString():'';
 const body={id:dailyUi.edit?.id||'',title:f.get('title'),subject:f.get('subject'),topic:f.get('topic'),difficulty:f.get('difficulty'),questionText:f.get('questionText'),officialAnswer:f.get('officialAnswer'),markingRubric:f.get('markingRubric'),maxMarks:Number(f.get('maxMarks')),releaseAt,closeAt,status:f.get('status'),imageUrl:f.get('imageUrl'),videoUrl:f.get('videoUrl')};
 button.disabled=true;button.textContent='Saving…';try{await api('challenge-save',{method:'POST',body});toast('Challenge saved.');dailyUi.openForm=false;dailyUi.edit=null;await dailyLoadAdmin();}catch(e){toast(e.message);button.disabled=false;button.textContent='Save Challenge';}
}
async function dailyUploadMedia(input,target){const file=input.files?.[0];if(!file)return;const to=document.getElementById(target);if(!to)return;const max=file.type.startsWith('video/')?15:3;if(file.size>max*1024*1024){toast(`Maximum file size is ${max} MB.`);input.value='';return;}
 const before=to.placeholder;to.placeholder='Uploading media…';input.disabled=true;
 try{const payload=new FormData();payload.append('file',file);const response=await fetch('/api?action=challenge-media-upload',{method:'POST',headers:{authorization:`Bearer ${auth.token}`},body:payload});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Upload failed.');to.value=data.url;toast('Media uploaded. Save the challenge to attach it.');}
 catch(e){toast(e.message);}finally{to.placeholder=before;input.disabled=false;input.value='';}
}
async function dailyDeleteChallenge(id){
 const q=dailyUi.items.find(x=>x.id===id);if(!q)return;
 const total=Number(q.participation?.total)||0;
 const message=`Permanently delete “${q.title}” and ${total} student submission${total===1?'':'s'}? This will also erase their scores, feedback and personal result links. This action CANNOT be undone.`;
 if(!await appConfirm('Delete challenge permanently?',message,'Delete forever'))return;
 try{await api('challenge-delete',{method:'POST',body:{id,permanent:true}});
   if(dailyUi.selected===id){dailyUi.selected=null;dailyUi.showSubmissions=false;dailyUi.submissions=[];}
   if(dailyUi.edit?.id===id){dailyUi.edit=null;dailyUi.openForm=false;}
   toast('Challenge and its submissions permanently deleted.');await dailyLoadAdmin();
 }catch(e){toast('Could not delete the challenge: '+e.message);}
}
async function dailyOpenSubmissions(id){dailyUi.selected=id;dailyUi.showSubmissions=true;dailyUi.submissions=[];render();try{const data=await api('challenge-submissions',{query:{id}});dailyUi.submissions=data.submissions||[];}catch(e){toast(e.message);}render();}
async function dailyViewOriginalPhoto(id){
 try{
   const response=await fetch('/api?action=challenge-answer-image&id='+encodeURIComponent(id),{headers:{authorization:`Bearer ${auth.token}`},cache:'no-store'});
   if(!response.ok)throw Error('The photograph is unavailable or the private storage migration has not been applied.');
   const blob=await response.blob(),url=URL.createObjectURL(blob);
   const overlay=document.getElementById('modalRoot');if(!overlay)return;
   overlay.innerHTML='<div class="modal-backdrop gb-photo-modal"><div class="modal modal-wide"><button class="close" aria-label="Close" type="button">×</button><h2>Original handwritten submission</h2><img class="gb-photo-full" alt="Original student handwritten answer"><p class="sub">Only readable work can receive marks. Compare against the AI transcription.</p></div></div>';
   overlay.querySelector('.gb-photo-full').src=url;
   const close=()=>{URL.revokeObjectURL(url);overlay.innerHTML='';};
   overlay.querySelector('.close').onclick=close;
   overlay.querySelector('.modal-backdrop').onclick=e=>{if(e.target===e.currentTarget)close();};
 }catch(e){toast(e.message);}
}
async function dailyGradeOne(id){toast('Assessing written response…');try{const r=await api('challenge-grade',{method:'POST',body:{id}});if(r.pending)toast(r.message||'AI grading is currently unavailable.');else toast('AI assessment saved.');await dailyOpenSubmissions(dailyUi.selected);}catch(e){toast(e.message);}}
function dailyManualGrade(id,current){
 const q=dailyUi.items.find(x=>x.id===dailyUi.selected);const max=Number(q?.max_marks||10);
 const root=document.getElementById('modalRoot');if(!root)return;
 root.innerHTML=`<div class="modal-backdrop" id="dailyReviewModal"><form class="modal daily-review-modal" onsubmit="dailySaveManualGrade(event,'${escAttr(id)}')" role="dialog" aria-modal="true" aria-label="Review challenge score"><div class="modal-head"><div><h2>Review Written Answer</h2><p class="sub">Check the response and award a defensible mark (0–${max}).</p></div><button type="button" class="close" onclick="dailyCloseReview()" aria-label="Close">×</button></div><div class="field"><label>Score (maximum ${max})</label><input id="dailyReviewedScore" type="number" min="0" max="${max}" step="0.01" required value="${Number(current)||0}"></div><div class="field"><label>Feedback</label><textarea id="dailyReviewedFeedback" rows="5" minlength="8" maxlength="4000" required placeholder="Explain the student's strengths and how to improve."></textarea></div><div class="daily-actions"><button class="btn btn-primary" type="submit">Save Reviewed Mark</button><button type="button" class="btn btn-ghost" onclick="dailyCloseReview()">Cancel</button></div></form></div>`;
 root.querySelector('#dailyReviewedScore')?.focus();
}
function dailyCloseReview(){const root=document.getElementById('modalRoot');if(root)root.innerHTML='';}
async function dailySaveManualGrade(event,id){event.preventDefault();const target=event.target;const button=target.querySelector('button[type=submit]');if(button)button.disabled=true;
 try{await api('challenge-manual-grade',{method:'POST',body:{id,score:Number(target.querySelector('#dailyReviewedScore').value),feedback:target.querySelector('#dailyReviewedFeedback').value}});dailyCloseReview();toast('Reviewed result saved.');await dailyOpenSubmissions(dailyUi.selected);}catch(e){toast(e.message);if(button)button.disabled=false;}
}
/* v51.13.2 — best-effort browser tab-visibility proctoring for Daily Challenges.
   Browser apps cannot block tab switching. We detect it, warn twice, and
   automatically save a 0-mark forfeiture on the third detected switch.
   We persist attempts locally so a refresh does not reset the warning count.
   This is not tamper-proof against browser scripting, storage clearing or a new device. */
const DAILY_TAB_LIMIT=3;
const dailyGuardKey=(q)=>`gb:challenge:tabguard:${q.id}`;
function dailyGuardRead(q){
 try{const v=JSON.parse(dailyLocal(dailyGuardKey(q))||'{}');return {started:v.started===true,violations:Math.max(0,Math.min(DAILY_TAB_LIMIT,Number(v.violations)||0)),locked:v.locked===true};}
 catch{return {started:false,violations:0,locked:false};}
}
function dailyGuardRemember(){
 const q=dailyUi.challenge;if(!q)return;
 dailyStore(dailyGuardKey(q),JSON.stringify({started:dailyUi.guardActive,violations:dailyUi.guardViolations,locked:dailyUi.guardLocked}));
}
function dailyBeginChallenge(){
 const q=dailyUi.challenge;if(!q||dailyLocal(`gb:challenge-result:${q.id}`))return;
 if(dailyUi.guardLocked){void dailyAutoForfeit();return;}
 dailyUi.guardActive=true;dailyUi.studentStage='answer';dailyGuardRemember();dailyStudentPaint();
}
function dailyGuardStop(){
 const q=dailyUi.challenge;dailyUi.guardActive=false;dailyUi.guardLocked=false;dailyUi.guardNotice='';
 if(q)dailyStore(dailyGuardKey(q),JSON.stringify({started:false,violations:dailyUi.guardViolations,locked:false,finished:true}));
}
function dailyGuardLeave(){
 const q=dailyUi.challenge;
 if(!q||!dailyUi.guardActive||dailyUi.guardLocked||dailyUi.studentBusy||dailyUi.studentStage==='submitted'||!document.hidden)return;
 if(dailyLocal(`gb:challenge-result:${q.id}`)){dailyGuardStop();return;}
 dailyUi.guardViolations=Math.min(DAILY_TAB_LIMIT,dailyUi.guardViolations+1);
 if(dailyUi.guardViolations>=DAILY_TAB_LIMIT){
   dailyUi.guardLocked=true;
   dailyUi.guardNotice='Challenge ended automatically: the examination screen was left three times. Your answer is being submitted for a score of zero.';
   dailyGuardRemember();void dailyAutoForfeit();
 }else{
   dailyUi.guardNotice=`Tab switch ${dailyUi.guardViolations} of ${DAILY_TAB_LIMIT} recorded. Leaving the challenge screen ${DAILY_TAB_LIMIT} times ends the attempt with zero marks.`;
   dailyGuardRemember();
 }
}
function dailyGuardReturn(){
 if(!dailyUi.challenge||!dailyUi.guardActive)return;
 if(dailyUi.guardLocked){void dailyAutoForfeit();return;}
 if(dailyUi.studentStage==='answer'&&dailyUi.guardNotice)dailyStudentPaint();
}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{
 if(document.hidden)dailyGuardLeave();else dailyGuardReturn();
});
async function dailyAutoForfeit(){
 if(!dailyUi.challenge||!dailyUi.guardLocked||dailyUi.studentBusy)return;
 // The third switch is a final submission, even when the answer is empty.
 // Calling the normal submission API with forfeited=true records a 0 mark on
 // the server and makes the personal result link available after release.
 await dailySaveStudentAnswer({forfeited:true});
}
function dailyStudentShell(inner){return `<main class="daily-student-page"><div class="daily-student-container"><header class="daily-student-brand"><span class="daily-brand-logo"><img src="assets/icon.png" alt="Gifted Brainz"></span><div><strong>GIFTED BRAINZ</strong><small>ASSESSMENT HUB · DAILY CHALLENGE</small></div><span class="daily-brand-spark" aria-hidden="true">✦</span></header>${inner}<footer class="daily-student-foot">Think clearly <span>✦</span> Explain your reasoning <span>✦</span> Keep learning</footer></div></main>`;}
function dailyStudentPaint(){applyStudentTheme();const q=dailyUi.challenge;
 if(dailyUi.challengeError){app.innerHTML=dailyStudentShell(`<section class="daily-student-card"><h1>Challenge unavailable</h1><p>${esc(dailyUi.challengeError)}</p></section>`);return;}
 if(!q){app.innerHTML=dailyStudentShell(`<section class="daily-student-card"><p>Loading challenge…</p></section>`);return;}
 const open=Date.now()<Date.parse(q.release_at)&&(!q.close_at||Date.now()<Date.parse(q.close_at));
 if(dailyUi.studentStage==='welcome'){
   const saved=dailyLocal(`gb:challenge-result:${q.id}`);
   app.innerHTML=dailyStudentShell(`<section class="daily-student-card daily-welcome"><div class="gb-daily-premium-hero"><img src="assets/icon.png" alt="Gifted Brainz" class="gb-daily-official-logo"><div class="gb-daily-hero-type"><strong>GIFTED <span>BRAINZ</span></strong><small>UTME 2027 • ASSESSMENT HUB</small></div><div class="gb-daily-hero-crest" aria-hidden="true">🏆</div></div><span class="daily-pill">✦ DAILY CHALLENGE</span><h1>Show what you know. Own the challenge.</h1><p class="daily-lead">Think critically, solve independently and show what you know.</p><div class="daily-steps" aria-label="Challenge steps"><span><b>01</b> Read</span><span aria-hidden="true">→</span><span><b>02</b> Explain</span><span aria-hidden="true">→</span><span><b>03</b> Submit</span></div><div class="daily-challenge-summary"><div class="gb-challenge-title-label">YOUR CHALLENGE</div><strong>${esc(q.title)}</strong><span>${esc(q.subject||'General')} ${q.topic?'· '+esc(q.topic):''}</span><span>${esc(q.difficulty||'Intermediate')} · Written or Snap & Send</span><span>Answer available: ${esc(formatDateTime(q.release_at))}</span>${q.close_at?`<span>Submit before: ${esc(formatDateTime(q.close_at))}</span>`:''}</div>${saved?`<button class="btn btn-light wide" onclick="location.href='${escAttr(saved)}'">View My Submission ↗</button>`:open?`<button class="btn btn-primary wide" onclick="dailyBeginChallenge()">${dailyUi.guardActive?'Continue Challenge →': 'Yes, I’m Ready →'}</button>`:'<div class="daily-closed">Submissions have closed for this challenge.</div>'}<p class="daily-security-note">🔒 Exam integrity: stay on this challenge screen. Each tab/app switch is recorded. The third detected switch automatically ends the attempt with 0 marks. A browser cannot physically prevent switching.</p><small>✍ Type your answer or 📸 submit a clear photograph · No countdown timer</small></section>`);return;
 }
 if(dailyUi.studentStage==='submitted'){
   const l=dailyUi.studentResult?.link||'';
   app.innerHTML=dailyStudentShell(`<section class="daily-student-card daily-submitted"><div class="daily-success-icon">✓</div><h1>${dailyUi.studentResult?.forfeited?'Challenge automatically ended':'Challenge submitted!'}</h1><p>${dailyUi.studentResult?.forfeited?'The third detected tab switch ended this attempt. Your response was saved with a score of zero.':'Your response has been saved for automatic AI assessment.'} Your score and the official answer become visible at the scheduled release time.</p><div class="daily-release-time">Answer release · ${esc(formatDateTime(q.release_at))}</div><a class="btn btn-primary wide" href="${escAttr(l)}">View My Result Link ↗</a><button class="btn btn-ghost wide" onclick="dailyCopyResultLink()">Copy Result Link</button><small>Save your personal result link; it is needed to view your score.</small></section>`);return;
 }
 app.innerHTML=dailyStudentShell(`<section class="daily-student-card daily-question-card"><div class="daily-top-row"><span class="daily-pill">✦ ${esc(q.subject||'Daily Challenge')}</span><span class="daily-mark-chip">${Number(q.max_marks)} marks · Untimed</span></div><h1>${esc(q.title)}</h1><div class="daily-security-progress" role="status">🛡 Stay on this screen · Tab switches: ${dailyUi.guardViolations}/${DAILY_TAB_LIMIT}</div>${dailyUi.guardNotice?`<div class="daily-security-warning" role="alert">⚠ ${esc(dailyUi.guardNotice)} ${dailyUi.guardLocked?`<button class="btn btn-light" type="button" onclick="dailyAutoForfeit()">↻ Retry final submission</button>`:''}</div>`:''}<div class="daily-task-label">📘 YOUR CHALLENGE</div><div class="daily-question-stem daily-preserve-text">${dailyFormattedTextHtml(q.question_text)}</div>${dailyMediaHtml(q)}<form onsubmit="dailySubmitStudent(event)" class="daily-answer-form"><div class="field"><label for="dailyStudentName">Your name</label><input id="dailyStudentName" maxlength="100" required placeholder="Enter your name" value="${escAttr(dailyUi.studentName||dailyLocal('gb:challenge:name'))}" oninput="dailyUi.studentName=this.value;dailyStore('gb:challenge:name',this.value)"></div><div class="daily-writing-tip"><span aria-hidden="true">💡</span><div><strong>Show your understanding.</strong><small>Use separate paragraphs, numbered steps and calculations when needed. Your formatting will be kept.</small></div></div><div class="gb-answer-mode-switch" role="group" aria-label="How will you submit your work?"><button type="button" data-answer-mode="type" aria-pressed="${dailyUi.answerMode==='type'}" onclick="dailyChooseAnswerMode('type')">✍ Type your answers</button><button type="button" data-answer-mode="photo" aria-pressed="${dailyUi.answerMode==='photo'}" onclick="dailyChooseAnswerMode('photo')">📸 Snap & Send</button></div><div id="dailyTypedInput" ${dailyUi.answerMode==='photo'?'hidden':''} class="field"><label for="dailyAnswerText">Your written answer</label><textarea id="dailyAnswerText" minlength="10" maxlength="10000" rows="8" placeholder="Explain your answer, calculations, and reasoning in your own words…" oninput="dailyUpdateStudentDraft(this)">${esc(dailyUi.studentAnswer||dailyLocal(`gb:challenge:draft:${q.id}`))}</textarea><small>Minimum 10 characters · Maximum 10,000. Your draft is saved on this browser.</small></div><div class="gb-answer-photo" id="dailyPhotoInput" ${dailyUi.answerMode!=='photo'?'hidden':''}><div class="gb-photo-instructions"><strong>📷 Before you take your photograph</strong><p>Write neatly and number your answers. Ensure good lighting, hold the camera steady, focus clearly, and include the full page. AI marks only what it can read; unreadable work earns no credit.</p></div><label class="gb-photo-picker">📸 Take a photo or choose an image<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onchange="dailyChoosePhoto(this)" aria-describedby="dailyPhotoStatus"></label><img id="dailyPhotoPreview" class="gb-photo-preview" src="${escAttr(dailyUi.photoPreview||'')}" alt="Preview of your handwritten answer" ${dailyUi.photoPreview?'':'hidden'}><p id="dailyPhotoStatus" role="status">No photograph selected. You can retake the image before submitting.</p><small>JPG, PNG or WebP. Only clear, readable handwriting can receive marks. Your photograph is processed securely to read your answer.</small></div><p class="daily-note">Your response may be assessed with AI after release. Scores can be reviewed and corrected by the administrator.</p><div class="daily-actions"><button type="button" class="btn btn-light" onclick="dailyUi.studentStage='welcome';dailyStudentPaint()">← Back</button><button type="submit" class="btn btn-primary" ${!open||dailyUi.guardLocked?'disabled':''}>Submit Challenge →</button></div></form></section>`);
 renderMath(app);
}
async function dailyLoadChallenge(slug){
 dailyUi.studentStage='welcome';dailyUi.challenge=null;dailyUi.challengeError='';
 dailyUi.guardActive=false;dailyUi.guardViolations=0;dailyUi.guardLocked=false;dailyUi.guardNotice='';dailyStudentPaint();
 try{
   const d=await api('challenge-public',{query:{slug}});dailyUi.challenge=d.challenge;
   dailyUi.studentAnswer=dailyLocal(`gb:challenge:draft:${d.challenge.id}`);
   try{const recovered=await window.GBDrafts?.get(`daily-answer:${d.challenge.id}`);if(typeof recovered==='string')dailyUi.studentAnswer=recovered;}catch{}
   dailyUi.studentName=dailyLocal('gb:challenge:name')||(typeof candidateSavedName==='function'?candidateSavedName():'');dailyUi.answerMode='type';dailyUi.photoImage='';dailyUi.photoPreview='';
   const guard=dailyGuardRead(d.challenge),saved=dailyLocal(`gb:challenge-result:${d.challenge.id}`);
   if(guard.started&&!saved){
     dailyUi.guardActive=true;dailyUi.guardViolations=guard.violations;dailyUi.guardLocked=guard.locked;
     dailyUi.studentStage='answer';
     if(guard.violations>0)dailyUi.guardNotice=`Previously recorded tab switches: ${guard.violations}/${DAILY_TAB_LIMIT}.`;
   }
 }catch(e){dailyUi.challengeError=e.message;}
 dailyStudentPaint();
 if(dailyUi.guardLocked)void dailyAutoForfeit();
}
async function dailySubmitStudent(event){event.preventDefault();await dailySaveStudentAnswer({forfeited:false});}
async function dailySaveStudentAnswer({forfeited=false}={}){
 if(dailyUi.studentBusy)return;
 const q=dailyUi.challenge;if(!q)return;
 const photoMode=!forfeited&&dailyUi.answerMode==='photo';
 const answer=photoMode?'':(document.getElementById('dailyAnswerText')?.value??dailyUi.studentAnswer??'');
 const studentName=(document.getElementById('dailyStudentName')?.value??dailyUi.studentName??'').trim();
 if(!forfeited&&dailyUi.guardLocked)return toast('Your challenge has ended after three tab switches.');
 if(!forfeited&&!photoMode&&answer.trim().length<10)return toast('Write an answer of at least 10 characters.');
 if(!forfeited&&photoMode&&!dailyUi.photoImage)return toast('Take or choose a clear photo of your answers before submitting.');
 if(!forfeited&&dailyUi.photoBusy)return toast('Finish preparing the photograph first.');
 if(!forfeited&&studentName.length<2)return toast('Please enter your name.');
 if(!forfeited&&!(await appConfirm('Submit Daily Challenge','Once submitted, you cannot edit your answer or submit again on this browser.','Submit')))return;
 // A guard violation can arrive while the manual confirmation is open.
 if(!forfeited&&dailyUi.guardLocked)return void dailyAutoForfeit();
 if(dailyUi.studentBusy)return;
 dailyUi.studentBusy=true;dailyUi.studentAnswer=answer;
 try{
   let clientResultToken=dailyLocal(`gb:challenge:pending-token:${q.id}`);
   if(!/^[a-f0-9-]{36,100}$/i.test(clientResultToken)){
     clientResultToken=gbSecureUuid()+'-'+gbSecureUuid();dailyStore(`gb:challenge:pending-token:${q.id}`,clientResultToken);
   }
   const data=await api('challenge-submit',{method:'POST',body:{slug:q.slug,studentName:studentName||'Unnamed candidate',answer,answerImageData:photoMode?dailyUi.photoImage:'',deviceId:getDeviceId(),clientResultToken,forfeited},timeoutMs:photoMode?45000:24000});
   const link=dailyResultUrl(data.id,data.token);dailyUi.studentResult={...data,link,forfeited};
   dailyStore(`gb:challenge-result:${q.id}`,link);dailyStore('gb:challenge:name',studentName);
   dailyStore(`gb:challenge:draft:${q.id}`,'');void window.GBDrafts?.remove(`daily-answer:${q.id}`);
   dailyStore(`gb:challenge:pending-token:${q.id}`,'');dailyGuardStop();
   dailyUi.photoImage='';dailyUi.photoPreview='';
   if(!forfeited&&data.id&&data.token){
     // A background grading request never exposes an unreleased official answer or score.
     void api('challenge-grade-submitted',{method:'POST',body:{id:data.id,token:data.token},timeoutMs:23000}).catch(error=>console.warn('Marking will be retried at release:',error?.message));
   }
   dailyUi.studentStage='submitted';dailyStudentPaint();
   if(forfeited)toast('Challenge automatically ended after three tab switches.');
 }catch(e){
   toast(`Submission not completed: ${e.message}. Your answer is still saved locally.`);
   if(forfeited)dailyUi.guardNotice='Challenge ended after three tab switches. The server could not receive the final submission yet. Keep this page open and use Retry.';
   dailyStudentPaint();
 }finally{dailyUi.studentBusy=false;}
}
async function dailyCopyResultLink(){const link=dailyUi.studentResult?.link;if(!link)return;try{await navigator.clipboard.writeText(link);toast('Personal result link copied.');}catch{prompt('Copy your personal result link:',link);}}
function dailyResultPaint(){applyStudentTheme();const r=dailyUi.resultData;
 if(dailyUi.resultError&&!r){app.innerHTML=dailyStudentShell(`<section class="daily-student-card daily-result-wait daily-result-load-error"><span class="daily-pill">RESULT CONNECTION</span><h1>We couldn't load your result</h1><p role="alert">${esc(dailyUi.resultError)}</p><button type="button" class="btn btn-primary" onclick="dailyRefreshResult()">↻ Retry checking my result</button><small>Your submitted answer has not been deleted. You can also reopen your private result link.</small></section>`);return;}
 if(!r){app.innerHTML=dailyStudentShell(`<section class="daily-student-card daily-result-wait daily-result-connecting"><div class="daily-result-loader" aria-hidden="true"></div><h1>Checking your challenge result…</h1><p>Connecting to the results server. This usually takes only a moment.</p><button type="button" class="btn btn-ghost" onclick="dailyRefreshResult()">↻ Try again</button></section>`);return;}
 if(!r.released){app.innerHTML=dailyStudentShell(`<section class="daily-student-card daily-result-wait"><span class="daily-pill">✓ SUBMISSION RECEIVED</span><h1>Your result is not released yet</h1><p><strong>${esc(r.title)}</strong></p><p>Thank you, ${esc(r.studentName)}. The official answer and your feedback will be available automatically when the scheduled release time arrives.</p><div class="daily-release-time">${esc(formatDateTime(r.releaseAt))}</div><button class="btn btn-primary" onclick="dailyRefreshResult()">Check for Results ↻</button><small>Leave this page open to be notified here when your result is available. You can also return using this personal link.</small></section>`);return;}
 const gradePending=r.gradingPending||r.score===null;
 const percentage=!gradePending&&Number(r.maxMarks)>0?Math.round(100*Number(r.score)/Number(r.maxMarks)):null;
 const breakdown=r.gradingBreakdown||{};
 app.innerHTML=dailyStudentShell(`<section class="daily-student-card daily-result-ready"><div class="daily-result-header"><span class="daily-pill">✓ ANSWER RELEASED</span><h1>${esc(r.title)}</h1><p class="daily-lead daily-candidate-name">${esc(r.studentName)}</p><span class="daily-result-subtitle">${esc(r.subject||'Daily Challenge')} · Assessment report</span><div class="daily-print-meta">Generated ${esc(formatDateTime(new Date()))}</div></div><div class="daily-result-score" role="status"><span class="daily-score-icon" aria-hidden="true">✦</span><span class="daily-score-label">YOUR RESULT</span><strong>${gradePending?'Assessment pending':`${Number(r.score)} / ${Number(r.maxMarks)} marks`}</strong>${percentage!==null?`<small>${percentage}%</small><span class="daily-score-track"><i style="width:${Math.max(0,Math.min(100,percentage))}%"></i></span>`:''}</div>${r.requiresReview?'<p class="daily-review-flag">Your response has been flagged for human review. The administrator may update your mark.</p>':''}${dailyUi.resultError?`<p class="daily-result-warning" role="alert">⚠ ${esc(dailyUi.resultError)} Your previously loaded result is still shown.</p>`:''}${gradePending?`<div class="daily-grade-progress" role="status"><span class="daily-grade-progress-icon" aria-hidden="true">◌</span><div><strong>${dailyUi.gradeBusy?'Assessing your response…':'Score being prepared'}</strong><p>${esc(dailyUi.gradeMessage||'Your question and answers are available below. Your score will appear after assessment completes.')}</p></div><button type="button" class="btn btn-light" onclick="dailyRequestResultGrade(true)" ${dailyUi.gradeBusy?'disabled':''}>↻ ${dailyUi.gradeBusy?'Working…':'Retry grading'}</button></div>`:''}<div class="daily-result-section daily-section-question"><h2><span aria-hidden="true">❓</span> Question</h2><div class="daily-preserve-text">${dailyFormattedTextHtml(r.question)}</div>${dailySafeImage(r.imageUrl)?`<img class="daily-question-image daily-result-image" src="${escAttr(dailySafeImage(r.imageUrl))}" alt="Diagram supplied with this question" loading="eager">`:''}</div><div class="daily-result-section daily-section-student"><h2><span aria-hidden="true">✍</span> Your Answer</h2><div class="daily-student-response daily-preserve-text">${dailyFormattedTextHtml(r.answer)}</div></div><div class="daily-result-section daily-section-official"><h2><span aria-hidden="true">✓</span> Official Answer</h2><div class="daily-preserve-text">${dailyFormattedTextHtml(r.officialAnswer)}</div></div>${r.feedback?`<div class="daily-result-section daily-section-feedback"><h2><span aria-hidden="true">💬</span> Assessment Feedback</h2><div class="daily-preserve-text">${dailyFormattedTextHtml(r.feedback)}</div></div>`:''}${Array.isArray(breakdown.strengths)&&breakdown.strengths.length?`<div class="daily-result-section daily-section-strength"><h2><span aria-hidden="true">★</span> What You Did Well</h2><ul>${breakdown.strengths.map(v=>`<li class="daily-preserve-text">${dailyFormattedTextHtml(v)}</li>`).join('')}</ul></div>`:''}${Array.isArray(breakdown.improvements)&&breakdown.improvements.length?`<div class="daily-result-section daily-section-improve"><h2><span aria-hidden="true">↗</span> What to Improve</h2><ul>${breakdown.improvements.map(v=>`<li class="daily-preserve-text">${dailyFormattedTextHtml(v)}</li>`).join('')}</ul></div>`:''}<div class="daily-actions daily-result-actions"><button class="btn btn-light" type="button" onclick="dailyRefreshResult()">↻ Refresh Score</button><button class="btn btn-primary" type="button" onclick="dailyDownloadPdf(this)">↓ Download PDF</button><button class="btn btn-ghost" type="button" onclick="dailyPrintResult()">Print</button></div><p class="daily-pdf-helper">PDF downloads exclude browser links and automatic headers. For manual printing, switch off “Headers and footers” in the print settings.</p><p class="daily-note daily-disclaimer">AI-assisted marks are subject to administrator review and may be corrected.</p></section>`);
 renderMath(app);
}
// A genuine PDF export, unlike window.print(), does not carry the browser's
// URL/date/title headers or footers. The report itself supplies its own date.
let dailyPdfLibraryLoading=null;
function dailyEnsurePdfLibrary(){
 if(typeof window.html2pdf==='function')return Promise.resolve(window.html2pdf);
 if(!dailyPdfLibraryLoading){
  dailyPdfLibraryLoading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
   script.async=true;script.referrerPolicy='no-referrer';
   script.onload=()=>typeof window.html2pdf==='function'?resolve(window.html2pdf):reject(new Error('PDF generator was not available.'));
   script.onerror=()=>reject(new Error('Unable to load the PDF generator. Check your internet connection.'));
   document.head.appendChild(script);
  }).catch(error=>{dailyPdfLibraryLoading=null;throw error;});
 }
 return dailyPdfLibraryLoading;
}
async function dailyDownloadPdf(button){
 if(button?.disabled)return;
 const result=dailyUi.resultData;
 if(!result?.released)return toast('Your result must be released before it can be downloaded.');
 const report=document.querySelector('.daily-student-container');
 if(!report)return toast('Assessment report is not ready.');
 const before=button?.textContent;
 if(button){button.disabled=true;button.textContent='Preparing organised PDF…';}
 try{
   const html2pdf=await dailyEnsurePdfLibrary();
   if(typeof renderMath==='function')renderMath(report);
   if(document.fonts?.ready)await document.fonts.ready;
   await Promise.all([...report.querySelectorAll('img')].map(img=>img.decode?.().catch(()=>{})||Promise.resolve()));
   // Export the *same organised result layout* visible on screen. The clone
   // retains the true DOM headings, paragraph breaks, KaTeX and real tables.
   const clone=report.cloneNode(true);
   clone.classList.add('daily-pdf-export');
   clone.querySelectorAll('.daily-result-actions,.daily-pdf-helper,.daily-student-foot,.daily-grade-progress button').forEach(node=>node.remove());
   clone.querySelectorAll('img[loading="lazy"]').forEach(node=>node.loading='eager');
   clone.querySelectorAll('.gb-rich-content p,.gb-rich-list li,.gb-rich-table tr').forEach(node=>node.classList.add('daily-pdf-keep-lines'));
   const filename=`Gifted_Brainz_${String(result.studentName||'Student').replace(/[^a-z0-9-]+/gi,'_').slice(0,50)}_Challenge_Result.pdf`;
   await html2pdf().set({
     margin:[11,12,11,12],filename,
     image:{type:'jpeg',quality:.98},
     html2canvas:{scale:2,useCORS:true,allowTaint:false,logging:false,backgroundColor:'#ffffff',windowWidth:900,scrollY:0},
     pagebreak:{mode:['css','legacy'],avoid:['.daily-result-header','.daily-result-score','.daily-result-section h2','.daily-pdf-keep-lines']},
     jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
   }).from(clone).save();
 }catch(error){
   console.warn('Direct PDF export failed',error);
   toast('PDF generator unavailable. Use Print and turn OFF browser Headers and footers.');
 }finally{if(button){button.disabled=false;button.textContent=before;}}
}
function dailyPrintResult(){
 const previous=document.title;
 const result=dailyUi.resultData||{};
 document.title=`Gifted Brainz - ${String(result.studentName||'Student').replace(/[<>:"/\\|?*]/g,'').slice(0,65)} - Challenge Result`;
 let restored=false;
 const restore=()=>{if(!restored){restored=true;document.title=previous;window.removeEventListener('afterprint',restore);}};
 window.addEventListener('afterprint',restore);
 try{window.print();}finally{setTimeout(restore,6000);}
}
async function dailyLoadResult(id,token){
 clearInterval(dailyUi.releasePoll);dailyUi.resultId=id;dailyUi.resultToken=token;
 dailyUi.resultData=null;dailyUi.resultError='';dailyUi.gradeBusy=false;dailyUi.gradeAttempts=0;dailyUi.gradeLastAttemptAt=0;dailyUi.gradeMessage='';dailyResultPaint();
 // Begin polling immediately, even if the initial GET is slow or times out.
 // A pending *score* must also be checked; release=true is not the same as graded.
 dailyUi.releasePoll=setInterval(()=>{
   if(new URLSearchParams(location.search).has('challengeResult')){
     if(!dailyUi.resultData?.released||dailyUi.resultData?.gradingPending||dailyUi.resultData?.score===null)dailyRefreshResult();
   }else{clearInterval(dailyUi.releasePoll);dailyUi.releasePoll=null;}
 },15000);
 await dailyRefreshResult();
}
async function dailyEnableNotifications(){
 if(!('Notification' in window))return toast('Browser notifications are unavailable here. You can still check your result link.');
 try{const value=await Notification.requestPermission();toast(value==='granted'?'Alerts enabled while this result page remains open.':'Permission not granted. You can still check your result link.');}catch{toast('Browser notification permission could not be requested.');}
}
async function dailyRefreshResult(){
 if(dailyUi.resultBusy)return;
 dailyUi.resultBusy=true;
 try{
   const wasReleased=Boolean(dailyUi.resultData?.released);
   // Only data reads on this endpoint; AI grading occurs separately so the
   // student sees their released question/answer even if Groq is slow.
   const r=await api('challenge-result',{query:{id:dailyUi.resultId,token:dailyUi.resultToken},timeoutMs:11000});
   dailyUi.resultData=r;dailyUi.resultError='';
   if(!r.gradingPending&&r.score!==null){dailyUi.gradeMessage='';dailyUi.gradeBusy=false;}
   dailyResultPaint();
   if(!wasReleased&&r.released){toast('Your Daily Challenge result is now available!');if('Notification'in window&&Notification.permission==='granted')new Notification('Gifted Brainz: Challenge result ready',{body:r.title});}
   // Kick off grading without blocking initial report rendering. One automatic
   // request per visit; future retries are manual or after the lock expires.
   if(r.released&&(r.gradingPending||r.score===null)&&!dailyUi.gradeBusy&&dailyUi.gradeAttempts===0)void dailyRequestResultGrade(false);
 }catch(e){dailyUi.resultError=e.message;dailyResultPaint();}
 finally{dailyUi.resultBusy=false;}
}
async function dailyRequestResultGrade(manual=false){
 if(dailyUi.gradeBusy||!dailyUi.resultData?.released||dailyUi.resultData.score!==null&&!dailyUi.resultData.gradingPending)return;
 if(!dailyUi.resultId||!dailyUi.resultToken)return;
 const since=Date.now()-dailyUi.gradeLastAttemptAt;
 if(since<60000&&dailyUi.gradeAttempts>0){
   dailyUi.gradeMessage=`An assessment request was recently made. You can try again in about ${Math.ceil((60000-since)/1000)} seconds.`;
   dailyResultPaint();return;
 }
 dailyUi.gradeBusy=true;dailyUi.gradeAttempts++;dailyUi.gradeLastAttemptAt=Date.now();
 dailyUi.gradeMessage='We are checking your answer against the marking guide. You can view the question and official answer below while it runs.';
 dailyResultPaint();
 try{
   const response=await api('challenge-grade-result',{method:'POST',body:{id:dailyUi.resultId,token:dailyUi.resultToken},timeoutMs:23000});
   dailyUi.gradeMessage=response.pending?(response.message||'Your assessment is in progress. Please check again shortly.'):'Assessment complete. Updating your score…';
 }catch(error){
   dailyUi.gradeMessage='The assessment service is slow or unavailable. Your answer is safe. Refresh your result later or ask the administrator to review your score.';
   console.warn('Daily Challenge grading request was not completed',error);
 }finally{
   dailyUi.gradeBusy=false;dailyResultPaint();
   // This is a fresh, fast read — do not block on another Groq request.
   void dailyRefreshResult();
 }
}
