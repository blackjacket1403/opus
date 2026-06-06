import './style.css';
"use strict";
/* =========================================================================
   OPUS — The Orchestra in the Round
   A top-down concert: the orchestra is seated in a circle, hundreds of audience
   surround them. Each instrument section has a seat; when it plays, a ribbon of
   light-notes streams OUTWARD from its seat toward the audience — so you see the
   sound radiate from its direction. Stereo pan nudges each seat's position, so
   the live direction of sound is part of the staging.
   Vanilla JS · Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU = Math.PI*2;
const lerp  = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rgba  = (c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const NOTEGLYPHS = ['♪','♫','♩','♬'];
const SQUASH = 0.60;                       // vertical squash → looking down on the hall

let W,H,DPR,CX,CY,MIN,stageR;
/* adaptive quality — auto-tunes to stay smooth on any laptop */
const QUAL=[
  {dpr:1.00, aud:170, notes:120},   // low
  {dpr:1.35, aud:320, notes:190},   // medium
  {dpr:1.60, aud:470, notes:280},   // high
];
let qTier = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 1 : 2;
let autoQ = true;

/* ---------------- voices / sections (seated around the circle) ---------------- */
const SECTIONS = [
  { name:'Contrabass',  lo:24,   hi:95,    rgb:[255,120, 70] },
  { name:'Violoncello', lo:95,   hi:260,   rgb:[255,150, 80] },
  { name:'Viola',       lo:260,  hi:620,   rgb:[255,196,108] },
  { name:'Violino',     lo:620,  hi:1600,  rgb:[255,228,150] },
  { name:'Flauto',      lo:1600, hi:4200,  rgb:[190,238,205] },
  { name:'Ottavino',    lo:4200, hi:13000, rgb:[168,206,255] },
];
const N = SECTIONS.length;
SECTIONS.forEach(s=>{ s.eL=0; s.eR=0; s.e=0; s.pan=0; s.base=0; s.seatA=null; s.x=0; s.y=0; s.acc=0; });

function resize(){
  DPR = Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W*DPR); cv.height = Math.floor(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H*0.52; MIN=Math.min(W,H);
  stageR = MIN*0.17;
  SECTIONS.forEach((s,i)=>{ s.base = -Math.PI/2 + (i+0.5)/N*TAU; if(s.seatA===null) s.seatA=s.base; });
  buildAudience();
  g.fillStyle='#07060a'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);

/* legend (right edge) */
const leg = document.getElementById('leg'), legSw=[];
SECTIONS.forEach(s=>{
  const r=document.createElement('div'); r.className='lr';
  const sw=document.createElement('span'); sw.className='sw';
  const col=`rgb(${s.rgb.join(',')})`; sw.style.background=col; sw.style.color=col;
  const n=document.createElement('span'); n.textContent=s.name;
  r.append(sw,n); leg.append(r); legSw.push(sw);
});

