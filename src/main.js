import './style.css';
"use strict";
/* =========================================================================
   OPUS — a stereo light field for classical music
   The hero is DIRECTION OF SOUND: each orchestral voice is placed by where it
   sits in the stereo image (left↔right) and by pitch (low↔high). A light-strand
   threads them and leans toward the sounding side; a pan beam reads it explicitly.
   Vanilla JS · Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const lerp = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

let W,H,DPR,CX,CY,MIN,spread,yTop,yBot;
/* adaptive quality — auto-tunes to stay smooth on any laptop */
const QUAL=[
  {dpr:1.00, motes:55},   // low
  {dpr:1.35, motes:110},  // medium
  {dpr:1.60, motes:170},  // high
];
let qTier = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 1 : 2;
let autoQ = true;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W*DPR); cv.height = Math.floor(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H/2; MIN=Math.min(W,H);
  spread = Math.min(W*0.40, 620);     // how far full-left / full-right sit from centre
  yTop = H*0.20; yBot = H*0.76;        // piccolo high · contrabass low (pitch = height)
  g.fillStyle='#070403'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize); resize();

/* ---------------- voices (low → high) ---------------- */
const SECTIONS = [
  { name:'Contrabass',  lo:24,   hi:95,    rgb:[198, 92, 56] },
  { name:'Violoncello', lo:95,   hi:260,   rgb:[214,128, 64] },
  { name:'Viola',       lo:260,  hi:620,   rgb:[226,168, 88] },
  { name:'Violino',     lo:620,  hi:1600,  rgb:[230,205,150] },
  { name:'Flauto',      lo:1600, hi:4200,  rgb:[214,222,206] },
  { name:'Ottavino',    lo:4200, hi:13000, rgb:[170,198,226] },
];
const N = SECTIONS.length;
SECTIONS.forEach(s=>{ s.eL=0; s.eR=0; s.e=0; s.pan=0; s.x=null; s.y=0; });

/* legend (right edge) */
const leg = document.getElementById('leg'), legSw=[];
SECTIONS.forEach(s=>{
  const r=document.createElement('div'); r.className='lr';
  const sw=document.createElement('span'); sw.className='sw';
  const col=`rgb(${s.rgb.join(',')})`; sw.style.background=col; sw.style.color=col;
  const n=document.createElement('span'); n.textContent=s.name;
  r.append(sw,n); leg.append(r); legSw.push(sw);
});

