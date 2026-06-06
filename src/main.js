import './style.css';
"use strict";
/* =========================================================================
   OPUS — The Observatory
   You stand at the centre of an infinite dark dome. The orchestra is not shown.
   What you see is your ATTENTION moving through the music: each voice is a
   luminous crystalline body placed by PITCH (altitude) and STEREO DIRECTION
   (azimuth — where the space opens), sized by energy. Phrases fire comets that
   streak toward the sound's direction and leave glowing corridors that LINGER —
   so over time the sky fills with the music's trajectories and recurring
   motifs, and you begin to see the composition itself.
   Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

let W,H,DPR,CX,CY,MIN,PROJ;
let trail,tg, bloom,bctx,bw,bh;
const QUAL=[{dpr:1.0},{dpr:1.35},{dpr:1.6}];
let qTier=(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?1:2, autoQ=true;
function resize(){
  DPR=Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W=window.innerWidth; H=window.innerHeight;
  cv.width=Math.floor(W*DPR); cv.height=Math.floor(H*DPR); g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H*0.54; MIN=Math.min(W,H); PROJ=MIN*0.60;
  if(!trail){ trail=document.createElement('canvas'); tg=trail.getContext('2d'); }
  trail.width=cv.width; trail.height=cv.height; tg.setTransform(DPR,0,0,DPR,0,0);
  tg.fillStyle='#000'; tg.fillRect(0,0,W,H);
  bw=Math.max(1,Math.floor(W*DPR/4)); bh=Math.max(1,Math.floor(H*DPR/4));
  if(!bloom){ bloom=document.createElement('canvas'); bctx=bloom.getContext('2d'); }
  bloom.width=bw; bloom.height=bh;
  buildStars();
  g.fillStyle='#04040a'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);

/* ---------------- voices (pitch → altitude; warm low → cool high) ---------------- */
const SECTIONS=[
  { name:'Double basses', lo:24,   hi:95,    rgb:[210,128, 78] },
  { name:'Cellos',        lo:95,   hi:260,   rgb:[224,158, 92] },
  { name:'Violas',        lo:260,  hi:620,   rgb:[228,190,128] },
  { name:'Violins',       lo:620,  hi:1600,  rgb:[226,210,168] },
  { name:'Woodwinds',     lo:1600, hi:4200,  rgb:[150,210,206] },
  { name:'High airs',     lo:4200, hi:13000, rgb:[156,184,242] },
];
const N=SECTIONS.length;
SECTIONS.forEach((s,i)=>{ s.eL=0;s.eR=0;s.e=0;s.prevE=0;s.pan=0;s.panS=0;s.cd=0;s.rot=Math.random()*TAU;
  s.phi=lerp(-0.12,1.2,i/(N-1)); });    // altitude angle (low → high)

/* faint depth specks */
let stars=[];
function buildStars(){ stars=[]; for(let i=0;i<70;i++) stars.push({x:Math.random()*W,y:Math.random()*H,a:0.04+Math.random()*0.10,tw:Math.random()*TAU}); }

/* comet pool (phrase trajectories) */
const comets=[]; const COMET_MAX=60;

resize();

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

/* spherical → screen (you at centre, looking into the dome) */
function project(azim,phi){ const cp=Math.cos(phi);
  return { x:CX+Math.sin(azim)*cp*PROJ, y:CY - Math.sin(phi)*PROJ*0.92, d:Math.cos(azim)*cp }; }

let master=0;
function analyse(t,dt){
  let tot=0;
  if(ready&&playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    for(let i=0;i<N;i++){ const s=SECTIONS[i]; const tilt=1+i*0.16;
      const eL=bandAvg(freqL,s)*tilt, eR=bandAvg(freqR,s)*tilt;
      s.eL+=(eL-s.eL)*0.25; s.eR+=(eR-s.eR)*0.25;
      const e=Math.pow((s.eL+s.eR)*0.5,0.82); s.e+=(e-s.e)*0.18;
      s.pan+=((s.eR-s.eL)/(s.eR+s.eL+1e-4)-s.pan)*0.12; s.panS+=(s.pan-s.panS)*0.07;
      tot+=s.e; s.cd-=dt;
      if(s.e-s.prevE>0.05 && s.e>0.18 && s.cd<=0){ spawnComet(i); s.cd=0.18; }
      s.prevE=s.e; s.rot+=dt*(0.2+s.e*0.6);
    }
  } else {
    for(let i=0;i<N;i++){ const s=SECTIONS[i];
      const e=0.10+0.08*Math.sin(t*0.0004+i*1.0); s.e+=(e-s.e)*0.05;
      s.panS+=(0.45*Math.sin(t*0.00024+i*0.8)-s.panS)*0.03; tot+=s.e; s.rot+=dt*0.25; s.cd-=dt;
      if(Math.random()<0.004 && s.cd<=0){ spawnComet(i); s.cd=0.6; }
    }
  }
  master+=(clamp(tot/N*1.6,0,1)-master)*0.08;
}

