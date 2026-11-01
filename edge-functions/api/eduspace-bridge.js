/** Gifted Brainz Assessment Hub → EduSpace bridge.
 * Student identity on Hub v50 is browser/device based, not a login account.
 * The secret browser credential below is therefore mandatory for all transfers.
 * No automatic identity inference by matching a name, email, or device ID alone.
 */
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization, x-device-id','access-control-allow-methods':'GET,POST,OPTIONS'}});
const fail=(message,status=400)=>reply({error:message},status);
const te=new TextEncoder();
const utf8=s=>te.encode(String(s));
const hexdigest=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(value){return hexdigest(await crypto.subtle.digest('SHA-256',utf8(value)));}
async function sign(secret,message){const k=await crypto.subtle.importKey('raw',utf8(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hexdigest(await crypto.subtle.sign('HMAC',k,utf8(message)));}
function randomSecret(){return hexdigest(crypto.getRandomValues(new Uint8Array(32)));}
const str=(v,max=120)=>String(v??'').trim().slice(0,max);
const ident=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(v||''));
const codeSafe=v=>/^[A-Za-z0-9_-]{6,40}$/.test(String(v||''));
function configuration(env){
 const secret=String(env('ASSESSMENT_HUB_SYNC_SECRET')||'');
 const origin=String(env('EDUSPACE_BASE_URL')||'').replace(/\/+$/,'');
 let valid=false;
 try{const url=new URL(origin);valid=url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/';}catch{}
 return {secret,origin,enabled:secret.length>=32&&valid};
}
async function sendEvent(conf,event,{fetcher=fetch}={}){
 const timestamp=String(Math.floor(Date.now()/1000));
 const raw=JSON.stringify(event);
 if(utf8(raw).length>300000)throw new Error('Sync payload exceeds EduSpace limits.');
 const digest=await sign(conf.secret,timestamp+'.'+raw);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),4500);
 try{
  const response=await fetcher(conf.origin+'/api/integrations/assessment-hub/events',{method:'POST',headers:{'content-type':'application/json','x-gb-hub-timestamp':timestamp,'x-gb-hub-signature':'sha256='+digest},body:raw,signal:controller.signal});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok)throw Object.assign(new Error(response.status>=500?'EduSpace sync temporarily unavailable.':str(data.error||'EduSpace rejected sync event.',180)),{status:response.status});
  if(data.ok!==true)throw new Error('EduSpace did not confirm the event.');
  return data;
 }finally{clearTimeout(timeout);}
}
async function requireLink(ctx,body){
 const deviceId=str(body.deviceId,150),key=str(body.syncKey,200);
 if(!deviceId||!key||!/^[a-f0-9]{64}$/i.test(key))return null;
 const hash=await sha256(key);
 const rows=await ctx.sb(ctx.context,'eduspace_hub_links',{query:`select=id,device_id,external_user_id,created_at&device_id=eq.${encodeURIComponent(deviceId)}&credential_hash=eq.${encodeURIComponent(hash)}&active=eq.true&limit=1`});
 return rows?.[0]||null;
}
async function dispatchOutbox(ctx,row){
 try{
  const result=await sendEvent(ctx.conf,row.payload,{fetcher:ctx.fetcher});
  await ctx.sb(ctx.context,'eduspace_hub_outbox',{method:'PATCH',query:`id=eq.${encodeURIComponent(row.id)}`,body:{status:'delivered',delivered_at:new Date().toISOString(),last_error:null},headers:{prefer:'return=minimal'}});
  return {delivered:true,duplicate:!!result.duplicate};
 }catch(error){
  const retryCount=Number(row.retry_count||0)+1;
  const next=new Date(Date.now()+Math.min(3600000,30000*Math.pow(2,Math.min(retryCount-1,7)))).toISOString();
  await ctx.sb(ctx.context,'eduspace_hub_outbox',{method:'PATCH',query:`id=eq.${encodeURIComponent(row.id)}`,body:{retry_count:retryCount,next_attempt_at:next,last_error: str(error?.message||'Network error',180)},headers:{prefer:'return=minimal'}}).catch(()=>{});
  return {delivered:false};
 }
}
async function queueEvent(ctx,event){
 const rows=await ctx.sb(ctx.context,'eduspace_hub_outbox',{method:'POST',query:'select=id,payload,retry_count',body:{event_id:event.eventId,external_user_id:event.externalUserId,payload:event,status:'pending',retry_count:0,next_attempt_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
 const row=rows?.[0];if(!row)throw new Error('Unable to queue sync event.');
 return dispatchOutbox(ctx,row);
}
async function reviewedAttempt(ctx,body,link){
 const attemptId=str(body.attemptId),resultToken=str(body.resultToken,100);
 if(!ident(attemptId)||!resultToken)return {error:'Select a completed CBT with its private result link.',status:400};
 const attempts=await ctx.sb(ctx.context,'attempts',{query:`select=id,quiz_id,device_id,result_token,status&status=eq.submitted&id=eq.${encodeURIComponent(attemptId)}&result_token=eq.${encodeURIComponent(resultToken)}&limit=1`});
 const attempt=attempts?.[0];
 if(!attempt||attempt.device_id!==link.device_id)return {error:'That completed CBT does not belong to this linked browser.',status:403};
 const quizzes=await ctx.sb(ctx.context,'quizzes',{query:`select=id,title,settings,access_mode&id=eq.${encodeURIComponent(attempt.quiz_id)}&limit=1`});
 const quiz=quizzes?.[0];
 if(!quiz)return {error:'CBT unavailable.',status:404};
 let settings=quiz.settings||{};if(typeof settings==='string'){try{settings=JSON.parse(settings);}catch{settings={};}}
 if(settings.reviewEnabled===false||settings.resultEnabled===false)return {error:'Question review is not enabled for this CBT.',status:403};
 // Biltz competitions may postpone result release; do not bypass challenge rules.
 const related=await ctx.sb(ctx.context,'brainz_biltz_attempts',{query:`select=challenge_id&attempt_id=eq.${encodeURIComponent(attemptId)}&limit=1`});
 if(related?.length){
  const challenges=await ctx.sb(ctx.context,'brainz_biltz_challenges',{query:`select=id,review_enabled,leaderboard_release,results_published,end_at,status& id=eq.${encodeURIComponent(related[0].challenge_id)}&limit=1`.replace('& id=','&id=')});
  const c=challenges?.[0];if(!c||c.review_enabled===false)return {error:'Challenge question review is unavailable.',status:403};
  const ended=Date.now()>Date.parse(c.end_at||'')||['cancelled','archived'].includes(c.status);
  if((c.leaderboard_release==='manual'&&!c.results_published)||(c.leaderboard_release==='after_end'&&!ended))return {error:'Challenge answers have not been released.',status:403};
 }
 return {attempt,quiz};
}
async function makeQuestionData(q,subject){
 const options=Array.isArray(q.options)?q.options:[];
 const answer=Number(q.answer);
 if(!str(q.text,25000)||str(q.text,25000).length<8||options.length<2||options.length>6||!Number.isInteger(answer)||answer<0||answer>=options.length)return null;
 return {questionId:String(q.id),subject:str(q.subject||subject,80)||'General',topic:str(q.topic||'',100),question:str(q.text,12000),options:options.map(x=>str(x,6000)),correctIndex:answer,explanation:str(q.explanation,10000)};
}
export async function handleEduSpaceBridge(action,request,body,{context,env,sb,fetcher=fetch}={}){
 const conf=configuration(env);const ctx={context,env,sb,conf,fetcher};
 if(action==='hub-integration-status'){
  if(!conf.enabled)return reply({configured:false,linked:false});
  const link=await requireLink(ctx,body);
  return reply({configured:true,linked:Boolean(link),linkedAt:link?.created_at||null});
 }
 if(!conf.enabled)return fail('EduSpace integration is not configured on Assessment Hub.',503);
 if(action==='hub-integration-link'){
  const code=str(body.linkCode,45),deviceId=str(body.deviceId,150);
  if(!codeSafe(code)||!deviceId||deviceId.length<8)return fail('Enter the one-time code from EduSpace.',400);
  const old=await ctx.sb(context,'eduspace_hub_links',{query:`select=id&device_id=eq.${encodeURIComponent(deviceId)}&active=eq.true&limit=1`});
  if(old?.length)return fail('This browser is already connected to EduSpace. Use Check Connection or contact the administrator for account recovery.',409);
  const externalUserId=crypto.randomUUID(),credential=randomSecret(),eventId=crypto.randomUUID();
  const event={eventId,type:'account.linked',externalUserId,linkCode:code};
  // Validate that Hub database storage is working BEFORE consuming the EduSpace code.
  // The provisional row does not authorise any synchronisation.
  const provisional=await ctx.sb(context,'eduspace_hub_links',{method:'POST',query:'select=id',body:{device_id:deviceId,external_user_id:externalUserId,credential_hash:await sha256(credential),active:false},headers:{prefer:'return=representation'}});
  if(!provisional?.[0])return fail('Unable to prepare a secure browser connection.',503);
  const id=provisional[0].id;
  let linkDeliveryError=null;
  for(let attemptNo=0;attemptNo<2;attemptNo++){
    try{await sendEvent(conf,event,{fetcher});linkDeliveryError=null;break;}
    catch(error){linkDeliveryError=error;if(Number(error.status)>=400&&Number(error.status)<500&&Number(error.status)!==429)break;}
  }
  if(linkDeliveryError){await ctx.sb(context,'eduspace_hub_links',{method:'DELETE',query:`id=eq.${encodeURIComponent(id)}`}).catch(()=>{});return fail(str(linkDeliveryError.message,200),Number(linkDeliveryError.status)||503);}
  // Mark the session active only after the signed EduSpace acknowledgement.
  const committed=await ctx.sb(context,'eduspace_hub_links',{method:'PATCH',query:`id=eq.${encodeURIComponent(id)}&select=id`,body:{active:true},headers:{prefer:'return=representation'}});
  if(!committed?.[0])return fail('EduSpace accepted the code, but the browser connection needs administrator recovery.',503);
  return reply({linked:true,syncKey:credential});
 }
 if(action==='hub-integration-unlink')return fail('Secure account unlinking requires an EduSpace-side recovery flow and is not yet available.',501);
 if(action==='hub-integration-drain'){
  const secret=str(env('ASSESSMENT_HUB_CRON_SECRET'),500);
  if(secret.length<32||request.headers.get('authorization')!==`Bearer ${secret}`)return fail('Authorisation required.',401);
  const rows=await ctx.sb(context,'eduspace_hub_outbox',{query:`select=id,payload,retry_count&status=eq.pending&next_attempt_at=lte.${encodeURIComponent(new Date().toISOString())}&order=created_at.asc&limit=6`});
  const outcomes=await Promise.all((rows||[]).map(row=>dispatchOutbox(ctx,row)));
  const delivered=outcomes.filter(x=>x.delivered).length;
  return reply({processed:(rows||[]).length,delivered});
 }
 const link=await requireLink(ctx,body);if(!link)return fail('Connect this browser to EduSpace before synchronising questions.',401);
 if(action==='hub-integration-sync-attempt'){
  const checked=await reviewedAttempt(ctx,body,link);if(checked.error)return fail(checked.error,checked.status);
  const {attempt,quiz}=checked;
  const existing=await ctx.sb(context,'eduspace_hub_outbox',{query:`select=id,status,retry_count,payload&external_user_id=eq.${encodeURIComponent(link.external_user_id)}&event_type=eq.cbt.completed&source_id=eq.${encodeURIComponent(attempt.id)}&limit=1`});
  if(existing?.length){
   if(existing[0].status==='delivered')return reply({ok:true,delivered:true,alreadySynced:true});
   return reply({ok:true,...await dispatchOutbox(ctx,existing[0]),alreadyQueued:true});
  }
  const answers=await ctx.sb(context,'attempt_answers',{query:`select=question_id,selected_answer&attempt_id=eq.${encodeURIComponent(attempt.id)}&limit=251`});
  if(!answers?.length)return fail('No answers are available to synchronise.',422);
  if(answers.length>250)return fail('This CBT exceeds the 250-question integration limit.',422);
  const ids=answers.map(a=>encodeURIComponent(a.question_id)).join(',');
  const questions=await ctx.sb(context,'questions',{query:`select=id,section_id,subject,text,options,answer,explanation&quiz_id=eq.${encodeURIComponent(attempt.quiz_id)}&id=in.(${ids})&limit=251`});
  const sections=await ctx.sb(context,'quiz_sections',{query:`select=id,title&quiz_id=eq.${encodeURIComponent(attempt.quiz_id)}&limit=200`});
  const sectionNames=new Map((sections||[]).map(x=>[String(x.id),str(x.title,100)]));
  const map=new Map((questions||[]).map(q=>[String(q.id),q]));
  const processed=[];let unanswered=0;
  for(const ans of answers){
   const q=map.get(String(ans.question_id));if(!q)continue;
   const data=await makeQuestionData(q,quiz.title);
   if(!data)continue;
   const index=Number(ans.selected_answer);
   if(ans.selected_answer===null||!Number.isInteger(index)||index<0||index>=data.options.length){unanswered++;continue;}
   processed.push({...data,topic:sectionNames.get(String(q.section_id))||data.topic,selectedIndex:index});
  }
  if(!processed.length)return fail('No answered multiple-choice questions are available for synchronisation.',422);
  const event={eventId:crypto.randomUUID(),type:'cbt.completed',externalUserId:link.external_user_id,attemptId:attempt.id,subject:str(quiz.title,80),questions:processed};
  const payloadSize=utf8(JSON.stringify(event)).length;
  if(payloadSize>300000)return fail('The review data is too large to synchronise in one event.',413);
  const rows=await ctx.sb(context,'eduspace_hub_outbox',{method:'POST',query:'select=id,payload,retry_count',body:{event_id:event.eventId,event_type:event.type,source_id:attempt.id,external_user_id:event.externalUserId,payload:event,status:'pending',retry_count:0,next_attempt_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
  if(!rows?.[0])return fail('Unable to queue completed CBT for synchronisation.',503);
  const result=await dispatchOutbox(ctx,rows[0]);
  return reply({ok:true,...result,answered:processed.length,unansweredExcluded:unanswered});
 }
 if(action==='hub-integration-bookmark'){
  const checked=await reviewedAttempt(ctx,body,link);if(checked.error)return fail(checked.error,checked.status);
  const questionId=str(body.questionId),save=body.save!==false;
  if(!ident(questionId))return fail('Select a reviewed CBT question.',400);
  const answers=await ctx.sb(context,'attempt_answers',{query:`select=question_id&attempt_id=eq.${encodeURIComponent(checked.attempt.id)}&question_id=eq.${encodeURIComponent(questionId)}&limit=1`});
  if(!answers?.length)return fail('Question does not belong to your completed CBT.',403);
  const rows=await ctx.sb(context,'questions',{query:`select=id,section_id,subject,text,options,answer,explanation&quiz_id=eq.${encodeURIComponent(checked.attempt.quiz_id)}&id=eq.${encodeURIComponent(questionId)}&limit=1`});
  const q=rows?.[0];if(!q)return fail('Question unavailable.',404);
  const data=await makeQuestionData(q,checked.quiz.title);if(!data)return fail('Question format cannot be bookmarked.',422);
  const sections=await ctx.sb(context,'quiz_sections',{query:`select=id,title&quiz_id=eq.${encodeURIComponent(checked.attempt.quiz_id)}&id=eq.${encodeURIComponent(q.section_id)}&limit=1`});
  if(sections?.[0]?.title)data.topic=str(sections[0].title,100);
  const event={eventId:crypto.randomUUID(),type:save?'question.bookmarked':'question.unbookmarked',externalUserId:link.external_user_id,...(save?data:{questionId})};
  const result=await queueEvent(ctx,event);
  return reply({ok:true,...result,bookmarked:save});
 }
 return fail('Unknown integration action.',404);
}
export const __bridgeTest={configuration,sendEvent,sha256,makeQuestionData};