/* glow sprite per section */
function glow(rgb){
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
  const gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,248,235,0.92)');
  gr.addColorStop(0.30,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`);
  gr.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  x.fillStyle=gr; x.fillRect(0,0,64,64); return c;
}
SECTIONS.forEach(s=> s.spr=glow(s.rgb));

/* ---------------- audience (hundreds, surrounding) ---------------- */
let audience=[];
function buildAudience(){
  audience=[]; const cap=QUAL[qTier].aud, r0=stageR*1.7, r1=MIN*0.66, rings=8;
  for(let ri=0; ri<rings && audience.length<cap; ri++){
    const rr=lerp(r0,r1,ri/(rings-1)), count=Math.max(14, Math.round(TAU*rr/22));
    for(let k=0;k<count && audience.length<cap;k++){
      const a=(k/count)*TAU + ri*0.13;
      audience.push({ x:CX+Math.cos(a)*rr, y:CY+Math.sin(a)*rr*SQUASH, tw:Math.random()*TAU, sp:0.5+Math.random(), b:0.28+Math.random()*0.5 });
    }
  }
}

/* ---------------- note-ribbon pool ---------------- */
let notes=[];
function initNotes(){ const cap=QUAL[qTier].notes; notes=new Array(cap); for(let i=0;i<cap;i++) notes[i]={alive:false,tx:[],ty:[]}; }

resize(); initNotes();

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
    for(let i=0;i<N;i++){ const s=SECTIONS[i]; const tilt=1+i*0.16;
      const eL=bandAvg(freqL,s)*tilt, eR=bandAvg(freqR,s)*tilt;
      s.eL += (eL-s.eL)*0.25; s.eR += (eR-s.eR)*0.25;
      const e=Math.pow((s.eL+s.eR)*0.5, 0.85);
      s.e += (e-s.e)*0.2;
      const p=(s.eR-s.eL)/(s.eR+s.eL+1e-4);
      s.pan += (p-s.pan)*0.12;
      tot+=s.e; wpan+=s.e*s.pan; if(i>=4) hi+=s.e;
    }
    master += (clamp(tot/N*1.7,0,1)-master)*0.1;
    mPan = tot>1e-3 ? clamp(wpan/tot,-1,1) : 0;
    const d=hi-flux; flux=hi; if(d>0.05) pulse=Math.min(1,pulse+d*2.4); pulse*=0.9;
  } else {
    for(let i=0;i<N;i++){ const s=SECTIONS[i];
      const e=0.08+0.06*Math.sin(t*0.0004+i*1.1);
      s.e += (e-s.e)*0.06;
      const p=0.5*Math.sin(t*0.00025+i*0.9);
      s.pan += (p-s.pan)*0.04;
    }
    master += (0.16-master)*0.04; mPan = 0.4*Math.sin(t*0.00022); pulse*=0.92;
  }
  mPanS += (mPan-mPanS)*0.06;
}

/* ---------------- seats: angle nudged by this voice's stereo pan ---------------- */
function layout(){
  for(let i=0;i<N;i++){ const s=SECTIONS[i];
    const ta = s.base + s.pan*0.42;          // direction of sound shifts the seat
    s.seatA += (ta - s.seatA)*0.07;
    s.x = CX + Math.cos(s.seatA)*stageR;
    s.y = CY + Math.sin(s.seatA)*stageR*SQUASH;
  }
}

/* ---------------- the spectacle: ribbons of light-notes ---------------- */
function spawnNote(i){
  let p=null; for(const q of notes){ if(!q.alive){ p=q; break; } } if(!p) return;
  const s=SECTIONS[i], ang=s.seatA + (Math.random()-0.5)*0.55, sp=MIN*(0.11+Math.random()*0.13);
  p.alive=true; p.sec=i; p.x=s.x; p.y=s.y;
  p.vx=Math.cos(ang)*sp; p.vy=Math.sin(ang)*sp*SQUASH;
  p.curl=(Math.random()-0.5)*0.8; p.life=1; p.size=6+Math.random()*8;
  p.tx.length=0; p.ty.length=0; p.tx.push(p.x); p.ty.push(p.y);
  p.glyph = Math.random()<0.6 ? NOTEGLYPHS[(Math.random()*NOTEGLYPHS.length)|0] : null;
}
function notesUpdateDraw(dt){
  // spawn from each section in proportion to its energy (+ onset surge)
  for(let i=0;i<N;i++){ const s=SECTIONS[i];
    s.acc += dt*(s.e*24 + s.e*pulse*40 + 0.8);
    while(s.acc>=1){ s.acc-=1; spawnNote(i); }
  }
  g.lineCap='round';
  g.font="16px 'Cormorant Garamond', Georgia, serif"; g.textAlign='center'; g.textBaseline='middle';
  g.globalCompositeOperation='lighter';
  for(const p of notes){ if(!p.alive) continue;
    p.life -= dt*0.5; if(p.life<=0){ p.alive=false; continue; }
    const c=Math.cos(p.curl*dt), si=Math.sin(p.curl*dt);      // graceful curl
    const vx=p.vx*c - p.vy*si, vy=p.vx*si + p.vy*c; p.vx=vx; p.vy=vy;
    p.vx += mPanS*8*dt;                                        // lean with the stereo field
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.tx.push(p.x); p.ty.push(p.y); if(p.tx.length>10){ p.tx.shift(); p.ty.shift(); }
    if(p.x<-50||p.x>W+50||p.y<-50||p.y>H+50){ p.alive=false; continue; }
    const s=SECTIONS[p.sec], a=clamp(p.life,0,1);
    // ribbon
    g.strokeStyle=rgba(s.rgb, a*0.5); g.lineWidth=1.6;
    g.beginPath(); for(let k=0;k<p.tx.length;k++){ k?g.lineTo(p.tx[k],p.ty[k]):g.moveTo(p.tx[k],p.ty[k]); } g.stroke();
    // glowing head
    const hs=p.size*(0.5+a*0.6);
    g.globalAlpha=a*0.8; g.drawImage(s.spr, p.x-hs, p.y-hs, hs*2, hs*2); g.globalAlpha=1;
    // floating note glyph
    if(p.glyph){ g.fillStyle=rgba([255,246,228], a*0.85); g.fillText(p.glyph, p.x, p.y); }
  }
  g.globalCompositeOperation='source-over';
}

/* ---------------- the hall ---------------- */
function drawStage(){
  // soft warm stage light under the orchestra (a lit floor, NOT a sun)
  const gr=g.createRadialGradient(CX,CY,0,CX,CY,stageR*2.6);
  gr.addColorStop(0, rgba([130,96,62], 0.10+master*0.10));
  gr.addColorStop(1,'rgba(130,96,62,0)');
  g.save(); g.translate(CX,CY); g.scale(1,SQUASH);
  g.fillStyle=gr; g.beginPath(); g.arc(0,0,stageR*2.6,0,TAU); g.fill();
  g.strokeStyle='rgba(202,162,58,0.12)'; g.lineWidth=1; g.beginPath(); g.arc(0,0,stageR,0,TAU); g.stroke();
  g.restore();
}
function drawAudience(dt){
  for(const a of audience){ a.tw+=dt*a.sp;
    g.globalAlpha=clamp(a.b*(0.5+0.5*Math.sin(a.tw))*(0.5+master*0.9),0,0.8);
    g.fillStyle='#ecdcc0';
    g.beginPath(); g.arc(a.x,a.y,1.4,0,TAU); g.fill();
  }
  g.globalAlpha=1;
}
function drawSeats(){
  g.textAlign='center'; g.textBaseline='middle';
  for(let i=0;i<N;i++){ const s=SECTIONS[i];
    const r=10+s.e*38;
    g.globalCompositeOperation='lighter'; g.globalAlpha=clamp(0.42+s.e*0.9,0,1);
    g.drawImage(s.spr, s.x-r, s.y-r, r*2, r*2);
    g.globalAlpha=1; g.globalCompositeOperation='source-over';
    g.fillStyle=rgba(s.rgb, 0.45+s.e*0.4); g.font="10px 'Cinzel', serif";
    g.fillText(s.name.toUpperCase(), s.x, s.y + r + 12);
  }
}

/* ---------------- main loop ---------------- */
let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt = _pt ? Math.min((t-_pt)/1000, 0.05) : 0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ && fps<42 && qTier>0){ qTier--; resize(); initNotes(); } } }
  _lt=t;

  analyse(t); layout();

  g.globalCompositeOperation='source-over';
  g.fillStyle='rgba(7,6,10,0.26)'; g.fillRect(0,0,W,H);   // controlled trail fade

  drawStage();
  drawAudience(dt);
  notesUpdateDraw(dt);   // ribbons of notes radiating from each section
  drawSeats();

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
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); initNotes(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
