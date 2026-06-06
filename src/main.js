import './style.css';
"use strict";
/* =========================================================================
   OPUS — a mesmerising visualisation of classical music
   curl-flow light field + living morphing core, driven by Web Audio
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');

let W,H,DPR,CX,CY,MINSIDE;
/* adaptive quality — auto-tunes pixel ratio + particle count to stay smooth on any laptop */
const QUAL=[
  {p:0.42, dpr:1.00},  // low
  {p:0.70, dpr:1.30},  // medium
  {p:1.00, dpr:1.60}   // high
];
let qTier = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 1 : 2;
let autoQ = true;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W*DPR); cv.height = Math.floor(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H/2; MINSIDE=Math.min(W,H);
  // prime backdrop so first frames aren't black
  g.fillStyle='#070403'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);
resize();

/* ---------------- audio analysis ---------------- */
const SECTIONS = [
  { name:'Contrabass',  lo:24,   hi:95,    rgb:[255,96,42],  e:0,s:0 },
  { name:'Violoncello', lo:95,   hi:260,   rgb:[255,140,46],  e:0,s:0 },
  { name:'Viola',       lo:260,  hi:620,   rgb:[255,196,86],  e:0,s:0 },
  { name:'Violino',     lo:620,  hi:1600,  rgb:[255,224,140],e:0,s:0 },
  { name:'Flauto',      lo:1600, hi:4200,  rgb:[246,239,200],e:0,s:0 },
  { name:'Ottavino',    lo:4200, hi:13000, rgb:[196,224,255],e:0,s:0 },
];
const leg = document.getElementById('leg'), legSw=[];
SECTIONS.forEach(s=>{
  const r=document.createElement('div');r.className='lr';
  const sw=document.createElement('span');sw.className='sw';
  const col=`rgb(${s.rgb.join(',')})`; sw.style.background=col; sw.style.color=col;
  const n=document.createElement('span');n.textContent=s.name;
  r.append(sw,n); leg.append(r); legSw.push(sw);
});
// pre-rendered glow sprites (bloom baked in) — replaces the costly per-particle shadowBlur
SECTIONS.forEach(s=>{
  const cn=document.createElement('canvas'); cn.width=cn.height=64; const x=cn.getContext('2d');
  const gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,0.95)');
  gr.addColorStop(0.25,`rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},0.85)`);
  gr.addColorStop(1,`rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},0)`);
  x.fillStyle=gr; x.fillRect(0,0,64,64); s.spr=cn;
});

let actx, analyser, aL, aR, freq, tL, tR, binHz, playing=false, ready=false;
function buildGraph(){
  if(actx) return;
  actx = new (window.AudioContext||window.webkitAudioContext)();
  const src = actx.createMediaElementSource(audio);
  analyser = actx.createAnalyser();
  analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.8;
  freq = new Uint8Array(analyser.frequencyBinCount);
  binHz = actx.sampleRate / analyser.fftSize;
  const sp = actx.createChannelSplitter(2);
  aL = actx.createAnalyser(); aL.fftSize=512;
  aR = actx.createAnalyser(); aR.fftSize=512;
  tL = new Uint8Array(aL.fftSize); tR = new Uint8Array(aR.fftSize);
  src.connect(analyser); src.connect(sp);
  sp.connect(aL,0); sp.connect(aR,1);
  src.connect(actx.destination);
  ready=true;
}

