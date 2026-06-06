import './style.css';
"use strict";
/* =========================================================================
   OPUS — Aurora of the Spectrum
   Pitch becomes flowing waves: a stack of luminous bands from low (bottom) to
   high (top). Each band swells and brightens with that pitch's energy, and —
   the key idea — it glows and flows toward the side the sound is actually
   coming from (its stereo direction). Calm, flowing, beautiful.
   Vanilla JS · Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU = Math.PI*2;
const lerp  = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rgba  = (c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

let W,H,DPR,CX,MIN,yTop,yBot;
let bloom,bctx,bw,bh;   // offscreen for a cheap, pretty bloom pass
const QUAL=[
  {dpr:1.00, bands:20, motes:0},    // low
  {dpr:1.35, bands:28, motes:40},   // medium
  {dpr:1.60, bands:38, motes:70},   // high
];
let qTier = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 1 : 2;
let autoQ = true;

/* pitch → colour (low warm → high cool) */
const PAL=[ [255,104, 76],[255,150, 80],[246,212,130],[150,224,176],[120,198,255],[176,150,255] ];
function pitchColor(t){ t=clamp(t,0,1)*(PAL.length-1); const i=Math.floor(t), f=t-i, a=PAL[i], b=PAL[Math.min(PAL.length-1,i+1)];
  return [lerp(a[0],b[0],f),lerp(a[1],b[1],f),lerp(a[2],b[2],f)]; }

/* ---------------- pitch bands (log-spaced) ---------------- */
const F_LO=42, F_HI=12000;
let bands=[], K=0;
function buildBands(){
  K=QUAL[qTier].bands; bands=new Array(K);
  for(let i=0;i<K;i++) bands[i]={ e:0,eL:0,eR:0,pan:0, phase:Math.random()*TAU, col:pitchColor(i/(K-1)), i0:0,i1:0 };
  if(ready) assignBins();
}
function assignBins(){
  for(let i=0;i<K;i++){ const f0=F_LO*Math.pow(F_HI/F_LO, i/K), f1=F_LO*Math.pow(F_HI/F_LO, (i+1)/K);
    bands[i].i0=Math.max(1,Math.round(f0/binHz)); bands[i].i1=Math.max(bands[i].i0,Math.round(f1/binHz)); }
}

function resize(){
  DPR = Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W*DPR); cv.height = Math.floor(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; MIN=Math.min(W,H); yTop=H*0.16; yBot=H*0.86;
  bw=Math.max(1,Math.floor(W*DPR/4)); bh=Math.max(1,Math.floor(H*DPR/4));
  if(!bloom){ bloom=document.createElement('canvas'); bctx=bloom.getContext('2d'); }
  bloom.width=bw; bloom.height=bh;
  g.fillStyle='#06070e'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);

/* ---------------- drifting motes (carried in the flow) ---------------- */
const moteSpr=(function(){ const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d');
  const gr=x.createRadialGradient(16,16,0,16,16,16); gr.addColorStop(0,'rgba(255,248,232,0.9)'); gr.addColorStop(1,'rgba(255,248,232,0)');
  x.fillStyle=gr; x.fillRect(0,0,32,32); return c; })();
let motes=[];
function initMotes(){ const n=QUAL[qTier].motes; motes=new Array(n); for(let i=0;i<n;i++) motes[i]=newMote(true); }
function newMote(seed){ const b=(Math.random()*K)|0; return { x:Math.random()*W, y:lerp(yBot,yTop,b/(K-1))+(Math.random()-0.5)*20, band:b, life:seed?Math.random():1, sz:0.6+Math.random()*1.4 }; }

buildBands(); resize(); initMotes();

/* ---------------- audio ---------------- */
let actx, anL, anR, freqL, freqR, binHz, playing=false, ready=false;
function buildGraph(){
  if(actx) return;
  actx = new (window.AudioContext||window.webkitAudioContext)();
  const src = actx.createMediaElementSource(audio);
  const sp  = actx.createChannelSplitter(2);
  anL = actx.createAnalyser(); anR = actx.createAnalyser();
  anL.fftSize = 4096; anR.fftSize = 4096;
  anL.smoothingTimeConstant = 0.82; anR.smoothingTimeConstant = 0.82;
  freqL = new Uint8Array(anL.frequencyBinCount);
  freqR = new Uint8Array(anR.frequencyBinCount);
  binHz = actx.sampleRate / anL.fftSize;
  src.connect(sp); sp.connect(anL,0); sp.connect(anR,1);
  src.connect(actx.destination);
  assignBins(); ready=true;
}
function bandAvg(arr,b){ let s=0,n=0,hi=Math.min(b.i1,arr.length-1); for(let i=b.i0;i<=hi;i++){s+=arr[i];n++;} return n?s/n/255:0; }

let master=0, mPan=0, mPanS=0;
function analyse(t,dt){
  if(ready && playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    let tot=0, wpan=0;
    for(let i=0;i<K;i++){ const b=bands[i]; const tilt=1+ (i/K)*1.3;
      const eL=bandAvg(freqL,b)*tilt, eR=bandAvg(freqR,b)*tilt;
      b.eL += (eL-b.eL)*0.3; b.eR += (eR-b.eR)*0.3;
      const e=Math.pow((b.eL+b.eR)*0.5,0.8); b.e += (e-b.e)*0.25;
      b.pan += ((b.eR-b.eL)/(b.eR+b.eL+1e-4) - b.pan)*0.14;
      tot+=b.e; wpan+=b.e*b.pan;
      b.phase += dt*(0.5+b.e*2.2)*(b.pan>=0?1:-1);              // flow toward its direction
    }
    master += (clamp(tot/K*2.0,0,1)-master)*0.1;
    mPan = tot>1e-3? clamp(wpan/tot,-1,1):0;
  } else {
    for(let i=0;i<K;i++){ const b=bands[i]; const u=i/(K-1);
      const e=0.05+0.06*(0.5+0.5*Math.sin(t*0.0005+u*6));
      b.e += (e-b.e)*0.05;
      b.pan += (0.6*Math.sin(t*0.0003+u*3)-b.pan)*0.03;
      b.phase += dt*(0.4+b.e*1.5)*(b.pan>=0?1:-1);
    }
    master += (0.16-master)*0.04; mPan=0.4*Math.sin(t*0.00022);
  }
  mPanS += (mPan-mPanS)*0.06;
}

