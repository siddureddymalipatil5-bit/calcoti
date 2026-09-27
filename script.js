/* ---------- Utilities ---------- */
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let history=[];
function pushHistory(label,expr,res){
  history.unshift({label,expr,res,t:new Date().toLocaleTimeString()});
  if(history.length>60)history.pop();
  renderHistory();
}
function renderHistory(){
  const el=$('#histPanel');
  el.innerHTML=history.map((h,i)=>`<div class="hist-item" data-i="${i}">[${h.label}] ${h.expr} = <b>${h.res}</b> <span style="float:right">${h.t}</span></div>`).join('')||'<div class="hint">No history yet.</div>';
  el.querySelectorAll('.hist-item').forEach(d=>d.onclick=()=>{
    const h=history[+d.dataset.i];
    if(h.label==='Sci'){sciExpr=h.expr;updateSciDisplay();}
  });
}
$('#histBtn').onclick=()=>{$('#histPanel').style.display=$('#histPanel').style.display==='none'?'block':'none';};
$('#themeBtn').onclick=()=>{
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('vajra-theme',next);}catch(e){}
};
try{const t=localStorage.getItem('vajra-theme'); if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}

/* ---------- Expression parser (real + complex, functions, constants) ---------- */
class Cplx{constructor(re,im=0){this.re=re;this.im=im;}
  add(o){return new Cplx(this.re+o.re,this.im+o.im);}
  sub(o){return new Cplx(this.re-o.re,this.im-o.im);}
  mul(o){return new Cplx(this.re*o.re-this.im*o.im,this.re*o.im+this.im*o.re);}
  div(o){const d=o.re*o.re+o.im*o.im;return new Cplx((this.re*o.re+this.im*o.im)/d,(this.im*o.re-this.re*o.im)/d);}
  pow(n){if(this.im===0&&Number.isInteger(n)&&n>=0){let r=new Cplx(1,0);for(let i=0;i<n;i++)r=r.mul(this);return r;}
    const r=Math.hypot(this.re,this.im),th=Math.atan2(this.im,this.re);
    const nr=Math.pow(r,n),nth=th*n; return new Cplx(nr*Math.cos(nth),nr*Math.sin(nth));}
  toString(){const re=+this.re.toFixed(10),im=+this.im.toFixed(10);
    if(im===0)return String(re);
    if(re===0)return im+'i';
    return re+(im>0?'+':'')+im+'i';}
}
function tokenize(s){
  s=s.replace(/\s+/g,'');
  const toks=[]; let i=0;
  const isD=c=>/[0-9.]/.test(c), isA=c=>/[a-zA-Z_]/.test(c);
  while(i<s.length){
    const c=s[i];
    if(isD(c)){let j=i;while(j<s.length&&isD(s[j]))j++;toks.push({t:'num',v:s.slice(i,j)});i=j;continue;}
    if(isA(c)){let j=i;while(j<s.length&&/[a-zA-Z0-9_]/.test(s[j]))j++;toks.push({t:'id',v:s.slice(i,j)});i=j;continue;}
    if('+-*/^%(),!'.includes(c)){toks.push({t:c});i++;continue;}
    i++; // skip unknown char
  }
  return toks;
}
const FUNCS={sin:'sin',cos:'cos',tan:'tan',asin:'asin',acos:'acos',atan:'atan',sqrt:'sqrt',cbrt:'cbrt',ln:'ln',log:'log',log2:'log2',abs:'abs',exp:'exp'};
function parseExpr(str,vars,degMode){
  const toks=tokenize(str); let p=0;
  function peek(){return toks[p];}
  function eat(t){if(toks[p]&&toks[p].t===t){p++;return true;}return false;}
  function num(n){return new Cplx(n,0);}
  function factParse(v){ // factorial postfix
    let node=v;
    while(peek()&&peek().t==='!'){p++;
      if(node.im!==0)throw new Error('factorial needs real number');
      let n=Math.round(node.re),r=1; if(n<0)throw new Error('factorial of negative');
      for(let k=2;k<=n;k++)r*=k; node=num(r);
    }
    return node;
  }
  function primary(){
    const tk=peek();
    if(!tk)throw new Error('Unexpected end');
    if(tk.t==='num'){p++;return factParse(num(parseFloat(tk.v)));}
    if(tk.t==='('){p++;const e=addsub();if(!eat(')'))throw new Error('Expected )');return factParse(e);}
    if(tk.t==='-'){p++;const e=unary();return e.mul(num(-1));}
    if(tk.t==='+'){p++;return unary();}
    if(tk.t==='id'){
      const name=tk.v; p++;
      if(name==='i')return factParse(new Cplx(0,1));
      if(name==='pi')return factParse(num(Math.PI));
      if(name==='e')return factParse(num(Math.E));
      if(vars&&name in vars)return factParse(num(vars[name]));
      if(eat('(')){
        const args=[addsub()];
        while(eat(','))args.push(addsub());
        if(!eat(')'))throw new Error('Expected )');
        const a=args[0];
        let out;
        const deg2rad=x=>degMode?x*Math.PI/180:x, rad2deg=x=>degMode?x*180/Math.PI:x;
        switch(name){
          case 'sin': out=num(Math.sin(deg2rad(a.re))); break;
          case 'cos': out=num(Math.cos(deg2rad(a.re))); break;
          case 'tan': out=num(Math.tan(deg2rad(a.re))); break;
          case 'asin': out=num(rad2deg(Math.asin(a.re))); break;
          case 'acos': out=num(rad2deg(Math.acos(a.re))); break;
          case 'atan': out=num(rad2deg(Math.atan(a.re))); break;
          case 'sqrt': out = a.re<0&&a.im===0 ? new Cplx(0,Math.sqrt(-a.re)) : num(Math.sqrt(a.re)); break;
          case 'cbrt': out=num(Math.cbrt(a.re)); break;
          case 'ln': out=num(Math.log(a.re)); break;
          case 'log': out=args.length>1?num(Math.log(a.re)/Math.log(args[1].re)):num(Math.log10(a.re)); break;
          case 'log2': out=num(Math.log2(a.re)); break;
          case 'abs': out=num(Math.hypot(a.re,a.im)); break;
          case 'exp': out=num(Math.exp(a.re)); break;
          default: throw new Error('Unknown function '+name);
        }
        return factParse(out);
      }
      throw new Error('Unknown identifier '+name);
    }
    throw new Error('Unexpected token');
  }
  function unary(){return primary();}
  function power(){let l=unary(); if(eat('^')){const r=power(); l=l.pow(r.re);} return l;}
  function term(){let l=power(); while(peek()&&(peek().t==='*'||peek().t==='/'||peek().t==='%')){
      const op=peek().t; p++; const r=power();
      if(op==='*')l=l.mul(r); else if(op==='/')l=l.div(r); else l=num(l.re % r.re);
    } return l;}
  function addsub(){let l=term(); while(peek()&&(peek().t==='+'||peek().t==='-')){
      const op=peek().t; p++; const r=term();
      l = op==='+' ? l.add(r) : l.sub(r);
    } return l;}
  const res=addsub();
  if(p<toks.length)throw new Error('Unexpected trailing input');
  return res;
}
function evalExpr(str,vars,degMode){ return parseExpr(str,vars,degMode); }