function bodyPos(s){ const azim=s.panS*1.15; return project(azim, s.phi); }
function spawnComet(i){ if(comets.length>=COMET_MAX) comets.shift();
  const s=SECTIONS[i], p=bodyPos(s);
  const dir=Math.atan2(p.y-CY, p.x-CX);                  // streak outward, opening the space toward the sound
  const spd=MIN*(0.18+Math.random()*0.22);
  comets.push({ x:p.x, y:p.y, vx:Math.cos(dir)*spd+(Math.random()-0.5)*40, vy:Math.sin(dir)*spd+(Math.random()-0.5)*40,
    col:s.rgb, life:1, size:2+s.e*5 });
}

/* ---------------- trails: comets + bodies paint here; it fades slowly ---------------- */
function paintGlow(ctx,x,y,r,col,a){ const gr=ctx.createRadialGradient(x,y,0,x,y,r);
  gr.addColorStop(0,rgba(col,a)); gr.addColorStop(1,rgba(col,0)); ctx.fillStyle=gr;
  ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); }
function updateTrails(dt){
  tg.globalCompositeOperation='source-over';
  tg.fillStyle='rgba(0,0,0,0.018)'; tg.fillRect(0,0,W,H);     // slow fade → corridors linger ~10-20s
  tg.globalCompositeOperation='lighter';
  for(let i=comets.length-1;i>=0;i--){ const c=comets[i];
    c.life-=dt*0.22; if(c.life<=0||c.x<-60||c.x>W+60||c.y<-60||c.y>H+60){ comets.splice(i,1); continue; }
    c.vx*=0.985; c.vy*=0.985; c.x+=c.vx*dt; c.y+=c.vy*dt;
    paintGlow(tg, c.x, c.y, c.size*(0.8+ (1-c.life)*1.2), c.col, 0.10*c.life);
  }
  for(let i=0;i<N;i++){ const s=SECTIONS[i]; if(s.e<0.04) continue; const p=bodyPos(s); if(p.d<=0) continue;
    paintGlow(tg, p.x, p.y, (10+s.e*40)*(0.6+0.4*p.d), s.rgb, 0.04*s.e); }
  tg.globalCompositeOperation='source-over';
}

/* ---------------- crystalline body ---------------- */
function drawCrystal(x,y,r,col,a,rot){
  g.save(); g.translate(x,y); g.rotate(rot); g.globalCompositeOperation='lighter';
  const gr=g.createRadialGradient(0,0,0,0,0,r*2.6);
  gr.addColorStop(0,rgba(col,a*0.45)); gr.addColorStop(1,rgba(col,0));
  g.fillStyle=gr; g.beginPath(); g.arc(0,0,r*2.6,0,TAU); g.fill();
  for(let k=0;k<3;k++){ g.rotate(TAU/3);
    g.beginPath(); g.moveTo(0,-r*1.5); g.lineTo(r*0.52,0); g.lineTo(0,r*1.5); g.lineTo(-r*0.52,0); g.closePath();
    g.fillStyle=rgba(col,a*0.16); g.fill();
    g.strokeStyle=rgba([255,250,240],a*0.30); g.lineWidth=0.8; g.stroke(); }
  g.fillStyle=rgba([255,251,244],a*0.85); g.beginPath(); g.arc(0,0,r*0.32,0,TAU); g.fill();
  g.restore(); g.globalCompositeOperation='source-over';
}

function drawBg(t){
  const bg=g.createRadialGradient(CX,CY,0,CX,CY,MIN*1.0);
  bg.addColorStop(0,'#0a0a18'); bg.addColorStop(0.6,'#06060e'); bg.addColorStop(1,'#030308');
  g.fillStyle=bg; g.fillRect(0,0,W,H);
  g.globalCompositeOperation='lighter';
  for(const st of stars){ st.tw+=0.01; g.globalAlpha=st.a*(0.5+0.5*Math.sin(st.tw));
    g.fillStyle='#cfd6ff'; g.fillRect(st.x,st.y,1.2,1.2); }
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}
function drawBloom(){
  bctx.setTransform(1,0,0,1,0,0); bctx.clearRect(0,0,bw,bh); bctx.imageSmoothingEnabled=true;
  bctx.drawImage(cv,0,0,bw,bh);
  g.globalCompositeOperation='lighter'; g.imageSmoothingEnabled=true;
  g.globalAlpha=0.38; g.drawImage(bloom,0,0,W,H);
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
  analyse(t,dt); updateTrails(dt);
  drawBg(t);
  // the lingering trajectories (the composition, drawn 1:1 from the trail buffer)
  g.globalCompositeOperation='lighter'; g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.drawImage(trail,0,0);
  g.setTransform(DPR,0,0,DPR,0,0); g.globalCompositeOperation='source-over';
  // crisp crystalline bodies on top
  for(let i=0;i<N;i++){ const s=SECTIONS[i], p=bodyPos(s); if(p.d<=0) continue;
    const r=(9+s.e*46)*(0.55+0.45*p.d); const a=clamp((0.18+s.e*0.9)*(0.4+0.6*p.d),0,1);
    drawCrystal(p.x,p.y,r,s.rgb,a,s.rot); }
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
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
