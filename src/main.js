import './style.css';
"use strict";
/* =========================================================================
   OPUS — Resonant Forms
   You sit inside the emotional space of a performance. The orchestra is not
   musicians but a living spatial composition of translucent, silk-like resonant
   membranes — one per section — layered in a dark, elegant listening space.
   Pitch is read by vertical placement & motion (basses low/grounded → high airs
   light & high); stereo direction is read by each form LEANING and GLOWING
   toward the side the sound comes from. Faint audience silhouettes ring the
   space; soft architectural arcs arch overhead. Midnight, champagne gold,
   bronze, ivory. Calm, graceful, cinematic.
   Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

let W,H,DPR,CX,CY,MIN, bloom,bctx,bw,bh;
const QUAL=[{dpr:1.0},{dpr:1.35},{dpr:1.6}];
let qTier=(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?1:2, autoQ=true;
function resize(){
  DPR=Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W=window.innerWidth; H=window.innerHeight;
  cv.width=Math.floor(W*DPR); cv.height=Math.floor(H*DPR); g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H*0.5; MIN=Math.min(W,H);
  bw=Math.max(1,Math.floor(W*DPR/4)); bh=Math.max(1,Math.floor(H*DPR/4));
  if(!bloom){ bloom=document.createElement('canvas'); bctx=bloom.getContext('2d'); }
  bloom.width=bw; bloom.height=bh;
  buildAudience();
  g.fillStyle='#070810'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);

/* ---------------- orchestral sections (warm, cohesive palette) ---------------- */
const SECTIONS=[
  { name:'Double basses', lo:24,   hi:95,    rgb:[150, 98, 60], speed:0.16, wl:0.0042 },
  { name:'Cellos',        lo:95,   hi:260,   rgb:[184,128, 76], speed:0.22, wl:0.0056 },
  { name:'Violas',        lo:260,  hi:620,   rgb:[206,162,104], speed:0.30, wl:0.0072 },
  { name:'Violins',       lo:620,  hi:1600,  rgb:[226,196,148], speed:0.40, wl:0.0092 },
  { name:'Woodwinds',     lo:1600, hi:4200,  rgb:[224,212,178], speed:0.52, wl:0.0118 },
  { name:'High airs',     lo:4200, hi:13000, rgb:[232,224,204], speed:0.66, wl:0.0150 },
];
const N=SECTIONS.length;
SECTIONS.forEach(s=>{ s.eL=0; s.eR=0; s.e=0; s.pan=0; s.panS=0; s.phase=Math.random()*TAU; s.phase2=Math.random()*TAU; });

/* ---------------- faint audience ringing the space ---------------- */
let audience=[];
function buildAudience(){
  audience=[];
  for(let row=0; row<2; row++){
    const rx=W*(0.54+row*0.07), ry=H*(0.44+row*0.05), cyy=H*0.50;
    for(let a=0.12*Math.PI; a<=0.88*Math.PI; a+=0.045){          // lower arc → bottom + sides
      const x=CX+Math.cos(a)*rx, y=cyy+Math.sin(a)*ry;
      if(y<H*0.6) continue;
      audience.push({x,y, s:lerp(16,11,row)});
    }
  }
}

resize();

/* ---------------- audio ---------------- */
let actx, anL, anR, freqL, freqR, binHz, playing=false, ready=false;
function buildGraph(){
  if(actx) return;
  actx=new (window.AudioContext||window.webkitAudioContext)();
  const src=actx.createMediaElementSource(audio), sp=actx.createChannelSplitter(2);
  anL=actx.createAnalyser(); anR=actx.createAnalyser();
  anL.fftSize=4096; anR.fftSize=4096; anL.smoothingTimeConstant=0.84; anR.smoothingTimeConstant=0.84;
  freqL=new Uint8Array(anL.frequencyBinCount); freqR=new Uint8Array(anR.frequencyBinCount);
  binHz=actx.sampleRate/anL.fftSize;
  SECTIONS.forEach(s=>{ s.i0=Math.max(1,Math.round(s.lo/binHz)); s.i1=Math.max(s.i0,Math.round(s.hi/binHz)); });
  src.connect(sp); sp.connect(anL,0); sp.connect(anR,1); src.connect(actx.destination);
  ready=true;
}
function bandAvg(arr,s){ let sum=0,n=0,hi=Math.min(s.i1,arr.length-1); for(let i=s.i0;i<=hi;i++){sum+=arr[i];n++;} return n?sum/n/255:0; }