/* ---------- Tabs ---------- */
const MODES=[
  {id:'sci',label:'Scientific'},
  {id:'ai',label:'Ask AI'},
  {id:'grade',label:'Percentage / Grade'},
  {id:'shop',label:'Shop & Billing'},
  {id:'split',label:'Split & Tip'},
  {id:'convert',label:'Unit & Currency'},
  {id:'finance',label:'EMI / Interest'},
  {id:'age',label:'Age Calculator'},
  {id:'prog',label:'Programmer'},
  {id:'eq',label:'Equation Solver'},
  {id:'nl',label:'Ask in Words'},
  {id:'stats',label:'Statistics'},
  {id:'matrix',label:'Matrix'},
  {id:'graph',label:'Graphing'},
];
const tabsEl=$('#tabs'), panelsEl=$('#panels');
MODES.forEach(m=>{
  const b=document.createElement('button'); b.textContent=m.label; b.dataset.id=m.id;
  b.onclick=()=>switchMode(m.id); tabsEl.appendChild(b);
  const d=document.createElement('div'); d.className='panel'; d.id='p-'+m.id; panelsEl.appendChild(d);
});
function switchMode(id){
  $$('nav.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
  $$('.panel').forEach(p=>p.classList.toggle('active',p.id==='p-'+id));
}
switchMode('sci');

/* ---------- Scientific ---------- */
let sciExpr='', degMode=true;
const sciPanel=$('#p-sci');
sciPanel.innerHTML=`
  <div class="display"><div class="expr" id="sciExprLine">&nbsp;</div><div class="result" id="sciResLine">0</div></div>
  <div class="row">
    <span class="pill ${degMode?'on':''}" id="degPill">DEG</span>
    <span class="pill" id="radPill">RAD</span>
    <span class="pill" id="cxPill" title="Treat sqrt of negative numbers, and 'i', as complex">Complex: on</span>
    <span class="pill" id="mcPill" title="Clear memory">MC</span>
    <span class="pill" id="mrPill" title="Recall memory">MR: 0</span>
    <span class="pill" id="mPlusPill" title="Add current result to memory">M+</span>
    <span class="pill" id="mMinusPill" title="Subtract current result from memory">M−</span>
  </div>
  <div class="grid" id="sciGrid" style="grid-template-columns:repeat(6,1fr)"></div>
`;
const SCI_KEYS=[
  ['(',')','%','C','⌫','÷'],
  ['sin(','cos(','tan(','π','e','×'],
  ['asin(','acos(','atan(','sqrt(','^','−'],
  ['ln(','log(','7','8','9','+'],
  ['!','i','4','5','6','='],
  ['abs(','0','1','2','3','.'],
];
const grid=$('#sciGrid');
SCI_KEYS.flat().forEach(k=>{
  const b=document.createElement('button'); b.className='gbtn'+(['÷','×','−','+','^'].includes(k)?' op':(k.length>1&&k!=='π'?' fn':''))+(k==='='?' eq':'');
  b.textContent=k;
  b.onclick=()=>sciPress(k);
  grid.appendChild(b);
});
function updateSciDisplay(){ $('#sciExprLine').textContent=sciExpr||'\u00A0'; }
function sciPress(k){
  if(k==='C'){sciExpr='';updateSciDisplay();$('#sciResLine').textContent='0';return;}
  if(k==='⌫'){sciExpr=sciExpr.slice(0,-1);updateSciDisplay();return;}
  if(k==='='){sciEvaluate();return;}
  const map={'×':'*','÷':'/','−':'-','π':'pi'};
  sciExpr+= map[k]!==undefined?map[k]:k;
  updateSciDisplay();
}
function sciEvaluate(){
  try{
    const r=evalExpr(sciExpr,{},degMode);
    const out=r.toString();
    $('#sciResLine').textContent=out;
    pushHistory('Sci',sciExpr,out);
    sciExpr=out; updateSciDisplay();
  }catch(e){ $('#sciResLine').textContent='Error'; }
}
$('#degPill').onclick=()=>{degMode=true;$('#degPill').classList.add('on');$('#radPill').classList.remove('on');};
$('#radPill').onclick=()=>{degMode=false;$('#radPill').classList.add('on');$('#degPill').classList.remove('on');};
let sciMemory=0;
function curSciVal(){const t=$('#sciResLine').textContent; const v=parseFloat(t); return isNaN(v)?0:v;}
$('#mcPill').onclick=()=>{sciMemory=0;$('#mrPill').textContent='MR: 0';};
$('#mrPill').onclick=()=>{sciExpr+=String(sciMemory);updateSciDisplay();};
$('#mPlusPill').onclick=()=>{sciMemory+=curSciVal();$('#mrPill').textContent='MR: '+(+sciMemory.toFixed(6));};
$('#mMinusPill').onclick=()=>{sciMemory-=curSciVal();$('#mrPill').textContent='MR: '+(+sciMemory.toFixed(6));};
document.addEventListener('keydown',e=>{
  if(!sciPanel.classList.contains('active'))return;
  if(/[0-9.+\-*/^%()]/.test(e.key)){sciExpr+=e.key;updateSciDisplay();}
  else if(e.key==='Enter'){sciEvaluate();}
  else if(e.key==='Escape'){sciExpr='';updateSciDisplay();$('#sciResLine').textContent='0';}
  else if(e.key==='Backspace'){sciExpr=sciExpr.slice(0,-1);updateSciDisplay();}
});

/* ---------- Programmer ---------- */
const progPanel=$('#p-prog');
progPanel.innerHTML=`
  <h3>Programmer mode</h3>
  <div class="row"><div class="field"><label>Decimal</label><input id="pDec" type="text" placeholder="e.g. 255"></div></div>
  <div class="row"><div class="field"><label>Binary</label><input id="pBin" type="text"></div>
  <div class="field"><label>Octal</label><input id="pOct" type="text"></div>
  <div class="field"><label>Hex</label><input id="pHex" type="text"></div></div>
  <div class="row"><label>Bit width</label>
    <select id="pWidth"><option>8</option><option selected>16</option><option>32</option><option>64</option></select>
  </div>
  <h3 style="margin-top:14px">Bitwise operation</h3>
  <div class="row">
    <div class="field"><label>A (decimal)</label><input id="bA" type="text" value="12"></div>
    <div class="field"><label>Op</label><select id="bOp"><option>AND</option><option>OR</option><option>XOR</option><option>NOT</option><option>&lt;&lt;</option><option>&gt;&gt;</option></select></div>
    <div class="field"><label>B (decimal, ignored for NOT)</label><input id="bB" type="text" value="10"></div>
  </div>
  <button class="btn" id="bCalc">Compute</button>
  <div class="outbox" id="bOut"></div>
`;
function syncFrom(base){
  try{
    let v;
    if(base==='dec')v=BigInt($('#pDec').value||'0');
    if(base==='bin')v=BigInt('0b'+($('#pBin').value||'0'));
    if(base==='oct')v=BigInt('0o'+($('#pOct').value||'0'));
    if(base==='hex')v=BigInt('0x'+($('#pHex').value||'0'));
    $('#pDec').value=v.toString(10);
    $('#pBin').value=v.toString(2);
    $('#pOct').value=v.toString(8);
    $('#pHex').value=v.toString(16).toUpperCase();
  }catch(e){}
}
['pDec','pBin','pOct','pHex'].forEach(id=>$('#'+id).addEventListener('input',()=>syncFrom(id.slice(1).toLowerCase())));
$('#pDec').value='255'; syncFrom('dec');
$('#bCalc').onclick=()=>{
  const w=parseInt($('#pWidth').value), mask=(1n<<BigInt(w))-1n;
  let a=BigInt($('#bA').value||'0')&mask, b=BigInt($('#bB').value||'0')&mask, r;
  const op=$('#bOp').value;
  if(op==='AND')r=a&b; else if(op==='OR')r=a|b; else if(op==='XOR')r=a^b;
  else if(op==='NOT')r=(~a)&mask; else if(op==='<<')r=(a<<b)&mask; else r=a>>b;
  $('#bOut').textContent=`Decimal: ${r}\nBinary:  ${r.toString(2).padStart(w,'0')}\nHex:     0x${r.toString(16).toUpperCase()}`;
  pushHistory('Prog',`${a} ${op} ${b}`,r.toString());
};

/* ---------- Graphing ---------- */
const graphPanel=$('#p-graph');
graphPanel.innerHTML=`
  <h3>Graph y = f(x)</h3>
  <div class="row"><div class="field"><label>f(x) =</label><input id="gExpr" type="text" value="sin(x)"></div>
  <div class="field" style="max-width:100px"><label>x min</label><input id="gMin" type="text" value="-10"></div>
  <div class="field" style="max-width:100px"><label>x max</label><input id="gMax" type="text" value="10"></div>
  <button class="btn" id="gPlot" style="align-self:flex-end">Plot</button></div>
  <canvas id="gCanvas" width="900" height="360"></canvas>
  <div class="hint">Use x as the variable. Functions: sin, cos, tan, sqrt, ln, log, abs, exp, ^. Angles here are radians.</div>
`;
function plotGraph(){
  const cv=$('#gCanvas'), ctx=cv.getContext('2d');
  const W=cv.width,H=cv.height; ctx.clearRect(0,0,W,H);
  const xmin=parseFloat($('#gMin').value), xmax=parseFloat($('#gMax').value);
  const exprStr=$('#gExpr').value;
  const pts=[]; let ymin=Infinity,ymax=-Infinity;
  for(let i=0;i<=W;i++){
    const x=xmin+(xmax-xmin)*i/W;
    let y;
    try{ y=evalExpr(exprStr,{x},false).re; }catch(e){ y=NaN; }
    if(isFinite(y)){ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
    pts.push(y);
  }
  if(!isFinite(ymin)){ymin=-1;ymax=1;}
  if(ymin===ymax){ymin-=1;ymax+=1;}
  const pad=(ymax-ymin)*0.1; ymin-=pad; ymax+=pad;
  const toY=y=>H-((y-ymin)/(ymax-ymin))*H;
  const cssLine=getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
  const cssAccent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const cssSub=getComputedStyle(document.documentElement).getPropertyValue('--sub').trim();
  ctx.strokeStyle=cssLine; ctx.lineWidth=1;
  const y0=toY(0); if(y0>=0&&y0<=H){ctx.beginPath();ctx.moveTo(0,y0);ctx.lineTo(W,y0);ctx.stroke();}
  ctx.fillStyle=cssSub; ctx.font='11px monospace';
  ctx.fillText('x: ['+xmin+', '+xmax+']  y: ['+ymin.toFixed(2)+', '+ymax.toFixed(2)+']',8,14);
  ctx.strokeStyle=cssAccent; ctx.lineWidth=2; ctx.beginPath();
  let started=false;
  pts.forEach((y,i)=>{
    if(!isFinite(y)){started=false;return;}
    const py=toY(y);
    if(!started){ctx.moveTo(i,py);started=true;} else ctx.lineTo(i,py);
  });
  ctx.stroke();
}
$('#gPlot').onclick=plotGraph;
setTimeout(plotGraph,50);

/* ---------- Matrix ---------- */
const matrixPanel=$('#p-matrix');
matrixPanel.innerHTML=`
  <h3>Matrix calculator (up to 4×4)</h3>
  <div class="row"><label>Size</label><select id="mSize"><option>2</option selected><option selected>2</option><option>3</option><option>4</option></select>
  <label>Operation</label><select id="mOp"><option>A + B</option><option>A − B</option><option>A × B</option><option>Determinant(A)</option><option>Inverse(A)</option><option>Transpose(A)</option></select>
  <button class="btn" id="mCalc">Compute</button></div>
  <div class="two-col"><div><h3>Matrix A</h3><table id="mA"></table></div><div><h3>Matrix B</h3><table id="mB"></table></div></div>
  <div class="outbox" id="mOut"></div>
`;
function buildMatrixInputs(tbl,n){
  tbl.innerHTML='';
  for(let r=0;r<n;r++){const tr=document.createElement('tr');
    for(let c=0;c<n;c++){const td=document.createElement('td');
      const inp=document.createElement('input'); inp.type='text'; inp.value= r===c?'1':'0'; inp.dataset.r=r; inp.dataset.c=c;
      td.appendChild(inp); tr.appendChild(td);}
    tbl.appendChild(tr);}
}
function readMatrix(tbl,n){
  const m=[]; for(let r=0;r<n;r++){m.push([]);for(let c=0;c<n;c++){m[r].push(parseFloat(tbl.querySelector(`input[data-r="${r}"][data-c="${c}"]`).value)||0);}}
  return m;
}
function rebuildMatrices(){const n=parseInt($('#mSize').value);buildMatrixInputs($('#mA'),n);buildMatrixInputs($('#mB'),n);}
$('#mSize').onchange=rebuildMatrices; rebuildMatrices();
function matAdd(a,b,s){return a.map((row,r)=>row.map((v,c)=>v+s*b[r][c]));}
function matMul(a,b){const n=a.length,m=b[0].length,k=b.length;const out=Array.from({length:n},()=>Array(m).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<m;j++)for(let x=0;x<k;x++)out[i][j]+=a[i][x]*b[x][j]; return out;}
function matDet(m){const n=m.length; if(n===1)return m[0][0]; if(n===2)return m[0][0]*m[1][1]-m[0][1]*m[1][0];
  let det=0; for(let c=0;c<n;c++){const sub=m.slice(1).map(row=>row.filter((_,ci)=>ci!==c)); det+=((c%2===0)?1:-1)*m[0][c]*matDet(sub);} return det;}
function matInv(m){const n=m.length,det=matDet(m); if(Math.abs(det)<1e-12)return null;
  const adj=Array.from({length:n},()=>Array(n).fill(0));
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    const sub=m.filter((_,ri)=>ri!==r).map(row=>row.filter((_,ci)=>ci!==c));
    adj[c][r]=(((r+c)%2===0)?1:-1)*matDet(sub);
  }
  return adj.map(row=>row.map(v=>v/det));
}
function fmtMat(m){return m.map(row=>row.map(v=>+v.toFixed(4)).join('\t')).join('\n');}
$('#mCalc').onclick=()=>{
  const n=parseInt($('#mSize').value), A=readMatrix($('#mA'),n), B=readMatrix($('#mB'),n), op=$('#mOp').value;
  let out;
  try{
    if(op==='A + B')out=fmtMat(matAdd(A,B,1));
    else if(op==='A − B')out=fmtMat(matAdd(A,B,-1));
    else if(op==='A × B')out=fmtMat(matMul(A,B));
    else if(op==='Determinant(A)')out='det(A) = '+ (+matDet(A).toFixed(6));
    else if(op==='Inverse(A)'){const inv=matInv(A); out=inv? fmtMat(inv) : 'Matrix A is singular — no inverse exists.';}
    else if(op==='Transpose(A)')out=fmtMat(A[0].map((_,c)=>A.map(row=>row[c])));
  }catch(e){out='Error: '+e.message;}
  $('#mOut').textContent=out;
  pushHistory('Matrix',op,'see output');
};

/* ---------- Statistics ---------- */
const statsPanel=$('#p-stats');
statsPanel.innerHTML=`
  <h3>Descriptive statistics</h3>
  <div class="field"><label>Enter numbers, comma or space separated</label><input id="sData" type="text" value="4, 8, 6, 5, 3, 9, 7"></div>
  <button class="btn" id="sCalc" style="margin-top:10px">Compute</button>
  <div class="stat-grid" id="sGrid"></div>
`;
function median(a){const s=[...a].sort((x,y)=>x-y),n=s.length;return n%2? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2;}
function mode(a){const f={};a.forEach(v=>f[v]=(f[v]||0)+1);let best=[],mx=0;for(const k in f){if(f[k]>mx){mx=f[k];best=[k];}else if(f[k]===mx)best.push(k);}
  return mx<=1?'none':best.join(', ');}
$('#sCalc').onclick=()=>{
  const arr=$('#sData').value.split(/[, \s]+/).filter(Boolean).map(Number).filter(v=>!isNaN(v));
  if(!arr.length){$('#sGrid').innerHTML='<div class="hint">Enter valid numbers.</div>';return;}
  const n=arr.length, sum=arr.reduce((a,b)=>a+b,0), mean=sum/n;
  const variance=arr.reduce((a,b)=>a+(b-mean)**2,0)/n, sd=Math.sqrt(variance);
  const sampleSd=n>1?Math.sqrt(arr.reduce((a,b)=>a+(b-mean)**2,0)/(n-1)):0;
  const cards=[['Count',n],['Sum',+sum.toFixed(4)],['Mean',+mean.toFixed(4)],['Median',+median(arr).toFixed(4)],
    ['Mode',mode(arr)],['Min',Math.min(...arr)],['Max',Math.max(...arr)],['Range',+(Math.max(...arr)-Math.min(...arr)).toFixed(4)],
    ['Population SD',+sd.toFixed(4)],['Sample SD',+sampleSd.toFixed(4)],['Variance',+variance.toFixed(4)]];
  $('#sGrid').innerHTML=cards.map(([l,v])=>`<div class="stat-card"><b>${v}</b><span>${l}</span></div>`).join('');
  pushHistory('Stats',arr.join(','),'mean='+(+mean.toFixed(4)));
};

/* ---------- Unit & Currency Convert ---------- */
const convPanel=$('#p-convert');
const UNITS={
  Length:{m:1,km:1000,cm:0.01,mm:0.001,mile:1609.344,yard:0.9144,foot:0.3048,inch:0.0254,'nautical mile':1852},
  Weight:{kg:1,g:0.001,mg:1e-6,tonne:1000,pound:0.453592,ounce:0.0283495},
  Volume:{litre:1,ml:0.001,'m³':1000,gallon:3.78541,quart:0.946353,cup:0.24},
  Speed:{'m/s':1,'km/h':0.277778,mph:0.44704,knot:0.514444},
  Time:{second:1,minute:60,hour:3600,day:86400,week:604800},
  Data:{byte:1,KB:1024,MB:1048576,GB:1073741824,TB:1099511627776},
};
const CURRENCY={USD:1,INR:83.3,EUR:0.92,GBP:0.79,JPY:149.5,AUD:1.52,CAD:1.36,CNY:7.24,AED:3.67,SGD:1.34};
convPanel.innerHTML=`
  <h3>Unit conversion</h3>
  <div class="row">
    <div class="field"><label>Category</label><select id="uCat"></select></div>
    <div class="field"><label>Value</label><input id="uVal" type="text" value="1"></div>
    <div class="field"><label>From</label><select id="uFrom"></select></div>
    <div class="field"><label>To</label><select id="uTo"></select></div>
  </div>
  <div class="outbox" id="uOut"></div>
  <h3 style="margin-top:20px">Currency conversion <span class="hint">(static reference rates — check a live source for real transactions)</span></h3>
  <div class="row">
    <div class="field"><label>Amount</label><input id="cVal" type="text" value="100"></div>
    <div class="field"><label>From</label><select id="cFrom"></select></div>
    <div class="field"><label>To</label><select id="cTo"></select></div>
  </div>
  <div class="outbox" id="cOut"></div>
`;
const uCat=$('#uCat'); Object.keys(UNITS).forEach(c=>uCat.add(new Option(c,c)));
function fillUnitSelects(){const c=uCat.value,keys=Object.keys(UNITS[c]);const f=$('#uFrom'),t=$('#uTo');f.innerHTML='';t.innerHTML='';
  keys.forEach(k=>{f.add(new Option(k,k));t.add(new Option(k,k));}); t.selectedIndex=1%keys.length; doUnitConvert();}
uCat.onchange=fillUnitSelects; uCat.value='Length'; fillUnitSelects();
function doUnitConvert(){
  const c=uCat.value, v=parseFloat($('#uVal').value)||0, f=$('#uFrom').value, t=$('#uTo').value;
  const base=v*UNITS[c][f], out=base/UNITS[c][t];
  $('#uOut').textContent=`${v} ${f} = ${+out.toFixed(6)} ${t}`;
}
['uVal','uFrom','uTo'].forEach(id=>$('#'+id).addEventListener('input',doUnitConvert));
$('#uFrom').addEventListener('change',doUnitConvert); $('#uTo').addEventListener('change',doUnitConvert);
const cFrom=$('#cFrom'),cTo=$('#cTo'); Object.keys(CURRENCY).forEach(k=>{cFrom.add(new Option(k,k));cTo.add(new Option(k,k));});
cFrom.value='USD'; cTo.value='INR';
function doCurrencyConvert(){
  const v=parseFloat($('#cVal').value)||0, f=CURRENCY[cFrom.value], t=CURRENCY[cTo.value];
  const out=v/f*t;
  $('#cOut').textContent=`${v} ${cFrom.value} ≈ ${out.toFixed(2)} ${cTo.value}`;
}
['cVal'].forEach(id=>$('#'+id).addEventListener('input',doCurrencyConvert));
cFrom.addEventListener('change',doCurrencyConvert); cTo.addEventListener('change',doCurrencyConvert);
doCurrencyConvert();

/* ---------- Finance: EMI / Interest ---------- */
const finPanel=$('#p-finance');
finPanel.innerHTML=`
  <h3>Loan EMI calculator</h3>
  <div class="row">
    <div class="field"><label>Loan amount</label><input id="fPrin" type="text" value="500000"></div>
    <div class="field"><label>Annual interest rate %</label><input id="fRate" type="text" value="9"></div>
    <div class="field"><label>Tenure (years)</label><input id="fYears" type="text" value="5"></div>
    <button class="btn" id="fCalc" style="align-self:flex-end">Calculate EMI</button>
  </div>
  <div class="outbox" id="fOut"></div>
  <h3 style="margin-top:20px">Simple vs Compound interest</h3>
  <div class="row">
    <div class="field"><label>Principal</label><input id="iPrin" type="text" value="10000"></div>
    <div class="field"><label>Rate % per year</label><input id="iRate" type="text" value="7"></div>
    <div class="field"><label>Time (years)</label><input id="iTime" type="text" value="3"></div>
    <div class="field"><label>Compounds/year</label><input id="iComp" type="text" value="1"></div>
    <button class="btn" id="iCalc" style="align-self:flex-end">Calculate</button>
  </div>
  <div class="outbox" id="iOut"></div>
`;
$('#fCalc').onclick=()=>{
  const P=parseFloat($('#fPrin').value), annR=parseFloat($('#fRate').value)/100, n=parseFloat($('#fYears').value)*12;
  const r=annR/12;
  const emi = r===0 ? P/n : P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
  const total=emi*n, interest=total-P;
  $('#fOut').textContent=`Monthly EMI: ${emi.toFixed(2)}\nTotal payment: ${total.toFixed(2)}\nTotal interest: ${interest.toFixed(2)}`;
  pushHistory('EMI',`P=${P},r=${annR*100}%,n=${n}mo`,emi.toFixed(2));
};
$('#iCalc').onclick=()=>{
  const P=parseFloat($('#iPrin').value), r=parseFloat($('#iRate').value)/100, t=parseFloat($('#iTime').value), c=parseFloat($('#iComp').value)||1;
  const si=P*r*t, siTotal=P+si;
  const ci=P*Math.pow(1+r/c,c*t)-P, ciTotal=P+ci;
  $('#iOut').textContent=`Simple interest: ${si.toFixed(2)}  (total: ${siTotal.toFixed(2)})\nCompound interest: ${ci.toFixed(2)}  (total: ${ciTotal.toFixed(2)})\nDifference: ${(ci-si).toFixed(2)}`;
  pushHistory('Interest',`P=${P},r=${r*100}%,t=${t}y`,ci.toFixed(2));
};

/* ---------- Age Calculator ---------- */
const agePanel=$('#p-age');
agePanel.innerHTML=`
  <h3>Age calculator</h3>
  <div class="row">
    <div class="field"><label>Date of birth</label><input id="aDob" type="date"></div>
    <div class="field"><label>As of date</label><input id="aTo" type="date"></div>
    <button class="btn" id="aCalc" style="align-self:flex-end">Calculate age</button>
  </div>
  <div class="outbox" id="aOut"></div>
`;
$('#aTo').valueAsDate=new Date();
$('#aCalc').onclick=()=>{
  const dob=new Date($('#aDob').value), to=new Date($('#aTo').value||new Date());
  if(isNaN(dob)){ $('#aOut').textContent='Please enter a valid date of birth.'; return; }
  let y=to.getFullYear()-dob.getFullYear(), m=to.getMonth()-dob.getMonth(), d=to.getDate()-dob.getDate();
  if(d<0){m--;const pm=new Date(to.getFullYear(),to.getMonth(),0).getDate();d+=pm;}
  if(m<0){y--;m+=12;}
  const totalDays=Math.floor((to-dob)/86400000);
  let next=new Date(to.getFullYear(),dob.getMonth(),dob.getDate());
  if(next<to)next=new Date(to.getFullYear()+1,dob.getMonth(),dob.getDate());
  const daysToNext=Math.ceil((next-to)/86400000);
  $('#aOut').textContent=`Age: ${y} years, ${m} months, ${d} days\nTotal days lived: ${totalDays}\nTotal weeks: ${Math.floor(totalDays/7)}\nDays until next birthday: ${daysToNext}`;
  pushHistory('Age',$('#aDob').value,`${y}y ${m}m ${d}d`);
};

/* ---------- Percentage / Grade ---------- */
const gradePanel=$('#p-grade');
gradePanel.innerHTML=`
  <h3>Result percentage & grade</h3>
  <div class="row">
    <div class="field"><label>Marks obtained</label><input id="rObt" type="text" value="446"></div>
    <div class="field"><label>Maximum marks</label><input id="rMax" type="text" value="500"></div>
    <button class="btn" id="rCalc" style="align-self:flex-end">Calculate</button>
  </div>
  <div class="outbox" id="rOut"></div>
  <h3 style="margin-top:20px">Quick percentage tools</h3>
  <div class="row">
    <div class="field"><label>X</label><input id="pX" type="text" value="15"></div>
    <div class="field"><label>% of Y</label><input id="pY" type="text" value="450"></div>
    <button class="btn ghost" id="pCalc" style="align-self:flex-end">X% of Y</button>
    <div class="field"><label>A is what % of B — A</label><input id="pA2" type="text" value="90"></div>
    <div class="field"><label>B</label><input id="pB2" type="text" value="360"></div>
    <button class="btn ghost" id="pCalc2" style="align-self:flex-end">Compute</button>
  </div>
  <div class="outbox" id="pOut"></div>
`;
function gradeFor(pct){
  if(pct>=90)return 'A+ (Outstanding)'; if(pct>=80)return 'A (Excellent)'; if(pct>=70)return 'B+ (Very good)';
  if(pct>=60)return 'B (Good)'; if(pct>=50)return 'C (Average)'; if(pct>=40)return 'D (Pass)'; return 'F (Fail)';
}
$('#rCalc').onclick=()=>{
  const o=parseFloat($('#rObt').value), m=parseFloat($('#rMax').value), pct=o/m*100;
  $('#rOut').textContent=`Percentage: ${pct.toFixed(2)}%\nGrade: ${gradeFor(pct)}`;
  pushHistory('Grade',`${o}/${m}`,pct.toFixed(2)+'%');
};
$('#pCalc').onclick=()=>{const x=parseFloat($('#pX').value),y=parseFloat($('#pY').value);$('#pOut').textContent=`${x}% of ${y} = ${(x/100*y).toFixed(4)}`;};
$('#pCalc2').onclick=()=>{const a=parseFloat($('#pA2').value),b=parseFloat($('#pB2').value);$('#pOut').textContent=`${a} is ${(a/b*100).toFixed(4)}% of ${b}`;};

/* ---------- Natural language ---------- */
const nlPanel=$('#p-nl');
nlPanel.innerHTML=`
  <h3>Ask in plain words</h3>
  <div class="field"><label>Try: "15% of 450 minus 18% tax", "square root of 144 plus 10", "25 percent of 200 times 3"</label>
    <input id="nlIn" type="text" value="15% of 450 minus 18% tax"></div>
  <button class="btn" id="nlCalc" style="margin-top:10px">Compute</button>
  <div class="outbox" id="nlOut"></div>
`;
function naturalLangEval(sentence){
  let s=' '+sentence.toLowerCase()+' ';
  s=s.replace(/(\d+(\.\d+)?)\s*(%|percent)\s*of\s*(\d+(\.\d+)?)/g,'($1/100*$4)');
  s=s.replace(/(\d+(\.\d+)?)\s*(%|percent)\s*tax/g,'($1/100)*__BASE__');
  s=s.replace(/square root of\s*(\d+(\.\d+)?)/g,'sqrt($1)');
  s=s.replace(/cube root of\s*(\d+(\.\d+)?)/g,'cbrt($1)');
  s=s.replace(/(\d+(\.\d+)?)\s*squared/g,'($1^2)');
  s=s.replace(/(\d+(\.\d+)?)\s*cubed/g,'($1^3)');
  s=s.replace(/plus|added to/g,'+');
  s=s.replace(/minus|subtract(ed)?( from)?|less/g,'-');
  s=s.replace(/times|multiplied by|multiply by/g,'*');
  s=s.replace(/divided by|divide by/g,'/');
  s=s.replace(/percent|%/g,'/100*1');
  s=s.trim();
  // handle "minus tax" leftover with no % specified -> treat as 0
  s=s.replace(/-\s*tax/g,'-0');
  // resolve __BASE__ using the running left-hand total: compute segment before it separately
  if(s.includes('__BASE__')){
    const idx=s.indexOf('-'); // pattern: <expr> - (rate/100)*__BASE__
    const parts=s.split('-(');
    if(parts.length>=2){
      const baseVal=evalExpr(parts[0],{},false).re;
      s=parts[0]+'-('+parts.slice(1).join('-(').replace('__BASE__',baseVal);
    } else { s=s.replace('__BASE__','0'); }
  }
  return {clean:s, result:evalExpr(s,{},false)};
}
$('#nlCalc').onclick=()=>{
  const q=$('#nlIn').value;
  try{
    const {clean,result}=naturalLangEval(q);
    $('#nlOut').textContent=`Interpreted as: ${clean}\nResult: ${result.toString()}`;
    pushHistory('NL',q,result.toString());
  }catch(e){ $('#nlOut').textContent="Couldn't fully parse that. Try simpler phrasing, e.g. '15% of 450 minus 20'."; }
};

/* ---------- Equation Solver ---------- */
const eqPanel=$('#p-eq');
eqPanel.innerHTML=`
  <h3>Linear: ax + b = 0</h3>
  <div class="row"><div class="field"><label>a</label><input id="e1a" type="text" value="2"></div>
  <div class="field"><label>b</label><input id="e1b" type="text" value="-10"></div>
  <button class="btn" id="e1Calc" style="align-self:flex-end">Solve</button></div>
  <div class="outbox" id="e1Out"></div>
  <h3 style="margin-top:18px">Quadratic: ax² + bx + c = 0</h3>
  <div class="row"><div class="field"><label>a</label><input id="e2a" type="text" value="1"></div>
  <div class="field"><label>b</label><input id="e2b" type="text" value="-5"></div>
  <div class="field"><label>c</label><input id="e2c" type="text" value="6"></div>
  <button class="btn" id="e2Calc" style="align-self:flex-end">Solve</button></div>
  <div class="outbox" id="e2Out"></div>
  <h3 style="margin-top:18px">2×2 system: a1x+b1y=c1, a2x+b2y=c2</h3>
  <div class="row"><div class="field"><label>a1</label><input id="e3a1" type="text" value="2"></div>
  <div class="field"><label>b1</label><input id="e3b1" type="text" value="3"></div>
  <div class="field"><label>c1</label><input id="e3c1" type="text" value="8"></div></div>
  <div class="row"><div class="field"><label>a2</label><input id="e3a2" type="text" value="1"></div>
  <div class="field"><label>b2</label><input id="e3b2" type="text" value="-1"></div>
  <div class="field"><label>c2</label><input id="e3c2" type="text" value="1"></div>
  <button class="btn" id="e3Calc" style="align-self:flex-end">Solve</button></div>
  <div class="outbox" id="e3Out"></div>
`;
$('#e1Calc').onclick=()=>{const a=+$('#e1a').value,b=+$('#e1b').value;
  $('#e1Out').textContent= a===0 ? (b===0?'Infinite solutions (0=0)':'No solution') : `x = ${(-b/a).toFixed(6)}`;};
$('#e2Calc').onclick=()=>{
  const a=+$('#e2a').value,b=+$('#e2b').value,c=+$('#e2c').value;
  if(a===0){$('#e2Out').textContent=b===0?'Not a valid equation':`x = ${(-c/b).toFixed(6)} (linear)`;return;}
  const D=b*b-4*a*c;
  if(D>0){const x1=(-b+Math.sqrt(D))/(2*a),x2=(-b-Math.sqrt(D))/(2*a);
    $('#e2Out').textContent=`Discriminant = ${D}\nTwo real roots:\nx1 = ${x1.toFixed(6)}\nx2 = ${x2.toFixed(6)}`;}
  else if(D===0){$('#e2Out').textContent=`Discriminant = 0\nOne repeated root: x = ${(-b/(2*a)).toFixed(6)}`;}
  else{const re=(-b/(2*a)).toFixed(6),im=(Math.sqrt(-D)/(2*a)).toFixed(6);
    $('#e2Out').textContent=`Discriminant = ${D}\nComplex roots:\nx1 = ${re} + ${im}i\nx2 = ${re} − ${im}i`;}
};
$('#e3Calc').onclick=()=>{
  const a1=+$('#e3a1').value,b1=+$('#e3b1').value,c1=+$('#e3c1').value,a2=+$('#e3a2').value,b2=+$('#e3b2').value,c2=+$('#e3c2').value;
  const det=a1*b2-a2*b1;
  if(Math.abs(det)<1e-12){$('#e3Out').textContent='No unique solution (lines parallel or identical).';return;}
  const x=(c1*b2-c2*b1)/det, y=(a1*c2-a2*c1)/det;
  $('#e3Out').textContent=`x = ${x.toFixed(6)}\ny = ${y.toFixed(6)}`;
};

/* ---------- Shop & Billing (GST, discount, margin, bill list) ---------- */
const shopPanel=$('#p-shop');
shopPanel.innerHTML=`
  <h3>GST calculator</h3>
  <div class="row"><div class="field"><label>Amount</label><input id="gAmt" type="text" value="1000"></div>
  <div class="field"><label>GST %</label><input id="gPct" type="text" value="18"></div>
  <div class="field"><label>Amount is</label><select id="gMode"><option value="excl">Exclusive of GST</option><option value="incl">Inclusive of GST</option></select></div>
  <button class="btn" id="gCalc" style="align-self:flex-end">Compute</button></div>
  <div class="outbox" id="gOut"></div>
  <h3 style="margin-top:18px">Discount & profit margin</h3>
  <div class="row"><div class="field"><label>Cost price</label><input id="dCost" type="text" value="500"></div>
  <div class="field"><label>Selling price</label><input id="dSell" type="text" value="650"></div>
  <div class="field"><label>Discount %</label><input id="dDisc" type="text" value="10"></div>
  <button class="btn" id="dCalc" style="align-self:flex-end">Compute</button></div>
  <div class="outbox" id="dOut"></div>
  <h3 style="margin-top:18px">Quick bill</h3>
  <div class="row"><div class="field"><label>Item name</label><input id="biName" type="text" placeholder="e.g. Maggi 2pk"></div>
  <div class="field" style="max-width:90px"><label>Qty</label><input id="biQty" type="text" value="1"></div>
  <div class="field" style="max-width:110px"><label>Price/unit</label><input id="biPrice" type="text" value="0"></div>
  <button class="btn ghost" id="biAdd" style="align-self:flex-end">Add item</button></div>
  <table id="biTable" style="text-align:left;font-family:var(--mono);font-size:13px"></table>
  <div class="row" style="margin-top:8px"><button class="btn ghost" id="biClear">Clear bill</button><button class="btn" id="biExport">Export bill (.txt)</button></div>
  <div class="outbox" id="biOut">Total: 0.00</div>
`;
$('#gCalc').onclick=()=>{
  const amt=+$('#gAmt').value, pct=+$('#gPct').value, mode=$('#gMode').value;
  let base,tax,total;
  if(mode==='excl'){base=amt;tax=amt*pct/100;total=base+tax;}
  else{total=amt;base=amt/(1+pct/100);tax=total-base;}
  $('#gOut').textContent=`Base amount: ${base.toFixed(2)}\nGST (${pct}%): ${tax.toFixed(2)}\nTotal: ${total.toFixed(2)}`;
};
$('#dCalc').onclick=()=>{
  const cp=+$('#dCost').value, sp=+$('#dSell').value, disc=+$('#dDisc').value;
  const profit=sp-cp, marginPct=profit/sp*100, markupPct=profit/cp*100;
  const discPrice=sp*(1-disc/100);
  $('#dOut').textContent=`Profit: ${profit.toFixed(2)}\nProfit margin: ${marginPct.toFixed(2)}%\nMarkup over cost: ${markupPct.toFixed(2)}%\nPrice after ${disc}% discount: ${discPrice.toFixed(2)}`;
};
let billItems=[];
function renderBill(){
  const t=$('#biTable');
  t.innerHTML='<tr><td><b>Item</b></td><td><b>Qty</b></td><td><b>Price</b></td><td><b>Subtotal</b></td><td></td></tr>'+
    billItems.map((it,i)=>`<tr><td>${it.name}</td><td>${it.qty}</td><td>${it.price.toFixed(2)}</td><td>${(it.qty*it.price).toFixed(2)}</td><td><span class="pill" data-i="${i}">✕</span></td></tr>`).join('');
  t.querySelectorAll('.pill').forEach(p=>p.onclick=()=>{billItems.splice(+p.dataset.i,1);renderBill();});
  const total=billItems.reduce((s,it)=>s+it.qty*it.price,0);
  $('#biOut').textContent='Total: '+total.toFixed(2)+'  ('+billItems.length+' item(s))';
}
$('#biAdd').onclick=()=>{
  const name=$('#biName').value.trim()||'Item', qty=+$('#biQty').value||1, price=+$('#biPrice').value||0;
  billItems.push({name,qty,price}); $('#biName').value=''; $('#biPrice').value='0'; renderBill();
};
$('#biClear').onclick=()=>{billItems=[];renderBill();};
renderBill();
function downloadText(filename,text){
  const blob=new Blob([text],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
$('#biExport').onclick=()=>{
  const total=billItems.reduce((s,it)=>s+it.qty*it.price,0);
  const lines=['Calcoti — Bill',new Date().toLocaleString(),'',...billItems.map(it=>`${it.name} x${it.qty} @ ${it.price.toFixed(2)} = ${(it.qty*it.price).toFixed(2)}`),'',`TOTAL: ${total.toFixed(2)}`];
  downloadText('bill.txt',lines.join('\n'));
};

/* ---------- Split & Tip ---------- */
const splitPanel=$('#p-split');
splitPanel.innerHTML=`
  <h3>Split the bill</h3>
  <div class="row"><div class="field"><label>Bill amount</label><input id="spBill" type="text" value="1200"></div>
  <div class="field"><label>Tip %</label><input id="spTip" type="text" value="10"></div>
  <div class="field"><label>Number of people</label><input id="spN" type="text" value="4"></div>
  <button class="btn" id="spCalc" style="align-self:flex-end">Split</button></div>
  <div class="outbox" id="spOut"></div>
`;
$('#spCalc').onclick=()=>{
  const bill=+$('#spBill').value, tip=+$('#spTip').value, n=Math.max(1,+$('#spN').value);
  const tipAmt=bill*tip/100, total=bill+tipAmt, per=total/n;
  $('#spOut').textContent=`Tip amount: ${tipAmt.toFixed(2)}\nTotal with tip: ${total.toFixed(2)}\nPer person (${n} people): ${per.toFixed(2)}`;
};

/* ---------- Ask AI (bring-your-own Anthropic API key, runs entirely from the browser) ---------- */
const aiPanel=$('#p-ai');
aiPanel.innerHTML=`
  <h3>Ask AI — word problems, explanations, anything math</h3>
  <div class="hint" style="margin-bottom:8px">Optional feature. Anthropic's API has no permanent free tier — a new account usually gets a small one-time trial credit (phone verification, no card needed), after which it needs prepaid credits. If you'd rather skip this for now, the "Ask in Words" tab does natural-language math completely free, no key needed.</div>
  <div class="row">
    <div class="field"><label>Your Anthropic API key (saved only in this browser)</label><input id="aiKey" type="text" placeholder="sk-ant-..."></div>
    <div class="field" style="max-width:180px"><label>Model</label><input id="aiModel" type="text" value="claude-sonnet-5"></div>
  </div>
  <div class="hint">Get a key at console.anthropic.com → API Keys. It is stored only in this browser's localStorage and sent straight to Anthropic — never to any third server. Anyone with devtools access to this browser could read it, so don't use this on a shared machine, and this pattern is for personal projects, not production apps.</div>
  <div class="field" style="margin-top:10px"><label>Question</label><input id="aiQ" type="text" value="If I invest 50000 at 8% annual compound interest for 6 years, what do I end up with?"></div>
  <button class="btn" id="aiAsk" style="margin-top:10px">Ask</button>
  <div class="outbox" id="aiOut">Enter your API key once, then ask a question.</div>
`;
try{ $('#aiKey').value=localStorage.getItem('calcoti-api-key')||''; }catch(e){}
$('#aiKey').addEventListener('change',()=>{ try{ localStorage.setItem('calcoti-api-key',$('#aiKey').value.trim()); }catch(e){} });
$('#aiAsk').onclick=async()=>{
  const q=$('#aiQ').value.trim(), key=$('#aiKey').value.trim(), model=$('#aiModel').value.trim()||'claude-sonnet-5';
  if(!q)return;
  if(!key){ $('#aiOut').textContent='Add your Anthropic API key above first (see the note above on how to get one).'; return; }
  if(!key.startsWith('sk-ant-')){ $('#aiOut').textContent="That doesn't look like a valid key — Anthropic keys start with 'sk-ant-'. Copy it fresh from console.anthropic.com → API Keys."; return; }
  $('#aiOut').textContent='Thinking…';
  try{
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model,
        max_tokens:400,
        messages:[{role:'user',content:`You are a precise calculator assistant inside a calculator app. Answer this question with the numeric answer first, then a brief (2-4 line) explanation of the calculation. Question: ${q}`}]
      })
    });
    const data=await resp.json();
    if(data.error){
      const msg=data.error.message||'Unknown error';
      let friendly=msg;
      if(/credit balance|billing/i.test(msg)) friendly='Your Anthropic account has no credit left. Add prepaid credits at console.anthropic.com → Plans & Billing, or use the free "Ask in Words" tab instead.';
      else if(/authentication|invalid x-api-key|api key/i.test(msg)) friendly='This key was rejected. Double-check you copied the full key with no extra spaces, and that it hasn\'t been deleted in the console.';
      else if(/not_found_error/i.test(data.error.type||'')) friendly=`Model "${model}" wasn't recognized. Try "claude-sonnet-5" or check the exact model name in console.anthropic.com.`;
      $('#aiOut').textContent='Error: '+friendly;
      return;
    }
    const text=(data.content||[]).map(b=>b.text||'').join('\n').trim();
    $('#aiOut').textContent=text||'No response.';
    pushHistory('AI',q,'see answer');
  }catch(e){ $('#aiOut').textContent='Could not reach the API — check your internet connection in the VM.'; }
};

renderHistory();
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
