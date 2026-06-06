import './style.css';
"use strict";
/* =========================================================================
   OPUS — The Ring of Sound
   A luminous ring at the centre of a dark hall. Pitch wraps around it (low at
   the top, high at the bottom); the LEFT half of the ring is the left channel
   and the RIGHT half is the right channel, so the ring swells toward the side
   the sound comes from. It breathes, rotates slowly, and glows with real bloom.
   Structured and clear — not noise.
   Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

let W,H,DPR,CX,CY,MIN,R0,AMP, bloom,bctx,bw,bh;
const QUAL=[{dpr:1.0},{dpr:1.35},{dpr:1.6}];
let qTier=(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?1:2, autoQ=true;
function resize(){
  DPR=Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W=window.innerWidth; H=window.innerHeight;
  cv.width=Math.floor(W*DPR); cv.height=Math.floor(H*DPR); g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H*0.5; MIN=Math.min(W,H); R0=MIN*0.17; AMP=MIN*0.23;
  bw=Math.max(1,Math.floor(W*DPR/4)); bh=Math.max(1,Math.floor(H*DPR/4));
  if(!bloom){ bloom=document.createElement('canvas'); bctx=bloom.getContext('2d'); }
  bloom.width=bw; bloom.height=bh;
  g.fillStyle='#06060d'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);

/* ---------------- pitch bands per channel (log-spaced) ---------------- */
const P=56, F_LO=42, F_HI=12000;
const eL=new Float32Array(P), eR=new Float32Array(P);
let actx, anL, anR, freqL, freqR, binHz, playing=false, ready=false, bins=[];
function buildGraph(){
  if(actx) return;
  actx=new (window.AudioContext||window.webkitAudioContext)();
  const src=actx.createMediaElementSource(audio), sp=actx.createChannelSplitter(2);
  anL=actx.createAnalyser(); anR=actx.createAnalyser();
  anL.fftSize=4096; anR.fftSize=4096; anL.smoothingTimeConstant=0.8; anR.smoothingTimeConstant=0.8;
  freqL=new Uint8Array(anL.frequencyBinCount); freqR=new Uint8Array(anR.frequencyBinCount);
  binHz=actx.sampleRate/anL.fftSize;
  for(let i=0;i<P;i++){ const f0=F_LO*Math.pow(F_HI/F_LO,i/P), f1=F_LO*Math.pow(F_HI/F_LO,(i+1)/P);
    bins.push([Math.max(1,Math.round(f0/binHz)), Math.max(1,Math.round(f1/binHz))]); }
  src.connect(sp); sp.connect(anL,0); sp.connect(anR,1); src.connect(actx.destination);
  ready=true;
}
function bandMax(arr,i){ const b=bins[i]; let m=0, hi=Math.min(b[1],arr.length-1); for(let k=b[0];k<=hi;k++) if(arr[k]>m)m=arr[k]; return m/255; }

let level=0, rot=0;
function analyse(t,dt){
  let sum=0;
  if(ready&&playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    for(let i=0;i<P;i++){ const tilt=1+(i/P)*1.4;
      const vL=Math.pow(bandMax(freqL,i)*tilt,0.82), vR=Math.pow(bandMax(freqR,i)*tilt,0.82);
      eL[i]+=(vL-eL[i])*0.3; eR[i]+=(vR-eR[i])*0.3; sum+=eL[i]+eR[i]; }
  } else {
    for(let i=0;i<P;i++){ const u=i/P;
      const v=0.06+0.10*Math.max(0,Math.sin(t*0.0006+u*7))*Math.exp(-u*0.9);
      eL[i]+=(v*(0.7+0.3*Math.sin(t*0.0005))-eL[i])*0.05;
      eR[i]+=(v*(0.7+0.3*Math.cos(t*0.0005))-eR[i])*0.05; sum+=eL[i]+eR[i]; }
  }
  level+=(clamp(sum/P,0,1)-level)*0.1;
  rot+=dt*0.04;
}

/* sample energy for a point: side<0 = left channel, side>0 = right; pitch 0..1 */
function energyAt(side, pitch){ const f=clamp(pitch,0,1)*(P-1), i=Math.floor(f), fr=f-i;
  const arr= side<0?eL:eR; return lerp(arr[i], arr[Math.min(P-1,i+1)], fr); }

