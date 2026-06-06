import './style.css';
"use strict";
/* =========================================================================
   OPUS — The Palace of Attention
   You fly, endlessly, through a dark infinite space. The music builds the world
   ahead of you: luminous translucent CHAMBERS bloom out of the darkness and rush
   past — opening toward the side the sound comes from (stereo), at the height of
   their pitch, brightening and accelerating with the music. You are flying
   through musical thought. Real perspective depth + motion.
   Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

let W,H,DPR,CX,CY,MIN,FOC, bloom,bctx,bw,bh;
const QUAL=[{dpr:1.0,n:48},{dpr:1.35,n:80},{dpr:1.6,n:120}];
let qTier=(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?1:2, autoQ=true;
function resize(){
  DPR=Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W=window.innerWidth; H=window.innerHeight;
  cv.width=Math.floor(W*DPR); cv.height=Math.floor(H*DPR); g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H/2; MIN=Math.min(W,H); FOC=H*0.9;
  bw=Math.max(1,Math.floor(W*DPR/4)); bh=Math.max(1,Math.floor(H*DPR/4));
  if(!bloom){ bloom=document.createElement('canvas'); bctx=bloom.getContext('2d'); }
  bloom.width=bw; bloom.height=bh;
  g.fillStyle='#04040a'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);

/* ---------------- voices (warm low → cool high) ---------------- */
const SECTIONS=[
  { name:'Double basses', lo:24,   hi:95,    rgb:[230,140, 86] },
  { name:'Cellos',        lo:95,   hi:260,   rgb:[236,166, 96] },
  { name:'Violas',        lo:260,  hi:620,   rgb:[238,198,128] },
  { name:'Violins',       lo:620,  hi:1600,  rgb:[236,216,168] },
  { name:'Woodwinds',     lo:1600, hi:4200,  rgb:[150,216,210] },
  { name:'High airs',     lo:4200, hi:13000, rgb:[160,190,246] },
];
const N=SECTIONS.length;
SECTIONS.forEach(s=>{ s.eL=0;s.eR=0;s.e=0;s.pan=0;s.panS=0; });

/* ---------------- the flight: chambers in 3D ---------------- */
const NEAR=42, FAR=1500;
let camZ=0, camPan=0, speed=240;
let chambers=[];
function pickSec(){ let tot=0,w=[]; for(let i=0;i<N;i++){ w[i]=0.05+SECTIONS[i].e*SECTIONS[i].e; tot+=w[i]; }
  let r=Math.random()*tot; for(let i=0;i<N;i++){ r-=w[i]; if(r<=0) return i; } return 0; }
function placeChamber(c, z){
  const sec=pickSec(), s=SECTIONS[sec], alt=sec/(N-1);
  c.sec=sec; c.col=s.rgb; c.z=z;
  c.x = s.panS*360 + (Math.random()-0.5)*520;            // opens toward the sounding side
  c.y = (0.5-alt)*820 + (Math.random()-0.5)*240;         // pitch → height (bass low, airs high)
  c.baseR = 70 + Math.random()*120;
  c.type = (Math.random()*3)|0;                          // ring / hexagon / vault
  c.sides = 5 + ((Math.random()*4)|0);
  c.rot = Math.random()*TAU; c.spin=(Math.random()-0.5)*0.5;
  c.power = clamp(0.3 + s.e*1.4, 0.3, 1.4);              // brightness frozen from the phrase that birthed it
}
function initChambers(){ chambers=new Array(QUAL[qTier].n);
  for(let i=0;i<chambers.length;i++){ const c={}; placeChamber(c, camZ + NEAR + Math.random()*(FAR-NEAR)); chambers[i]=c; } }

resize(); initChambers();

/* ---------------- audio ---------------- */
let actx, anL, anR, freqL, freqR, binHz, playing=false, ready=false;
function buildGraph(){
  if(actx) return;
  actx=new (window.AudioContext||window.webkitAudioContext)();
  const src=actx.createMediaElementSource(audio), sp=actx.createChannelSplitter(2);
  anL=actx.createAnalyser(); anR=actx.createAnalyser();
  anL.fftSize=4096; anR.fftSize=4096; anL.smoothingTimeConstant=0.82; anR.smoothingTimeConstant=0.82;
  freqL=new Uint8Array(anL.frequencyBinCount); freqR=new Uint8Array(anR.frequencyBinCount);
  binHz=actx.sampleRate/anL.fftSize;
  SECTIONS.forEach(s=>{ s.i0=Math.max(1,Math.round(s.lo/binHz)); s.i1=Math.max(s.i0,Math.round(s.hi/binHz)); });
  src.connect(sp); sp.connect(anL,0); sp.connect(anR,1); src.connect(actx.destination);
  ready=true;
}
function bandAvg(arr,s){ let sum=0,n=0,hi=Math.min(s.i1,arr.length-1); for(let i=s.i0;i<=hi;i++){sum+=arr[i];n++;} return n?sum/n/255:0; }