/* ---------------- draw ---------------- */
function drawBg(){
  const bg=g.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#0a0816'); bg.addColorStop(0.55,'#080711'); bg.addColorStop(1,'#05060c');
  g.fillStyle=bg; g.fillRect(0,0,W,H);
  // faint breath of colour from the centre of energy
  const gx=CX+mPanS*W*0.32;
  const ga=g.createRadialGradient(gx,H*0.5,0,gx,H*0.5,MIN*0.9);
  ga.addColorStop(0, rgba([60,52,110], 0.10+master*0.10)); ga.addColorStop(1,'rgba(60,52,110,0)');
  g.fillStyle=ga; g.fillRect(0,0,W,H);
}
const STEP=()=>Math.max(6, W/150);
function drawWaves(){
  g.globalCompositeOperation='lighter'; g.lineJoin='round'; g.lineCap='round';
  const step=STEP();
  for(let i=0;i<K;i++){ const b=bands[i];
    const yb=lerp(yBot,yTop,i/(K-1));
    const xdir=CX + b.pan*W*0.42;                          // where this pitch sits, by direction
    const envW=lerp(W*0.55, W*0.16, Math.abs(b.pan));      // tighter when hard-panned
    const amp=3 + b.e*(H*0.05);
    const a=clamp(0.12+b.e*0.7,0,0.85);
    const kx=0.010 + i*0.0006;
    // brightness fades away from the sound's direction
    const lg=g.createLinearGradient(xdir-envW,0,xdir+envW,0);
    lg.addColorStop(0, rgba(b.col,0)); lg.addColorStop(0.5, rgba(b.col,a)); lg.addColorStop(1, rgba(b.col,0));
    const path=()=>{ g.beginPath();
      for(let x=-20;x<=W+20;x+=step){ const env=Math.exp(-((x-xdir)/envW)*((x-xdir)/envW));
        const y=yb - (Math.sin(x*kx+b.phase)*0.7 + Math.sin(x*kx*0.5 - b.phase*0.6)*0.3)*amp*env;
        x===-20? g.moveTo(x,y) : g.lineTo(x,y); } };
    // soft glow pass + bright core
    g.strokeStyle=lg; g.lineWidth=5+b.e*12; g.globalAlpha=0.5; path(); g.stroke();
    g.globalAlpha=1; g.lineWidth=1.4+b.e*2.4; path(); g.stroke();
  }
  g.globalCompositeOperation='source-over';
}
function drawMotes(dt){
  if(!motes.length) return;
  g.globalCompositeOperation='lighter';
  for(const m of motes){ const b=bands[m.band]||bands[0];
    m.life-=dt*0.25; if(m.life<=0){ Object.assign(m,newMote(false)); continue; }
    m.x += (40 + b.e*120)*dt*(b.pan>=0?1:-1);             // drift in the flow's direction
    if(m.x<-20||m.x>W+20){ Object.assign(m,newMote(false)); continue; }
    const yb=lerp(yBot,yTop,m.band/(K-1));
    const y=yb - Math.sin(m.x*0.01+b.phase)*b.e*H*0.04;
    const al=clamp(m.life,0,1)*(0.10+b.e*0.4), r=m.sz*(1.6+b.e*3);
    g.globalAlpha=al; g.drawImage(moteSpr, m.x-r, y-r, r*2, r*2);
  }
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}
function drawBloom(){
  // downscale the lit scene, then add it back blurred-by-upscale → soft dreamy glow
  bctx.setTransform(1,0,0,1,0,0); bctx.clearRect(0,0,bw,bh);
  bctx.imageSmoothingEnabled=true; bctx.drawImage(cv, 0,0, bw,bh);
  g.globalCompositeOperation='lighter'; g.imageSmoothingEnabled=true;
  g.globalAlpha=0.55; g.drawImage(bloom, 0,0, W,H);
  g.globalAlpha=0.30; g.drawImage(bloom, 0,0, W,H);
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}
function drawHints(){
  g.globalCompositeOperation='source-over';
  g.font="11px 'Cinzel', serif"; g.textBaseline='middle';
  g.fillStyle='rgba(180,170,210,0.28)';
  g.textAlign='left';  g.fillText('LEFT',  18, H*0.5);
  g.textAlign='right'; g.fillText('RIGHT', W-18, H*0.5);
  g.save(); g.translate(15,H*0.5); g.rotate(-Math.PI/2);
  g.textAlign='center'; g.fillStyle='rgba(180,170,210,0.22)'; g.fillText('LOW   ·   PITCH   ·   HIGH',0,-W+33);
  g.restore();
}

/* ---------------- main loop ---------------- */
let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt = _pt ? Math.min((t-_pt)/1000, 0.05) : 0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ && fps<42 && qTier>0){ qTier--; buildBands(); resize(); initMotes(); } } }
  _lt=t;

  analyse(t,dt);
  drawBg();
  drawWaves();
  drawMotes(dt);
  drawBloom();
  drawHints();
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
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; buildBands(); resize(); initMotes(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