let master=0, mPanS=0, breath=0;
function analyse(t,dt){
  let tot=0, wpan=0;
  if(ready&&playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    for(let i=0;i<N;i++){ const s=SECTIONS[i]; const tilt=1+i*0.16;
      const eL=bandAvg(freqL,s)*tilt, eR=bandAvg(freqR,s)*tilt;
      s.eL+=(eL-s.eL)*0.22; s.eR+=(eR-s.eR)*0.22;
      const e=Math.pow((s.eL+s.eR)*0.5,0.82); s.e+=(e-s.e)*0.14;
      s.pan+=((s.eR-s.eL)/(s.eR+s.eL+1e-4)-s.pan)*0.10; s.panS+=(s.pan-s.panS)*0.06;
      tot+=s.e; wpan+=s.e*s.panS;
    }
  } else {
    for(let i=0;i<N;i++){ const s=SECTIONS[i];
      const e=0.10+0.07*Math.sin(t*0.00035+i*1.0); s.e+=(e-s.e)*0.04;
      s.panS+=(0.4*Math.sin(t*0.00022+i*0.8)-s.panS)*0.03; tot+=s.e; wpan+=s.e*s.panS;
    }
  }
  master+=(clamp(tot/N*1.6,0,1)-master)*0.08;
  mPanS+=((tot>1e-3?wpan/tot:0)-mPanS)*0.05;
  breath=0.6+0.4*Math.sin(t*0.0005);                     // slow shared breathing
  for(const s of SECTIONS){ s.phase+=dt*s.speed*(1+s.e*0.6); s.phase2+=dt*s.speed*0.6; }
}

/* ---------------- the listening space ---------------- */
function drawSpace(){
  // midnight backdrop with a faint warm pooling low-centre
  const bg=g.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#080a14'); bg.addColorStop(0.55,'#070810'); bg.addColorStop(1,'#050509');
  g.fillStyle=bg; g.fillRect(0,0,W,H);
  const warm=g.createRadialGradient(CX+mPanS*W*0.1,H*0.62,0,CX+mPanS*W*0.1,H*0.62,MIN*0.85);
  warm.addColorStop(0, rgba([120,86,46], 0.10+master*0.08)); warm.addColorStop(1,'rgba(120,86,46,0)');
  g.fillStyle=warm; g.fillRect(0,0,W,H);
  // soft architectural arcs overhead (suggest a shell, not a hall)
  g.globalCompositeOperation='lighter';
  for(let k=0;k<3;k++){ const ry=H*(0.30+k*0.10), rx=W*(0.42+k*0.10);
    g.strokeStyle=rgba([214,184,130], 0.05+master*0.03); g.lineWidth=1;
    g.beginPath(); g.ellipse(CX+mPanS*W*0.04, H*0.36, rx, ry, 0, Math.PI*1.04, Math.PI*1.96); g.stroke(); }
  g.globalCompositeOperation='source-over';
}
function drawAudience(){
  for(const a of audience){
    g.fillStyle='rgba(4,5,9,0.9)';
    g.beginPath(); g.ellipse(a.x,a.y,a.s,a.s*1.2,0,0,TAU); g.fill();
    g.beginPath(); g.arc(a.x,a.y-a.s*1.0,a.s*0.6,0,TAU); g.fill();
    g.strokeStyle='rgba(214,184,130,0.05)'; g.lineWidth=1;       // barely-there warm rim
    g.beginPath(); g.arc(a.x,a.y-a.s*1.0,a.s*0.6,Math.PI*1.15,Math.PI*1.95); g.stroke();
  }
}