let master=0, mPan=0;
function analyse(t,dt){
  let tot=0, wpan=0;
  if(ready&&playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    for(let i=0;i<N;i++){ const s=SECTIONS[i]; const tilt=1+i*0.16;
      const eL=bandAvg(freqL,s)*tilt, eR=bandAvg(freqR,s)*tilt;
      s.eL+=(eL-s.eL)*0.25; s.eR+=(eR-s.eR)*0.25;
      const e=Math.pow((s.eL+s.eR)*0.5,0.82); s.e+=(e-s.e)*0.2;
      s.pan+=((s.eR-s.eL)/(s.eR+s.eL+1e-4)-s.pan)*0.12; s.panS+=(s.pan-s.panS)*0.07;
      tot+=s.e; wpan+=s.e*s.panS;
    }
  } else {
    for(let i=0;i<N;i++){ const s=SECTIONS[i];
      const e=0.12+0.08*Math.sin(t*0.0004+i*1.0); s.e+=(e-s.e)*0.05;
      s.panS+=(0.45*Math.sin(t*0.00024+i*0.8)-s.panS)*0.03; tot+=s.e; wpan+=s.e*s.panS; }
  }
  master+=(clamp(tot/N*1.7,0,1)-master)*0.08;
  mPan = tot>1e-3? wpan/tot : 0;
  // music drives flight speed + the world bends toward the sound
  speed += ((220 + master*900) - speed)*0.05;
  camZ  += speed*dt;
  camPan += (mPan*W*0.10 - camPan)*0.04;
}

/* ---------------- draw a chamber ---------------- */
function drawChamber(c){
  const depth=c.z-camZ;
  if(depth<=NEAR){ placeChamber(c, camZ+FAR); return; }
  const s=FOC/depth;
  const sx=CX + camPan + c.x*s, sy=CY + c.y*s, R=c.baseR*s;
  if(R<1.2) return;
  // fade in from the far dark, fade as it passes very close
  const fin = clamp((FAR-depth)/(FAR*0.45),0,1);
  const fout= clamp((depth-NEAR)/(NEAR*2.2),0,1);
  const a = clamp(fin*fout*c.power*(0.5),0,0.9);
  if(a<=0.003) return;
  const col=c.col;
  g.globalCompositeOperation='lighter';
  // translucent bubble glow
  const gr=g.createRadialGradient(sx,sy,0,sx,sy,R*1.15);
  gr.addColorStop(0, rgba(col, a*0.10)); gr.addColorStop(0.7, rgba(col, a*0.05)); gr.addColorStop(1, rgba(col,0));
  g.fillStyle=gr; g.beginPath(); g.arc(sx,sy,R*1.15,0,TAU); g.fill();
  // concentric architecture
  const rot=c.rot + camZ*0.0006*c.spin;
  for(let k=0;k<3;k++){ const rr=R*(0.55+k*0.24); const aa=a*(1.0-k*0.22);
    g.strokeStyle=rgba(col, aa); g.lineWidth=clamp(R*0.012,0.6,3);
    if(c.type===0){ g.beginPath(); g.ellipse(sx,sy,rr,rr*0.82,0,0,TAU); g.stroke(); }
    else { g.save(); g.translate(sx,sy); g.rotate(rot+k*0.2); g.beginPath();
      const sd=c.type===2?4:c.sides;
      for(let p=0;p<=sd;p++){ const ang=p/sd*TAU; const px=Math.cos(ang)*rr, py=Math.sin(ang)*rr*(c.type===2?0.7:1);
        p?g.lineTo(px,py):g.moveTo(px,py); } g.stroke(); g.restore(); }
  }
  // bright facet highlights
  g.strokeStyle=rgba([255,250,240], a*0.5); g.lineWidth=clamp(R*0.01,0.5,2);
  g.beginPath(); g.ellipse(sx,sy,R*0.55,R*0.45,rot,0,TAU); g.stroke();
  g.globalCompositeOperation='source-over';
}

function drawBloom(){
  bctx.setTransform(1,0,0,1,0,0); bctx.clearRect(0,0,bw,bh); bctx.imageSmoothingEnabled=true;
  bctx.drawImage(cv,0,0,bw,bh);
  g.globalCompositeOperation='lighter'; g.imageSmoothingEnabled=true;
  g.globalAlpha=0.30; g.drawImage(bloom,0,0,W,H);
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}

let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt=_pt?Math.min((t-_pt)/1000,0.05):0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ&&fps<42&&qTier>0){ qTier--; resize(); initChambers(); } } }
  _lt=t;
  analyse(t,dt);
  // opaque dark background each frame (additive chambers would otherwise blow out to white)
  g.globalCompositeOperation='source-over';
  const bg=g.createRadialGradient(CX,CY,0,CX,CY,MIN*1.15);
  bg.addColorStop(0,'#0a0a16'); bg.addColorStop(0.6,'#06060e'); bg.addColorStop(1,'#030307');
  g.fillStyle=bg; g.fillRect(0,0,W,H);
  // sort far → near so nearer chambers overlay
  chambers.sort((a,b)=> (b.z-camZ)-(a.z-camZ));
  for(const c of chambers) drawChamber(c);
  drawBloom();
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
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); initChambers(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
