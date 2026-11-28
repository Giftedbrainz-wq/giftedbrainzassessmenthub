/* Gifted Brainz v51.13 — safe, universal text/Markdown/LaTeX renderer.
 * The input is untrusted plain text. NEVER use source text as HTML.
 * Literal mode retains exact whitespace; rich mode handles Markdown tables,
 * headings, lists and typeset mathematics. No external Markdown dependency.
 */
(function(root){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const usableMath=options=>typeof options.mathHtml==='function'?options.mathHtml:escape;
 const K='\uE100GB',E='\uE101';
 function render(value,options={}){
  const mode=options.mode||'rich';
  const mathHtml=usableMath(options);
  const katex=options.katex===undefined?root.katex:options.katex;
  let source=String(value??'').replace(/\r\n?/g,'\n').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[\u2028\u2029]/g,'\n').replace(/\x1b\[[0-9;]*m/g,'').replace(/<\|(?:im_start|im_end|eot_id|endoftext|assistant|final)\|>/gi,'');
  if(mode==='literal')return mathHtml(source);
  if(mode==='smart'&&!/(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d{1,2}[.)]\s|\|[^\n|]+\|[^\n|]+\||>\s|```|\*\*[^*]+\*\*)/.test(source))return mathHtml(source);
  if(!source.trim())return '';
  const tokens=[];
  function protect(html){const key=K+tokens.length+E;tokens.push(html);return key;}
  function restore(s){return String(s).replace(/\uE100GB(\d+)\uE101/g,(_,n)=>tokens[Number(n)]??'');}
  function equation(expr,display=false){
    const tex=String(expr??'').trim();if(!tex)return '';
    try{if(typeof katex?.renderToString==='function')return (display?'<div class="gb-rich-math-display">':'<span class="gb-rich-math-inline">')+katex.renderToString(tex,{throwOnError:true,strict:false,trust:false,displayMode:display,output:'html'})+(display?'</div>':'</span>');}catch(error){/* fall back to safe, readable math */}
    return (display?'<div class="gb-rich-math-display">':'<span class="gb-rich-math-inline">')+mathHtml('\\('+tex+'\\)')+(display?'</div>':'</span>');
  }
  // Protect equations before any Markdown tokenisation: |, &, *, _ and \\ inside
  // TeX must never be misread as table columns or emphasis.
  source=source.replace(/```\s*(?:math|latex|tex)\s*\n([\s\S]*?)\n?```/gi,(_,t)=>protect(equation(t,true)));
  source=source.replace(/```([^\n`]*)\n([\s\S]*?)\n?```/g,(_,lang,body)=>protect(`<pre class="gb-rich-code"><code>${escape(body.replace(/\n$/,''))}</code></pre>`));
  source=source.replace(/\\\[([\s\S]*?)\\\]/g,(_,t)=>protect(equation(t,true)));
  source=source.replace(/\$\$([\s\S]*?)\$\$/g,(_,t)=>protect(equation(t,true)));
  source=source.replace(/\\begin\{(align\*?|aligned|equation\*?|gather\*?|gathered|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|array|alignedat\*?)\}([\s\S]*?)\\end\{\1\}/g,(full)=>protect(equation(full,true)));
  source=source.replace(/\\\(([\s\S]*?)\\\)/g,(_,t)=>protect(equation(t,false)));
  source=source.replace(/(?<!\\)\$([^$\n]+?)\$/g,(full,t)=>/\\|\^|_|[=+*/]|\d/.test(t)?protect(equation(t,false)):full);
  source=source.replace(/`([^`\n]+)`/g,(_,t)=>protect(`<code class="gb-rich-inline-code">${escape(t)}</code>`));
  const cleanLine=t=>String(t??'').trim();
  function inline(s){
    let t=String(s??'').replace(/\\([*_`])/g,'$1')
      .replace(/\[([^\]]+)]\((?:https?:\/\/|mailto:)[^\s)]*\)/gi,'$1');
    t=mathHtml(t);
    // Math was tokenised first, so these are ordinary Markdown markers.
    t=t.replace(/\*\*([^*\n]+?)\*\*/g,'<strong>$1</strong>')
      .replace(/__([^_\n]+?)__/g,'<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g,'<em>$1</em>')
      .replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g,'<em>$1</em>')
      .replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
    return restore(t);
  }
  function cells(line){
    // Explicitly escaped pipes are treated as literal cell content.
    const t=cleanLine(line).replace(/^\|/,'').replace(/\|$/,'');
    const out=[];let part='',escaped=false;
    for(let i=0;i<t.length;i++){
      const c=t[i];if(escaped){part+=c;escaped=false;continue;}
      if(c==='\\'&&t[i+1]==='|'){escaped=true;continue;}
      if(c==='|'){out.push(part.trim());part='';}else part+=c;
    }
    out.push(part.trim());return out;
  }
  const divider=t=>/^:?-{3,}:?$/.test(t.trim());
  function tableStarting(lines,i){
    if(!lines[i]?.includes('|')||i+1>=lines.length)return false;
    const first=cells(lines[i]),second=cells(lines[i+1]);
    if(first.length<2)return false;
    if(second.length===first.length&&second.every(divider))return true;
    return second.length===first.length&&second.length>1&&lines[i+1]?.includes('|')&&first.every(x=>x.trim())&&second.some(x=>x.trim())&& !/^[-+*]\s/.test(lines[i+1].trim());
  }
  function makeTable(lines,index){
    const head=cells(lines[index]);let i=index+1;
    const sep=cells(lines[i]||'');
    const isHeaderSeparator=sep.length===head.length&&sep.every(divider);
    if(isHeaderSeparator)i++;
    const body=[];
    const maxRows=60;
    for(;i<lines.length&&body.length<maxRows;i++){
      const l=lines[i];if(!l.trim()||!l.includes('|'))break;
      const parts=cells(l);if(parts.length!==head.length||parts.every(x=>/^:?-{3,}:?$/.test(x)))break;
      body.push(parts);
    }
    const heading=head.map(c=>`<th scope="col">${inline(c)}</th>`).join('');
    const rows=body.map(row=>`<tr>${row.map(cell=>`<td>${inline(cell)}</td>`).join('')}</tr>`).join('');
    const html=`<div class="gb-rich-table-scroll" role="region" aria-label="Explanation table" tabindex="0"><table class="gb-rich-table"><thead><tr>${heading}</tr></thead><tbody>${rows}</tbody></table></div>`;
    return {html,next:i};
  }
  const lines=source.trim().split('\n');
  const blocks=[];let paragraph=[],items=[],listType='';
  const flushP=()=>{if(paragraph.length){blocks.push(`<p>${inline(paragraph.join('<GBBR>').replace(/<GBBR>/g,'\n')).replace(/\n/g,'<br>')}</p>`);paragraph=[];}};
  const flushList=()=>{if(items.length){blocks.push(`<${listType} class="gb-rich-list">${items.map(v=>`<li>${inline(v)}</li>`).join('')}</${listType}>`);items=[];listType='';}};
  const flush=()=>{flushP();flushList();};
  for(let i=0;i<lines.length;){
    const s=cleanLine(lines[i]);
    if(!s){flush();i++;continue;}
    if(new RegExp('^'+K+'\\d+'+E+'$').test(s)){flush();blocks.push(restore(s));i++;continue;}
    if(tableStarting(lines,i)){
      flush();const table=makeTable(lines,i);blocks.push(table.html);i=table.next;continue;
    }
    if(/^(?:-{3,}|_{3,}|\*{3,})\s*$/.test(s)){flush();blocks.push('<hr class="gb-rich-rule">');i++;continue;}
    const head=s.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
    if(head){flush();blocks.push(`<h3 class="gb-rich-heading">${inline(head[1])}</h3>`);i++;continue;}
    const solo=s.match(/^\*\*(.{2,95}?)\*\*\s*:?$/);
    if(solo){flush();blocks.push(`<h3 class="gb-rich-heading">${inline(solo[1])}</h3>`);i++;continue;}
    const li=s.match(/^\s*(?:[-*+•]|📌)\s+(.+)$/),num=s.match(/^\d{1,3}[.)]\s+(.+)$/);
    if(li||num){flushP();const type=num?'ol':'ul';if(items.length&&listType!==type)flushList();listType=type;items.push((li||num)[1]);i++;continue;}
    const quote=s.match(/^>\s+(.+)$/);if(quote){flush();blocks.push(`<blockquote class="gb-rich-quote">${inline(quote[1])}</blockquote>`);i++;continue;}
    if(items.length)flushList();
    if(/^(?:Step\s+\d+|Final\s+answer|Correct\s+answer|Formula|Therefore|Working|Solution|Explanation)\s*[:—-]/i.test(s))flushP();
    // Preserve author indentation and repeated spaces in ordinary paragraph
    // lines; only the parser's control decisions use the trimmed value.
    paragraph.push(lines[i]);i++;
  }
  flush();
  return `<div class="gb-rich-content">${blocks.join('')}</div>`;
 }
 root.GiftedRichContent=render;
 root.GiftedStudyAiFormat=(value,options={})=>render(value,{...options,mode:'rich'});
})(typeof window!=='undefined'?window:globalThis);