// energies (real when playing, gentle ambient otherwise so it's always alive)
let bass=0,mid=0,high=0,amp=0, ampS=0, pan=0,panS=0, widthS=0;
let flux=0, onset=0, shock=0, hueShift=0;
function analyse(t){
  if(ready && playing){
    analyser.getByteFrequencyData(freq);
    for(const s of SECTIONS){
      let a=Math.max(1,(s.lo/binHz)|0), b=Math.min(freq.length-1,(s.hi/binHz)|0), sum=0,n=0;
      for(let i=a;i<=b;i++){sum+=freq[i];n++;}
      let v=n?Math.pow(sum/n/255,0.8):0; s.e=v; s.s+=(v-s.s)*0.2;
    }
    aL.getByteTimeDomainData(tL); aR.getByteTimeDomainData(tR);
    let l=0,r=0;
    for(let i=0;i<tL.length;i++){const dl=(tL[i]-128)/128,dr=(tR[i]-128)/128;l+=dl*dl;r+=dr*dr;}
    l=Math.sqrt(l/tL.length); r=Math.sqrt(r/tR.length);
    pan=(r-l)/(l+r+1e-5);
    widthS += (Math.min(1,Math.abs(l-r)*2.2+(l+r)*0.5)-widthS)*0.1;
  } else {
    // ambient breathing
    for(let i=0;i<SECTIONS.length;i++){
      const v=0.10+0.09*Math.sin(t*0.0005 + i*1.3)+0.05*Math.sin(t*0.0013+i);
      SECTIONS[i].e=Math.max(0,v); SECTIONS[i].s+=(SECTIONS[i].e-SECTIONS[i].s)*0.1;
    }
    pan=Math.sin(t*0.0003)*0.4; widthS+= (0.25-widthS)*0.05;
  }
  bass=(SECTIONS[0].s+SECTIONS[1].s)/2;
  mid =(SECTIONS[2].s+SECTIONS[3].s)/2;
  high=(SECTIONS[4].s+SECTIONS[5].s)/2;
  amp =(bass+mid+high)/3;
  ampS += (amp-ampS)*0.12;
  panS += (pan-panS)*0.06;
  // onset / shock
  const fl = mid+high*1.3;
  const d = fl-flux; flux=fl;
  if(d>0.05){ onset=Math.min(1,onset+d*3); shock=Math.min(1,shock+d*2.5); }
  onset*=0.9; shock*=0.92;
  hueShift += 0.0006 + high*0.004;
}

/* ---------------- flow field ---------------- */
// cheap layered-sine "curl" flow — organic swirls, no libs
function flowAngle(x,y,t){
  const z = 0.0016 + bass*0.0012;             // music zooms the field
  const rot = t*0.00006 + mid*0.0008;
  const a = Math.sin(x*z + t*0.0003)
          + Math.sin(y*z*1.2 - t*0.00037)
          + Math.sin((x+y)*z*0.6 + t*0.00052 + rot*40)
          + Math.sin(Math.hypot(x-CX,y-CY)*z*0.5 - t*0.0004);
  return a*Math.PI + rot*6;
}

/* ---------------- particles ---------------- */
let P=[];
function baseN(){ return Math.min(3400, Math.floor(W*H/520)); }
function targetN(){ return Math.max(300, Math.floor(baseN()*QUAL[qTier].p)); }
function initParticles(){
  const N = targetN();
  P = new Array(N);
  for(let i=0;i<N;i++) P[i]=newP(true);
}
function newP(scatter){
  const fromCenter = !scatter && Math.random()<0.55;
  let x,y;
  if(fromCenter){ const a=Math.random()*Math.PI*2, r=Math.random()*MINSIDE*0.06;
    x=CX+Math.cos(a)*r; y=CY+Math.sin(a)*r; }
  else { x=Math.random()*W; y=Math.random()*H; }
  const band = pickBand();
  return { x,y, vx:0,vy:0, life:Math.random()*0.5+0.5, age:Math.random(),
    band, size:Math.random()*1.6+0.4, spd:Math.random()*0.6+0.7 };
}
function pickBand(){
  // bias toward whichever voices are loud right now
  let w=[], tot=0;
  for(let i=0;i<SECTIONS.length;i++){ const v=0.05+SECTIONS[i].s; w[i]=v; tot+=v; }
  let r=Math.random()*tot;
  for(let i=0;i<w.length;i++){ r-=w[i]; if(r<=0) return i; }
  return 0;
}
initParticles();