/* ---------------- draw ---------------- */
function ringPoints(){
  // closed loop: down the right side (low→high, R channel), up the left side (high→low, L channel)
  const pts=[];
  for(let i=0;i<P;i++){ const pitch=i/(P-1); const ang=-Math.PI/2 + pitch*Math.PI + rot;   // top→bottom, right
    const r=R0 + energyAt(1,pitch)*AMP; pts.push([CX+Math.cos(ang)*r, CY+Math.sin(ang)*r]); }
  for(let i=0;i<P;i++){ const pitch=(P-1-i)/(P-1); const ang=Math.PI/2 + i/(P-1)*Math.PI + rot; // bottom→top, left
    const r=R0 + energyAt(-1,pitch)*AMP; pts.push([CX+Math.cos(ang)*r, CY+Math.sin(ang)*r]); }
  return pts;
}
function tracePath(pts){ const n=pts.length; g.beginPath();
  g.moveTo((pts[n-1][0]+pts[0][0])/2,(pts[n-1][1]+pts[0][1])/2);
  for(let i=0;i<n;i++){ const a=pts[i], b=pts[(i+1)%n]; g.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2); }
  g.closePath();
}
function draw(){
  // background
  const bg=g.createRadialGradient(CX,CY,0,CX,CY,MIN*0.9);
  bg.addColorStop(0,'#0c0a18'); bg.addColorStop(0.6,'#08070f'); bg.addColorStop(1,'#050509');
  g.fillStyle=bg; g.fillRect(0,0,W,H);
  // faint guide rings
  g.strokeStyle='rgba(150,140,190,0.06)'; g.lineWidth=1;
  for(let k=1;k<=3;k++){ g.beginPath(); g.arc(CX,CY,R0+AMP*k/3,0,TAU); g.stroke(); }

  const pts=ringPoints();
  // colour: warm gold (low, top) → cool (high, bottom)
  const grad=g.createLinearGradient(0,CY-R0-AMP,0,CY+R0+AMP);
  grad.addColorStop(0, rgba([255,206,140], 0.95));
  grad.addColorStop(0.5, rgba([255,176,110], 0.95));
  grad.addColorStop(1, rgba([150,196,255], 0.95));

  // soft filled body
  g.globalCompositeOperation='lighter';
  const fill=g.createRadialGradient(CX,CY,R0*0.5,CX,CY,R0+AMP);
  fill.addColorStop(0, rgba([255,190,120], 0.04+level*0.10));
  fill.addColorStop(0.7, rgba([255,170,110], 0.05+level*0.10));
  fill.addColorStop(1, 'rgba(120,150,255,0)');
  tracePath(pts); g.fillStyle=fill; g.fill();

  // glowing stroke
  g.lineJoin='round';
  g.strokeStyle=grad; g.lineWidth=2.2+level*5; g.globalAlpha=0.95; tracePath(pts); g.stroke();
  g.lineWidth=1.0; g.globalAlpha=0.7; g.strokeStyle='rgba(255,248,235,0.7)'; tracePath(pts); g.stroke();
  g.globalAlpha=1;

  // inner core ring + gentle reactive heart (small, tasteful)
  const core=g.createRadialGradient(CX,CY,0,CX,CY,R0*0.95);
  core.addColorStop(0, rgba([255,236,200], 0.10+level*0.22));
  core.addColorStop(1, 'rgba(255,210,150,0)');
  g.fillStyle=core; g.beginPath(); g.arc(CX,CY,R0*0.95,0,TAU); g.fill();
  g.globalCompositeOperation='source-over';
}
function drawBloom(){
  bctx.setTransform(1,0,0,1,0,0); bctx.clearRect(0,0,bw,bh); bctx.imageSmoothingEnabled=true;
  bctx.drawImage(cv,0,0,bw,bh);
  g.globalCompositeOperation='lighter'; g.imageSmoothingEnabled=true;
  g.globalAlpha=0.6; g.drawImage(bloom,0,0,W,H);
  g.globalAlpha=0.35; g.drawImage(bloom,0,0,W,H);
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}
function drawHints(){
  g.font="11px 'Cinzel', serif"; g.textBaseline='middle'; g.fillStyle='rgba(180,172,205,0.30)';
  g.textAlign='right'; g.fillText('LEFT', CX-R0-AMP-14, CY);
  g.textAlign='left';  g.fillText('RIGHT', CX+R0+AMP+14, CY);
  g.textAlign='center'; g.fillStyle='rgba(180,172,205,0.22)';
  g.fillText('low', CX, CY-R0-AMP-16); g.fillText('high', CX, CY+R0+AMP+16);
}

let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt=_pt?Math.min((t-_pt)/1000,0.05):0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ&&fps<42&&qTier>0){ qTier--; resize(); } } }
  _lt=t;
  analyse(t,dt); draw(); drawBloom(); drawHints();
}
requestAnimationFrame(frame); resize();

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