/* soft glow sprite per voice (bloom baked in, restrained so it never blows out) */
function glow(rgb){
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
  const gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,247,230,0.80)');
  gr.addColorStop(0.30,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`);
  gr.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  x.fillStyle=gr; x.fillRect(0,0,64,64); return c;
}
SECTIONS.forEach(s=> s.spr=glow(s.rgb));

/* ---------------- audio: stereo, per-voice direction ---------------- */
let actx, anL, anR, freqL, freqR, binHz, playing=false, ready=false;
function buildGraph(){
  if(actx) return;
  actx = new (window.AudioContext||window.webkitAudioContext)();
  const src = actx.createMediaElementSource(audio);
  const sp  = actx.createChannelSplitter(2);
  anL = actx.createAnalyser(); anR = actx.createAnalyser();
  anL.fftSize = 2048; anR.fftSize = 2048;
  anL.smoothingTimeConstant = 0.82; anR.smoothingTimeConstant = 0.82;
  freqL = new Uint8Array(anL.frequencyBinCount);
  freqR = new Uint8Array(anR.frequencyBinCount);
  binHz = actx.sampleRate / anL.fftSize;
  src.connect(sp); sp.connect(anL,0); sp.connect(anR,1);
  src.connect(actx.destination);
  SECTIONS.forEach(s=>{ s.i0=Math.max(1,Math.round(s.lo/binHz)); s.i1=Math.max(s.i0,Math.round(s.hi/binHz)); });
  ready=true;
}
function bandAvg(arr,s){ let sum=0,n=0, hi=Math.min(s.i1,arr.length-1); for(let i=s.i0;i<=hi;i++){sum+=arr[i];n++;} return n?sum/n/255:0; }

let master=0, mPan=0, mPanS=0, pulse=0, flux=0;
function analyse(t){
  if(ready && playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    let tot=0, wpan=0, hi=0;
    for(let i=0;i<N;i++){ const s=SECTIONS[i]; const tilt=1+i*0.16;   // lift quiet highs
      const eL=bandAvg(freqL,s)*tilt, eR=bandAvg(freqR,s)*tilt;
      s.eL += (eL-s.eL)*0.25; s.eR += (eR-s.eR)*0.25;
      const e=Math.pow((s.eL+s.eR)*0.5, 0.85);
      s.e += (e-s.e)*0.2;
      const p=(s.eR-s.eL)/(s.eR+s.eL+1e-4);                          // this voice's direction
      s.pan += (p-s.pan)*0.12;
      tot+=s.e; wpan+=s.e*s.pan; if(i>=4) hi+=s.e;
    }
    master += (clamp(tot/N*1.7,0,1)-master)*0.1;
    mPan = tot>1e-3 ? clamp(wpan/tot,-1,1) : 0;
    const d=hi-flux; flux=hi; if(d>0.04) pulse=Math.min(1,pulse+d*2.2); pulse*=0.9;
  } else {
    // calm idle: the orchestra breathes and drifts gently across the field
    for(let i=0;i<N;i++){ const s=SECTIONS[i];
      const e=0.10+0.07*Math.sin(t*0.0004+i*1.1);
      s.e += (e-s.e)*0.06;
      const p=0.55*Math.sin(t*0.00025+i*0.9);
      s.pan += (p-s.pan)*0.04;
    }
    master += (0.18-master)*0.04; mPan = 0.42*Math.sin(t*0.00022); pulse*=0.92;
  }
  mPanS += (mPan-mPanS)*0.06;
}

/* ---------------- layout: place each voice by direction + pitch ---------------- */
function layout(){
  for(let i=0;i<N;i++){ const s=SECTIONS[i];
    const tx = CX + s.pan*spread;
    const ty = lerp(yBot, yTop, i/(N-1));
    if(s.x===null){ s.x=tx; s.y=ty; }
    s.x += (tx-s.x)*0.07; s.y += (ty-s.y)*0.12;
  }
}

/* ---------------- drifting motes (gentle, carried in the sound's direction) ---- */
let M=[];
function pickVoice(){ let tot=0, w=[]; for(let i=0;i<N;i++){ w[i]=0.04+SECTIONS[i].e; tot+=w[i]; } let r=Math.random()*tot; for(let i=0;i<N;i++){ r-=w[i]; if(r<=0) return i; } return 0; }
function spawnMote(seed){ const i=pickVoice(), s=SECTIONS[i];
  return { x:(s.x!=null?s.x:Math.random()*W)+(Math.random()-0.5)*46,
           y:(s.y!=null?s.y:Math.random()*H)+(Math.random()-0.5)*46,
           band:i, life:seed?Math.random():1, size:0.6+Math.random()*1.5, vy:(Math.random()-0.5)*14 }; }
function initMotes(){ M=new Array(QUAL[qTier].motes); for(let i=0;i<M.length;i++) M[i]=spawnMote(true); }
initMotes();
function drawMotes(dt){
  g.globalCompositeOperation='lighter';
  for(const m of M){
    m.life -= dt*0.32;
    if(m.life<=0){ Object.assign(m, spawnMote(false)); continue; }
    m.x += (mPanS*70)*dt;        // carried toward the sounding side
    m.y += m.vy*dt;
    const s=SECTIONS[m.band], a=clamp(m.life,0,1)*(0.10+s.e*0.30);
    const r=m.size*(1.6+s.e*3);
    g.globalAlpha=a; g.drawImage(s.spr, m.x-r, m.y-r, r*2, r*2);
    if(m.x<-30||m.x>W+30) Object.assign(m, spawnMote(false));
  }
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}

/* ---------------- the directional framing (this is what makes it legible) ----- */
function drawField(){
  g.globalCompositeOperation='source-over';
  // centre line = mono / dead-centre
  g.strokeStyle='rgba(202,162,58,0.10)'; g.lineWidth=1;
  g.beginPath(); g.moveTo(CX, yTop-H*0.05); g.lineTo(CX, yBot+H*0.06); g.stroke();
  // pan beam across the top
  const by=Math.max(58, H*0.10), half=spread;
  g.strokeStyle='rgba(202,162,58,0.16)'; g.lineWidth=1;
  g.beginPath(); g.moveTo(CX-half,by); g.lineTo(CX+half,by); g.stroke();
  // L / R anchors
  g.fillStyle='rgba(217,178,74,0.55)'; g.font="11px 'Cinzel', serif"; g.textBaseline='middle';
  g.textAlign='right'; g.fillText('L', CX-half-14, by);
  g.textAlign='left';  g.fillText('R', CX+half+14, by);
  g.textAlign='center';
  // the gliding dot = where the sound is coming from, right now
  const dx=CX+mPanS*half, dr=10+master*18;
  const dot=g.createRadialGradient(dx,by,0,dx,by,dr);
  dot.addColorStop(0,`rgba(255,240,200,${0.65+master*0.3})`);
  dot.addColorStop(1,'rgba(255,240,200,0)');
  g.globalCompositeOperation='lighter'; g.fillStyle=dot;
  g.beginPath(); g.arc(dx,by,dr,0,Math.PI*2); g.fill();
  g.globalCompositeOperation='source-over';
}

/* ---------------- the light-strand through the voices (leans with direction) -- */
function drawStrand(){
  const pts=[]; for(let i=N-1;i>=0;i--) pts.push(SECTIONS[i]);   // top(piccolo) → bottom(bass)
  const grad=g.createLinearGradient(0,yTop,0,yBot);
  grad.addColorStop(0,`rgba(${SECTIONS[5].rgb.join(',')},0.5)`);
  grad.addColorStop(1,`rgba(${SECTIONS[0].rgb.join(',')},0.5)`);
  g.globalCompositeOperation='lighter';
  g.strokeStyle=grad; g.lineWidth=2; g.lineCap='round'; g.lineJoin='round';
  g.shadowColor='rgba(230,180,90,0.45)'; g.shadowBlur=10;
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length-1;i++){ const xc=(pts[i].x+pts[i+1].x)/2, yc=(pts[i].y+pts[i+1].y)/2; g.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc); }
  g.quadraticCurveTo(pts[N-1].x, pts[N-1].y, pts[N-1].x, pts[N-1].y);
  g.stroke();
  g.shadowBlur=0; g.globalCompositeOperation='source-over';
}

/* ---------------- the voices themselves (controlled exposure) ----------------- */
function drawVoices(){
  for(let i=0;i<N;i++){ const s=SECTIONS[i];
    const r=12+s.e*64;
    // soft body — source-over so brightness can't run away to white
    g.globalAlpha=clamp(0.30+s.e*1.1,0,0.92);
    g.drawImage(s.spr, s.x-r, s.y-r, r*2, r*2);
    g.globalAlpha=1;
    // a small bright core only on real energy → tasteful sparkle, no blow-out
    if(s.e>0.22){ g.globalCompositeOperation='lighter'; g.globalAlpha=clamp(s.e-0.22,0,0.55);
      const cr=r*0.42; g.drawImage(s.spr, s.x-cr, s.y-cr, cr*2, cr*2);
      g.globalAlpha=1; g.globalCompositeOperation='source-over'; }
  }
}

/* ---------------- main loop ---------------- */
let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt = _pt ? Math.min((t-_pt)/1000, 0.05) : 0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ && fps<42 && qTier>0){ qTier--; resize(); initMotes(); } } }
  _lt=t;

  analyse(t); layout();

  // controlled trail (source-over fade — no additive accumulation)
  g.globalCompositeOperation='source-over';
  g.fillStyle='rgba(7,4,3,0.24)'; g.fillRect(0,0,W,H);

  // warm aura, biased to the side the sound comes from
  const ax=CX+mPanS*spread;
  const aura=g.createRadialGradient(ax,CY,0,ax,CY,MIN*0.95);
  aura.addColorStop(0,`rgba(150,96,42,${0.05+master*0.10})`);
  aura.addColorStop(1,'rgba(150,96,42,0)');
  g.fillStyle=aura; g.fillRect(0,0,W,H);

  drawField();
  drawMotes(dt);
  drawStrand();
  drawVoices();

  for(let i=0;i<N;i++){ const lv=SECTIONS[i].e;
    legSw[i].style.transform=`scaleX(${1+lv*2.2})`;
    legSw[i].style.boxShadow=`0 0 ${3+lv*14}px currentColor`;
  }
}
requestAnimationFrame(frame);

/* ---------------- transport / files ---------------- */
const fileI=document.getElementById('file'), begin=document.getElementById('begin'),
      newb=document.getElementById('newb'), play=document.getElementById('play'),
      seek=document.getElementById('seek'), tm=document.getElementById('tm'),
      intro=document.getElementById('intro'), hud=document.getElementById('hud'),
      npt=document.getElementById('npt'), drop=document.getElementById('drop'),
      demo=document.getElementById('demo');

begin.onclick=()=>fileI.click();
newb.onclick=()=>fileI.click();
fileI.onchange=e=>{ if(e.target.files[0]) load(e.target.files[0]); };
if(demo) demo.onclick=()=>start('demo-vivaldi-spring.mp3', 'Vivaldi · Spring — Allegro');

function load(f){ start(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/,'')); }
function start(src, title){
  audio.src=src; npt.textContent=title;
  try{ buildGraph(); }catch(err){ console.warn('audio graph:',err); }
  if(actx && actx.state==='suspended') actx.resume();
  audio.play().then(()=>{
    playing=true; intro.classList.add('gone'); hud.classList.add('show'); play.textContent='PAUSE';
  }).catch(err=>{ console.warn('play failed',err);
    intro.classList.add('gone'); hud.classList.add('show');
  });
}
play.onclick=()=>{ if(audio.paused){ audio.play(); playing=true; play.textContent='PAUSE'; actx&&actx.resume(); }
  else { audio.pause(); playing=false; play.textContent='PLAY'; } };
audio.ontimeupdate=()=>{ if(audio.duration){ seek.value=(audio.currentTime/audio.duration)*1000;
  tm.textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`; } };
audio.onended=()=>{ playing=false; play.textContent='PLAY'; };
seek.oninput=()=>{ if(audio.duration) audio.currentTime=(seek.value/1000)*audio.duration; };
function fmt(s){ s=Math.floor(s); return `${(s/60)|0}:${String(s%60).padStart(2,'0')}`; }

addEventListener('dragover',e=>{ e.preventDefault(); drop.classList.add('on'); });
addEventListener('dragleave',e=>{ if(e.relatedTarget===null) drop.classList.remove('on'); });
addEventListener('drop',e=>{ e.preventDefault(); drop.classList.remove('on');
  const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('audio')) load(f); });

// keyboard: space = play/pause · F = fullscreen · H = hide interface · Q = cycle quality
addEventListener('keydown',e=>{
  const tag=(e.target&&e.target.tagName)||''; if(tag==='INPUT'||tag==='TEXTAREA') return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); play.click(); }
  else if(k==='f'){ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  else if(k==='h'){ hud.classList.toggle('show'); }
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); initMotes(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