/* ---------------- the living core ---------------- */
function drawCore(t){
  const N=128;
  const baseR = MINSIDE*0.085*(1+ampS*0.5);
  const reach = MINSIDE*0.16;
  const cx = CX + panS*W*0.04;
  const cy = CY;
  const rot = t*0.00012;

  // soft halo
  const halo = g.createRadialGradient(cx,cy,0,cx,cy,baseR*4+reach);
  const hb = 0.10+ampS*0.35;
  halo.addColorStop(0,`rgba(255,238,196,${hb})`);
  halo.addColorStop(0.4,`rgba(230,170,80,${hb*0.5})`);
  halo.addColorStop(1,'rgba(180,110,40,0)');
  g.save(); g.globalCompositeOperation='lighter';
  g.fillStyle=halo; g.beginPath(); g.arc(cx,cy,baseR*4+reach,0,Math.PI*2); g.fill();
  g.restore();

  // morphing mandala — 3 chromatic layers for bloom
  const layers=[
    {scale:1.06, hue:[255,150,70], a:0.16, off:0.0},
    {scale:1.0,  hue:[255,210,120],a:0.5,  off:0.0},
    {scale:0.94, hue:[210,225,255],a:0.2,  off:Math.PI/N},
  ];
  for(const Lr of layers){
    g.save();
    g.translate(cx,cy); g.rotate(rot*(Lr.scale>1?1:-1)); g.globalCompositeOperation='lighter';
    g.beginPath();
    for(let i=0;i<=N;i++){
      const ang=(i/N)*Math.PI*2 + Lr.off;
      // mirror spectrum across the circle for symmetry
      const idx = Math.floor((i<=N/2? i : N-i)/(N/2) * 56) + 2;
      const mag = (ready&&playing) ? (freq[idx]||0)/255
                : 0.35+0.4*Math.sin(t*0.001+i*0.5)+0.2*SECTIONS[(i)%6].s*3;
      const r=(baseR + mag*mag*reach)*Lr.scale;
      const px=Math.cos(ang)*r, py=Math.sin(ang)*r;
      i?g.lineTo(px,py):g.moveTo(px,py);
    }
    g.closePath();
    const [hr,hg,hb2]=Lr.hue;
    const grd=g.createRadialGradient(0,0,baseR*0.2,0,0,baseR+reach);
    grd.addColorStop(0,`rgba(${hr},${hg},${hb2},${Lr.a})`);
    grd.addColorStop(1,`rgba(${hr},${hg},${hb2},0)`);
    g.fillStyle=grd; g.fill();
    g.strokeStyle=`rgba(${hr},${hg},${hb2},${Lr.a*1.4})`;
    g.lineWidth=1.2; g.shadowColor=`rgba(${hr},${hg},${hb2},0.8)`; g.shadowBlur=18; g.stroke();
    g.restore();
  }

  // radiating spikes on transients
  if(onset>0.04){
    g.save(); g.translate(cx,cy); g.globalCompositeOperation='lighter';
    const spikes=48;
    for(let i=0;i<spikes;i++){
      const ang=(i/spikes)*Math.PI*2+rot*3;
      const idx=2+((i*2)%56);
      const mag=(ready&&playing)?(freq[idx]||0)/255:0.4+0.4*Math.sin(t*0.002+i);
      const r1=baseR*1.1, r2=baseR + mag*reach*1.6*onset*3;
      g.beginPath(); g.moveTo(Math.cos(ang)*r1,Math.sin(ang)*r1);
      g.lineTo(Math.cos(ang)*r2,Math.sin(ang)*r2);
      g.strokeStyle=`rgba(255,240,200,${onset*0.7})`; g.lineWidth=1.4;
      g.shadowColor='rgba(255,220,150,0.9)'; g.shadowBlur=10; g.stroke();
    }
    g.restore();
  }

  // bright nucleus
  const nuc=g.createRadialGradient(cx,cy,0,cx,cy,baseR*0.9);
  nuc.addColorStop(0,`rgba(255,250,235,${0.7+ampS*0.3})`);
  nuc.addColorStop(0.5,`rgba(255,222,150,${0.4+ampS*0.3})`);
  nuc.addColorStop(1,'rgba(255,180,90,0)');
  g.save(); g.globalCompositeOperation='lighter';
  g.fillStyle=nuc; g.beginPath(); g.arc(cx,cy,baseR*0.9,0,Math.PI*2); g.fill();
  g.restore();
  g.shadowBlur=0;
}