/* ---------------- a resonant silk membrane per section ---------------- */
function drawMembrane(s,i){
  const reg=i/(N-1);
  const baseY=lerp(H*0.80, H*0.20, reg);
  const cx=CX + s.panS*W*0.17 + mPanS*W*0.03;          // lean toward the sound's side
  const envW=W*(0.30+0.12*(1-reg));                    // broader for low, tighter for high
  const thick=(H*0.030 + s.e*H*0.085)*(0.8+breath*0.3);
  const amp=(H*0.012 + s.e*H*0.05)*(1.15-reg*0.35);
  const a=clamp(0.06 + s.e*0.30, 0, 0.42);
  const col=s.rgb;
  const step=Math.max(7, W/120);
  const yTopAt=x=>{ const env=Math.exp(-((x-cx)/envW)*((x-cx)/envW)); const th=thick*(0.35+0.65*env);
    return baseY - th*0.5 + Math.sin(x*s.wl+s.phase)*amp*env; };
  const yBotAt=x=>{ const env=Math.exp(-((x-cx)/envW)*((x-cx)/envW)); const th=thick*(0.35+0.65*env);
    return baseY + th*0.5 + Math.sin(x*s.wl+s.phase2+1.1)*amp*env; };
  // translucent silk body (source-over so layers blend like cloth, never blow out)
  g.beginPath();
  for(let x=-20;x<=W+20;x+=step){ const y=yTopAt(x); x===-20?g.moveTo(x,y):g.lineTo(x,y); }
  for(let x=W+20;x>=-20;x-=step){ g.lineTo(x, yBotAt(x)); }
  g.closePath();
  const vg=g.createLinearGradient(0,baseY-thick,0,baseY+thick);
  vg.addColorStop(0, rgba(col,0)); vg.addColorStop(0.5, rgba(col,a)); vg.addColorStop(1, rgba(col,0));
  g.fillStyle=vg; g.fill();
  // luminous sheen — a travelling highlight that catches the "silk" surface
  g.globalCompositeOperation='lighter';
  const hl=(0.5+0.5*Math.sin(s.phase*0.8))*W;                       // highlight travels along x
  g.lineWidth=1.4+s.e*2.0; g.lineCap='round';
  g.beginPath();
  for(let x=-20;x<=W+20;x+=step){ const y=(yTopAt(x)*0.62+yBotAt(x)*0.38);
    x===-20?g.moveTo(x,y):g.lineTo(x,y); }
  const sg=g.createLinearGradient(hl-W*0.28,0,hl+W*0.28,0);
  const sh=clamp(0.10+s.e*0.5,0,0.7);
  sg.addColorStop(0, rgba([255,244,220],0)); sg.addColorStop(0.5, rgba([255,246,224],sh)); sg.addColorStop(1, rgba([255,244,220],0));
  g.strokeStyle=sg; g.stroke();
  g.globalCompositeOperation='source-over';
}

function drawBloom(){
  bctx.setTransform(1,0,0,1,0,0); bctx.clearRect(0,0,bw,bh); bctx.imageSmoothingEnabled=true;
  bctx.drawImage(cv,0,0,bw,bh);
  g.globalCompositeOperation='lighter'; g.imageSmoothingEnabled=true;
  g.globalAlpha=0.32; g.drawImage(bloom,0,0,W,H);            // restrained, soft glow
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}

let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt=_pt?Math.min((t-_pt)/1000,0.05):0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ&&fps<42&&qTier>0){ qTier--; resize(); } } }
  _lt=t;
  analyse(t,dt);
  drawSpace();
  for(let i=N-1;i>=0;i--) drawMembrane(SECTIONS[i],i);    // high/far first → basses grounded in front
  drawBloom();
  drawAudience();                                          // silhouettes in front, framing the space
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
  }).catch(err=>{ console.warn('play failed',err); intro.classList.add('gone'); hud.classList.add('show'); });
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
addEventListener('keydown',e=>{
  const tag=(e.target&&e.target.tagName)||''; if(tag==='INPUT'||tag==='TEXTAREA') return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); play.click(); }
  else if(k==='f'){ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  else if(k==='h'){ hud.classList.toggle('show'); }
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
