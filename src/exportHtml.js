// Turn a lesson into one self-contained web page: a readable blog post whose code you can run in any browser.
// JavaScript runs directly; Python loads Pyodide from a CDN the first time you press Run.
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const inline = (md) =>
  esc(md)
    .replace(/\[\[[^|\]]*\|([^\]]+)\]\]/g, '<mark>$1</mark>')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');

export function lessonHtml(L) {
  const code = L.work ?? L.code ?? '';
  const lang = L.lang === 'typescript' ? 'javascript' : L.lang;
  const runnable = code && (L.lang === 'python' || L.lang === 'javascript'); // TypeScript would need a compiler in the page
  const parts = [];
  let codeDone = false;
  const codeBlock = () => {
    codeDone = true;
    if (L.lang === 'html')
      return `<figure class="code"><figcaption>${esc(L.file || 'page.html')}</figcaption><iframe sandbox="allow-scripts" srcdoc="${esc(code)}"></iframe><details><summary>See the code</summary><pre>${esc(code)}</pre></details></figure>`;
    return `<figure class="code"><figcaption>${esc(L.file || (lang === 'python' ? 'main.py' : 'main.js'))}${runnable ? `<button onclick="run()">▶ Run</button>` : ''}</figcaption><pre id="src" contenteditable="true" spellcheck="false">${esc(code)}</pre><pre id="out" hidden></pre><div id="vis"></div></figure>`;
  };
  for (const b of L.story || []) {
    if (b.t === 'p') parts.push(`<p>${inline(b.md)}</p>`);
    else if (b.t === 'h') parts.push(`<h2>${esc(b.text)}</h2>`);
    else if (b.t === 'term')
      parts.push(
        `<aside class="term"><b>${esc(b.term)}</b> ${inline(b.plain || '')}${b.like ? `<span>${inline(b.like)}</span>` : ''}</aside>`,
      );
    else if (b.t === 'step' && L.steps?.[b.i]) {
      const st = L.steps[b.i];
      parts.push(`<h3>${b.i + 1}. ${esc(st.title)}</h3><p>${inline(st.md || '')}</p>`);
    } else if (b.t === 'quiz')
      parts.push(
        `<div class="quiz"><b>Check yourself:</b> ${inline(b.q)}<ol>${b.choices.map((c, i) => `<li><button onclick="this.parentNode.parentNode.querySelectorAll('button').forEach(x=>x.disabled=true);this.className='${i === b.answer ? 'yes' : 'no'}';this.closest('.quiz').querySelector('.why').hidden=false">${inline(c)}</button></li>`).join('')}</ol><p class="why" hidden>${inline(b.why || '')}</p></div>`,
      );
    if (!codeDone && code && b.t === 'p' && parts.length >= 2) parts.push(codeBlock());
  }
  if (!codeDone && code) parts.push(codeBlock());
  const words = (L.story || []).filter((b) => b.t === 'term').length;
  // The page's own tiny versions of Bento's helpers: show() draws bars for lists of numbers, the canvas helpers draw.
  const common = `
function draw(vis){const box=document.getElementById('vis');box.innerHTML='';for(const v of vis){const c=document.createElement('canvas');const f=document.createElement('figure');f.appendChild(c);box.appendChild(f);
const W=v.type==='canvas'?v.w:Math.max(240,v.data.length*28),H=v.type==='canvas'?v.h:160;const d=devicePixelRatio||1;c.width=W*d;c.height=H*d;c.style.width=Math.min(W,640)+'px';const x=c.getContext('2d');x.scale(d,d);
if(v.type==='canvas'){for(const m of v.cmds){const k=m[0];if(k==='bg'){x.fillStyle=m[1];x.fillRect(0,0,W,H)}else if(k==='circle'){x.fillStyle=m[4]||'#222';x.beginPath();x.arc(m[1],m[2],Math.max(0,m[3]),0,7);x.fill()}else if(k==='rect'){x.fillStyle=m[5]||'#222';x.fillRect(m[1],m[2],m[3],m[4])}else if(k==='line'){x.strokeStyle=m[5]||'#222';x.lineWidth=m[6]||1;x.beginPath();x.moveTo(m[1],m[2]);x.lineTo(m[3],m[4]);x.stroke()}else if(k==='text'){x.fillStyle=m[4]||'#222';x.font='14px system-ui';x.fillText(m[1],m[2],m[3])}}}
else{const P=['#ff8a5b','#5aa9ff','#a78bfa','#4cc9a0','#ffc94d'];const mx=Math.max(...v.data.map(Math.abs),1);const bw=(W-8)/v.data.length;v.data.forEach((n,i)=>{const h=Math.max(2,Math.abs(n)/mx*(H-30));x.fillStyle=P[i%5];x.fillRect(4+i*bw+2,H-6-h,bw-4,h);x.fillStyle='#888';x.font='10px system-ui';if(v.data.length<=24)x.fillText(String(Math.round(n*100)/100),4+i*bw+2,H-10-h)})}
if(v.label){const l=document.createElement('figcaption');l.textContent=v.label;f.appendChild(l)}}}`;
  const runner =
    lang === 'python'
      ? `${common}
const PRE=\`_V=[]
_C=None
def _cv():
    global _C
    if _C is None:
        _C={'type':'canvas','w':400,'h':400,'cmds':[]}
        _V.append(_C)
    return _C
def size(w,h):
    c=_cv(); c['w']=w; c['h']=h
def background(col): _cv()['cmds'].append(['bg',col])
def circle(x,y,r,col='black'): _cv()['cmds'].append(['circle',x,y,r,col])
def rect(x,y,w,h,col='black'): _cv()['cmds'].append(['rect',x,y,w,h,col])
def line(x1,y1,x2,y2,col='black',width=1): _cv()['cmds'].append(['line',x1,y1,x2,y2,col,width])
def text(s,x,y,col='black'): _cv()['cmds'].append(['text',str(s),x,y,col])
def show(x,label=None):
    if isinstance(x,(list,tuple)) and x and all(isinstance(v,(int,float)) and not isinstance(v,bool) for v in x):
        _V.append({'type':'bars','data':list(x),'label':label or ''})
    else:
        print((str(label)+': ' if label else '')+repr(x))
\`;
let py;
async function run(){const o=document.getElementById('out');o.hidden=false;o.textContent=py?'Running…':'Loading Python (first time only)…';
try{if(!py){const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';document.head.appendChild(s);await new Promise((r,j)=>{s.onload=r;s.onerror=j});py=await loadPyodide();}
let buf='';py.setStdout({batched:(t)=>{buf+=t+'\\n'}});py.setStderr({batched:(t)=>{buf+=t+'\\n'}});
try{await py.runPythonAsync(PRE+'\\n'+document.getElementById('src').innerText);}finally{const V=py.globals.get('_V');if(V)draw(V.toJs({dict_converter:Object.fromEntries}));}
o.textContent=buf||'(nothing printed)';}
catch(e){o.textContent=String(e.message||e).split('\\n').slice(-3).join('\\n')}}`
      : `${common}
function run(){const o=document.getElementById('out');o.hidden=false;const lines=[];const vis=[];let cv=null;const fmt=(a)=>a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ');
const con={log:(...a)=>lines.push(fmt(a)),error:(...a)=>lines.push(fmt(a)),warn:(...a)=>lines.push(fmt(a))};
const show=(x,l)=>{if(Array.isArray(x)&&x.length&&x.every(n=>typeof n==='number'))vis.push({type:'bars',data:x,label:l||''});else lines.push((l?l+': ':'')+JSON.stringify(x))};
const C=()=>{if(!cv){cv={type:'canvas',w:400,h:400,cmds:[]};vis.push(cv)}return cv};
const H={size:(w,h)=>{C().w=w;C().h=h},background:(c)=>C().cmds.push(['bg',c]),circle:(x,y,r,c)=>C().cmds.push(['circle',x,y,r,c]),rect:(x,y,w,h,c)=>C().cmds.push(['rect',x,y,w,h,c]),line:(a,b,c,d,col,w)=>C().cmds.push(['line',a,b,c,d,col,w]),text:(s,x,y,c)=>C().cmds.push(['text',String(s),x,y,c])};
try{new Function('console','show',...Object.keys(H),document.getElementById('src').innerText)(con,show,...Object.values(H));}catch(e){lines.push(e.name+': '+e.message)}o.textContent=lines.join('\\n')||'(nothing printed)';draw(vis);}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(L.title)}</title>
<style>
:root{--bg:#faf7f2;--ink:#1f1b16;--ink2:#5b544b;--line:#e9e2d6;--accent:#ff5f2e;--mint:#2fb380;--code:#fffdf9}
@media(prefers-color-scheme:dark){:root{--bg:#17150f;--ink:#f3eee6;--ink2:#a9a196;--line:#2d2a24;--code:#1f1c16}}
body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.7 "New York",ui-serif,Georgia,serif}
main{max-width:720px;margin:0 auto;padding:64px 24px 96px}
.kicker{font:700 12px ui-rounded,system-ui;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
h1{font-size:44px;line-height:1.1;margin:.2em 0 .3em;letter-spacing:-.02em}h2{margin-top:2em}
.q{font-style:italic;color:var(--ink2)}
code,pre{font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}p code{background:var(--code);padding:1px 5px;border-radius:5px;border:1px solid var(--line)}
mark{background:color-mix(in srgb,var(--accent) 16%,transparent);color:inherit;border-radius:4px;padding:0 3px}
figure.code{margin:28px 0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--code)}
figcaption{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--line);font:13px ui-monospace,monospace;color:var(--ink2)}
figcaption button{font:700 13px system-ui;border:0;border-radius:8px;padding:6px 12px;background:var(--ink);color:var(--bg);cursor:pointer}
pre{margin:0;padding:14px 16px;overflow:auto;white-space:pre;outline:0}#out{border-top:1px dashed var(--line);background:color-mix(in srgb,var(--mint) 7%,transparent)}
#vis{display:flex;flex-wrap:wrap;gap:12px;padding:0 14px}#vis figure{margin:10px 0}#vis figcaption{border:0;padding:4px 0;justify-content:center}
iframe{width:100%;height:360px;border:0;background:#fff}details{padding:8px 14px;font:14px system-ui}
.term{margin:20px 0;padding:12px 16px;border-left:3px solid var(--accent);background:var(--code);border-radius:0 10px 10px 0;font:16px/1.5 system-ui}.term span{display:block;color:var(--ink2);font-size:14px}
.quiz{margin:24px 0;padding:16px;border:1px solid var(--line);border-radius:14px;font:16px/1.5 system-ui}.quiz ol{list-style:none;padding:0;margin:10px 0 0;display:grid;gap:6px}
.quiz button{width:100%;text-align:left;font:15px system-ui;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
.quiz button.yes{border-color:var(--mint);background:color-mix(in srgb,var(--mint) 14%,transparent)}.quiz button.no{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);font:14px system-ui;color:var(--ink2)}
</style></head><body><main>
<div class="kicker">${esc(L.kicker || (L.mode === 'idea' ? `clever idea${L.context?.company ? ' · ' + L.context.company : ''}` : 'lesson'))}</div>
<h1>${esc(L.title)}</h1>
${L.q && L.q !== L.title ? `<p class="q">“${esc(L.q)}”</p>` : ''}
${parts.join('\n')}
<footer>Made with Bento, the learning app that uses your own AI. ${runnable ? 'You can edit the code above and press Run again.' : ''}${words ? ` ${words} new words in this post.` : ''}</footer>
</main>${runnable ? `<script>${runner}</script>` : ''}</body></html>`;
}