/* ---------------- the main render ---------------- */
let _fa=0,_fn=0,_lt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;                  // don't burn CPU/GPU on a hidden tab
  // adaptive quality governor: if frame rate sags, step down a tier
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ && fps<42 && qTier>0){ qTier--; resize(); } } }
  _lt=t;
  // reconcile particle population toward the current quality target
  { const tn=targetN(); if(P.length>tn) P.length=tn; else for(let k=P.length;k<tn;k++) P.push(newP(true)); }
  analyse(t);

  // FADE rather than clear — this is what makes the light flow & linger
  g.globalCompositeOperation='source-over';
  g.fillStyle = `rgba(7,4,3,${0.085 + (1-ampS)*0.02})`;
  g.fillRect(0,0,W,H);

  // ---- particles ----
  g.globalCompositeOperation='lighter';
  const cx=CX+panS*W*0.04, cy=CY;
  const swirl = 1 + bass*2.2;
  const drift = panS*1.4;
  for(let i=0;i<P.length;i++){
    const p=P[i];
    const ang=flowAngle(p.x,p.y,t);
    const acc = (0.18+mid*0.5)*p.spd*swirl;
    p.vx += Math.cos(ang)*acc + drift*0.4;
    p.vy += Math.sin(ang)*acc;
    // pull / push from core on transients
    const dx=cx-p.x, dy=cy-p.y, dist=Math.hypot(dx,dy)+1e-3;
    const radial = (shock*2.6 - 0.05) * (1 - Math.min(1,dist/(MINSIDE*0.6)));
    p.vx += (dx/dist)*radial*-3 + (Math.random()-0.5)*high*1.2;
    p.vy += (dy/dist)*radial*-3 + (Math.random()-0.5)*high*1.2;
    p.vx*=0.93; p.vy*=0.93;
    p.x+=p.vx; p.y+=p.vy;
    p.age+=0.004; p.life-=0.0018+high*0.002;

    const s=SECTIONS[p.band];
    const br = 0.25 + s.s*1.6 + ampS*0.4;
    const sz = p.size*(0.7+s.s*2.2+ampS);
    const draw = sz*3.4;                       // glow radius (bloom is baked into the sprite)
    g.globalAlpha = Math.min(0.9,br)*Math.max(0,p.life);
    g.drawImage(s.spr, p.x-draw, p.y-draw, draw*2, draw*2);

    if(p.life<=0 || p.x< -40||p.x>W+40||p.y<-40||p.y>H+40) P[i]=newP(false);
  }

  g.globalAlpha=1;

  // occasional shimmer burst on strong onset
  if(onset>0.4 && P.length){
    const n=Math.min(40,(onset*40)|0);
    for(let k=0;k<n;k++) P[(Math.random()*P.length)|0]=newP(false);
  }

  drawCore(t);

  // legend pulse + UI
  for(let i=0;i<SECTIONS.length;i++){
    const lv=SECTIONS[i].s; legSw[i].style.transform=`scaleX(${1+lv*2.4})`;
    legSw[i].style.boxShadow=`0 0 ${4+lv*16}px currentColor`;
  }
}
requestAnimationFrame(frame);

/* ---------------- transport / files ---------------- */
const fileI=document.getElementById('file'), begin=document.getElementById('begin'),
      newb=document.getElementById('newb'), play=document.getElementById('play'),
      seek=document.getElementById('seek'), tm=document.getElementById('tm'),
      intro=document.getElementById('intro'), hud=document.getElementById('hud'),
      npt=document.getElementById('npt'), drop=document.getElementById('drop');

const demo=document.getElementById('demo');
begin.onclick=()=>fileI.click();
newb.onclick=()=>fileI.click();
fileI.onchange=e=>{ if(e.target.files[0]) load(e.target.files[0]); };
// bundled, openly-licensed demo so the stage is alive on first visit
if(demo) demo.onclick=()=>start('demo-vivaldi-spring.mp3', 'Vivaldi · Spring — Allegro');

function load(f){ start(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/,'')); }

function start(src, title){
  audio.src=src; npt.textContent=title;
  try{ buildGraph(); }catch(err){ console.warn('audio graph:',err); }
  if(actx && actx.state==='suspended') actx.resume();
  audio.play().then(()=>{
    playing=true; intro.classList.add('gone'); hud.classList.add('show'); play.textContent='PAUSE';
  }).catch(err=>{ console.warn('play failed',err);
    // still reveal the stage even if autoplay is blocked
    intro.classList.add('gone'); hud.classList.add('show');
  });
}
play.onclick=()=>{ if(audio.paused){audio.play();playing=true;play.textContent='PAUSE';actx&&actx.resume();}
  else {audio.pause();playing=false;play.textContent='PLAY';} };
audio.ontimeupdate=()=>{ if(audio.duration){ seek.value=(audio.currentTime/audio.duration)*1000;
  tm.textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`; } };
audio.onended=()=>{ playing=false; play.textContent='PLAY'; };
seek.oninput=()=>{ if(audio.duration) audio.currentTime=(seek.value/1000)*audio.duration; };
function fmt(s){s=Math.floor(s);return `${(s/60)|0}:${String(s%60).padStart(2,'0')}`;}

// drag & drop anywhere
addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('on');});
addEventListener('dragleave',e=>{ if(e.relatedTarget===null) drop.classList.remove('on');});
addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('on');
  const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('audio')) load(f);});

// keyboard: space = play/pause · F = fullscreen · H = hide interface · Q = cycle quality
addEventListener('keydown',e=>{
  const tag=(e.target&&e.target.tagName)||''; if(tag==='INPUT'||tag==='TEXTAREA') return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); play.click(); }
  else if(k==='f'){ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  else if(k==='h'){ hud.classList.toggle('show'); }
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); }
});
// resume the frame clock cleanly when returning to the tab
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) _lt=0; });
