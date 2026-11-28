/* Compact WhatsApp channel prompt for the Assessment Hub landing screens.
   It never appears while a learner is taking an assessment. */
(()=>{'use strict';
  if(window.top!==window.self)return;
  const URL='https://whatsapp.com/channel/0029VbC1jX73QxRtsF3Kms3r';
  const KEY='gbHubChannelPromptDecisionV1',DAY=86400000;
  let choice=null;
  try{choice=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
  const cooldown=choice?.action==='opened'?30*DAY:7*DAY;
  if(choice&&Number(choice.time)&&Date.now()-Number(choice.time)<cooldown)return;
  const save=action=>{try{localStorage.setItem(KEY,JSON.stringify({action,time:Date.now()}))}catch{}};
  let host=null,returnFocus=null;
  const dismiss=action=>{if(!host)return;save(action);host.remove();host=null;returnFocus?.focus?.({preventScroll:true})};
  function allowed(){
    if(document.hidden||document.querySelector('.modal-backdrop:not([hidden]),.gb-hub-channel-overlay'))return false;
    const app=document.getElementById('app');
    if(!app)return false;
    // Public/admin landing only. Do not interrupt exam, marking, result or challenge screens.
    if(app.querySelector('.cbt-shell,.boost-play,.boost-student-shell,.result-wrap,.student-result,.submitting-card,.student-loading-landing,.biltz-page'))return false;
    return !!app.querySelector('.student-landing,.login-wrap,.app-shell');
  }
  function show(){
    if(!allowed())return false;
    returnFocus=document.activeElement;
    host=document.createElement('div');host.className='gb-hub-channel-overlay';host.id='gbHubChannelWelcome';
    host.innerHTML=`<section class="gb-hub-channel-dialog" role="dialog" aria-modal="true" aria-labelledby="gbHubChannelHeading" aria-describedby="gbHubChannelText">
      <button class="gb-hub-channel-close" type="button" data-dismiss aria-label="Close dialog">×</button>
      <span class="gb-hub-channel-mark" aria-hidden="true">✦</span>
      <h2 id="gbHubChannelHeading">Follow our WhatsApp Channel</h2>
      <p id="gbHubChannelText">Get new CBT announcements, academic updates and learning opportunities.</p>
      <a class="gb-hub-channel-follow" href="${URL}" target="_blank" rel="noopener noreferrer" data-follow>Follow the Channel ↗</a>
      <button class="gb-hub-channel-later" type="button" data-dismiss>Not now</button>
    </section>`;
    document.body.appendChild(host);
    host.querySelector('.gb-hub-channel-close').focus({preventScroll:true});
    host.addEventListener('click',e=>{
      if(e.target.closest('[data-follow]')){dismiss('opened');return;}
      if(e.target===host||e.target.closest('[data-dismiss]'))dismiss('dismissed');
    });
    host.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();dismiss('dismissed')}
      if(e.key==='Tab'){
        const nodes=[...host.querySelectorAll('button,a[href]')],first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    });
    return true;
  }
  let attempts=0;
  function schedule(){
    if(document.hidden){document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()},{once:true});return;}
    if(show()||++attempts>18)return;
    setTimeout(schedule,600);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(schedule,1400),{once:true});
  else setTimeout(schedule,1400);
})();
