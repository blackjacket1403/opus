import './style.css';
"use strict";
/* =========================================================================
   OPUS — Celestial Orchestra
   A deep-space, faintly-magical cosmos driven by classical music. The spatial
   DIRECTION OF SOUND is the engine: each orchestral voice is a luminous body
   placed by its stereo position (left↔right) and pitch (low↔high) around a
   breathing central star, trailing comet-light and aurora, while a parallax
   starfield and the "camera" lean toward wherever the sound is coming from.
   Vanilla JS · Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU = Math.PI*2;
const lerp  = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rgba  = (c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

let W,H,DPR,CX,CY,MIN,baseSpread,yTop,yBot;
/* adaptive quality — auto-tunes to stay smooth on any laptop */
const QUAL=[
  {dpr:1.00, stars:90,  embers:45},   // low
  {dpr:1.35, stars:150, embers:80},   // medium
  {dpr:1.60, stars:230, embers:130},  // high
];
let qTier = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 1 : 2;
let autoQ = true;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W*DPR); cv.height = Math.floor(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H*0.52; MIN=Math.min(W,H);
  baseSpread = Math.min(W*0.42, 660);
  yTop = H*0.20; yBot = H*0.78;            // piccolo high · contrabass low
  g.fillStyle='#05060b'; g.fillRect(0,0,W,H);
  initStars();
}
addEventListener('resize', resize);

/* ---------------- voices (low → high) ---------------- */
const SECTIONS = [
  { name:'Contrabass',  lo:24,   hi:95,    rgb:[255,120, 70] },
  { name:'Violoncello', lo:95,   hi:260,   rgb:[255,150, 80] },
  { name:'Viola',       lo:260,  hi:620,   rgb:[255,196,108] },
  { name:'Violino',     lo:620,  hi:1600,  rgb:[255,228,150] },
  { name:'Flauto',      lo:1600, hi:4200,  rgb:[200,238,210] },
  { name:'Ottavino',    lo:4200, hi:13000, rgb:[168,206,255] },
];
const N = SECTIONS.length;
SECTIONS.forEach(s=>{ s.eL=0; s.eR=0; s.e=0; s.pan=0; s.x=null; s.y=0; s.depth=1; s.trail=[]; });

/* legend (right edge) */
const leg = document.getElementById('leg'), legSw=[];
SECTIONS.forEach(s=>{
  const r=document.createElement('div'); r.className='lr';
  const sw=document.createElement('span'); sw.className='sw';
  const col=`rgb(${s.rgb.join(',')})`; sw.style.background=col; sw.style.color=col;
  const n=document.createElement('span'); n.textContent=s.name;
  r.append(sw,n); leg.append(r); legSw.push(sw);
});

/* soft glow sprite per voice + a generic gold spark (bloom baked in, restrained) */
function glow(rgb, hot){
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
  const gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0, hot?'rgba(255,252,244,0.95)':'rgba(255,247,232,0.85)');
  gr.addColorStop(0.28,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`);
  gr.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  x.fillStyle=gr; x.fillRect(0,0,64,64); return c;
}
SECTIONS.forEach(s=> s.spr=glow(s.rgb,false));
const sparkSpr = glow([255,216,150], true);

/* ---------------- starfield (parallax depth) ---------------- */
let stars=[];
function newStar(seed){ return { x:Math.random()*W, y:Math.random()*H, z:0.2+Math.random()*0.8, tw:Math.random()*TAU, sp:0.3+Math.random()*0.8 }; }
function initStars(){ const n=QUAL[qTier].stars; stars=new Array(n); for(let i=0;i<n;i++) stars[i]=newStar(true); }

/* ---------------- embers (golden magic dust spiralling the heart) ---------------- */
let embers=[];
function newEmber(){ return { ang:Math.random()*TAU, rad:MIN*(0.06+Math.random()*0.42), z:0.4+Math.random()*0.6, sp:(0.05+Math.random()*0.18)*(Math.random()<0.5?-1:1), bob:Math.random()*TAU, life:Math.random() }; }
function initEmbers(){ const n=QUAL[qTier].embers; embers=new Array(n); for(let i=0;i<n;i++) embers[i]=newEmber(); }

/* beat events: ripples + shooting stars */
const rings=[], shoots=[];

resize(); initEmbers();

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

let master=0, mPan=0, mPanS=0, widthS=0, pulse=0, flux=0, camShift=0;
function analyse(t){
  if(ready && playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    let tot=0, wpan=0, wabs=0, hi=0;
    for(let i=0;i<N;i++){ const s=SECTIONS[i]; const tilt=1+i*0.16;
      const eL=bandAvg(freqL,s)*tilt, eR=bandAvg(freqR,s)*tilt;
      s.eL += (eL-s.eL)*0.25; s.eR += (eR-s.eR)*0.25;
      const e=Math.pow((s.eL+s.eR)*0.5, 0.85);
      s.e += (e-s.e)*0.2;
      const p=(s.eR-s.eL)/(s.eR+s.eL+1e-4);
      s.pan += (p-s.pan)*0.12;
      tot+=s.e; wpan+=s.e*s.pan; wabs+=s.e*Math.abs(s.pan); if(i>=4) hi+=s.e;
    }
    master += (clamp(tot/N*1.7,0,1)-master)*0.1;
    mPan = tot>1e-3 ? clamp(wpan/tot,-1,1) : 0;
    const width = tot>1e-3 ? clamp(wabs/tot,0,1) : 0;
    widthS += (width-widthS)*0.05;
    const d=hi-flux; flux=hi;
    if(d>0.05){ pulse=Math.min(1,pulse+d*2.4); onBeat(d); } pulse*=0.9;
  } else {
    for(let i=0;i<N;i++){ const s=SECTIONS[i];
      const e=0.10+0.07*Math.sin(t*0.0004+i*1.1);
      s.e += (e-s.e)*0.06;
      const p=0.55*Math.sin(t*0.00025+i*0.9);
      s.pan += (p-s.pan)*0.04;
    }
    master += (0.18-master)*0.04; mPan = 0.4*Math.sin(t*0.00022); widthS += (0.5-widthS)*0.02; pulse*=0.92;
  }
  mPanS += (mPan-mPanS)*0.06;
  camShift += (mPanS*70 - camShift)*0.05;
}
function onBeat(d){
  if(rings.length<8) rings.push({r:MIN*0.05, a:clamp(d*1.4,0.15,0.6)});
  if(d>0.12 && shoots.length<4 && Math.random()<0.5){
    const fromR = mPanS>=0;                       // enter from the sounding side
    shoots.push({ x: fromR? -40 : W+40, y: H*(0.12+Math.random()*0.4),
                  vx:(fromR?1:-1)*(W*0.5+Math.random()*W*0.3), vy:(Math.random()*0.3+0.1)*H*0.2, life:1 });
  }
}

/* ---------------- layout: place each voice by direction + pitch + depth ------- */
function layout(){
  const spread = baseSpread*(0.6+0.4*widthS);
  for(let i=0;i<N;i++){ const s=SECTIONS[i];
    const tx = CX + s.pan*spread;
    const ty = lerp(yBot, yTop, i/(N-1)) + Math.abs(s.pan)*H*0.04;   // edges dip → dome
    const td = 1 - Math.abs(s.pan)*0.28;                            // edges farther → smaller
    if(s.x===null){ s.x=tx; s.y=ty; }
    s.x += (tx-s.x)*0.07; s.y += (ty-s.y)*0.10; s.depth += (td-s.depth)*0.08;
    s.trail.push(s.x, s.y); if(s.trail.length>30) s.trail.splice(0,2);
  }
}

/* ---------------- background: nebula + parallax stars ---------------- */
const NEB=[ {c:[70,40,110], px:-0.22, py:-0.14, ph:0.0, sp:0.00007},
            {c:[150,70,40], px: 0.26, py: 0.10, ph:2.1, sp:0.00009},
            {c:[30,80,110], px: 0.05, py:-0.22, ph:4.0, sp:0.00006} ];
function drawNebula(t){
  g.globalCompositeOperation='lighter';
  const domHue = SECTIONS.reduce((m,s,i)=> s.e>SECTIONS[m].e? i:m, 0);
  for(const b of NEB){
    const x=CX + (b.px*W) + Math.sin(t*b.sp+b.ph)*W*0.05 - camShift*0.4;
    const y=CY + (b.py*H) + Math.cos(t*b.sp*1.3+b.ph)*H*0.04;
    const R=MIN*(0.55+0.1*Math.sin(t*b.sp*2+b.ph));
    const col = b.ph<1 ? b.c : [ (b.c[0]+SECTIONS[domHue].rgb[0])/2, (b.c[1]+SECTIONS[domHue].rgb[1])/2, (b.c[2]+SECTIONS[domHue].rgb[2])/2 ];
    const gr=g.createRadialGradient(x,y,0,x,y,R);
    gr.addColorStop(0, rgba(col, 0.05+master*0.05));
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle=gr; g.beginPath(); g.arc(x,y,R,0,TAU); g.fill();
  }
  g.globalCompositeOperation='source-over';
}
function drawStars(dt){
  g.globalCompositeOperation='lighter';
  for(const s of stars){
    const dx=s.x-CX, dy=s.y-CY;
    s.x += dx*0.03*dt*s.z; s.y += dy*0.03*dt*s.z;     // gentle warp outward (space-travel)
    if(s.x<-30||s.x>W+30||s.y<-30||s.y>H+30){ Object.assign(s,newStar()); s.x=CX+(Math.random()-0.5)*40; s.y=CY+(Math.random()-0.5)*40; }
    s.tw += dt*s.sp*3;
    const px=s.x - camShift*s.z*1.4;
    g.globalAlpha=(0.2+0.5*s.z)*(0.55+0.45*Math.sin(s.tw));
    g.fillStyle='#fff7e6';
    g.beginPath(); g.arc(px, s.y, s.z*1.5, 0, TAU); g.fill();
  }
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}

/* ---------------- aurora curtains rising from each voice ---------------- */
function drawAuroras(t){
  g.globalCompositeOperation='lighter';
  for(let i=0;i<N;i++){ const s=SECTIONS[i]; if(s.e<0.03) continue;
    const h=lerp(H*0.10,H*0.34,i/(N-1)) * (0.5+s.e*1.2);
    const w=18+s.e*46, sway=Math.sin(t*0.0006+i)*18 + mPanS*26;
    const top=s.y-h;
    const grd=g.createLinearGradient(0,s.y,0,top);
    grd.addColorStop(0, rgba(s.rgb, 0.0));
    grd.addColorStop(0.5, rgba(s.rgb, 0.10+s.e*0.18));
    grd.addColorStop(1, rgba(s.rgb, 0.0));
    g.fillStyle=grd;
    g.beginPath();
    g.moveTo(s.x-w, s.y);
    g.quadraticCurveTo(s.x-w*0.5+sway, (s.y+top)/2, s.x+sway*1.2, top);
    g.quadraticCurveTo(s.x+w*0.5+sway, (s.y+top)/2, s.x+w, s.y);
    g.closePath(); g.fill();
  }
  g.globalCompositeOperation='source-over';
}

/* ---------------- central heart-star ---------------- */
function drawHeart(t){
  const r=MIN*(0.045+master*0.05)*(1+pulse*0.08);
  g.globalCompositeOperation='lighter';
  // corona
  const cor=g.createRadialGradient(CX,CY,0,CX,CY,r*6);
  cor.addColorStop(0, rgba([255,240,205], 0.22+master*0.28));
  cor.addColorStop(0.4, rgba([235,175,90], 0.07));
  cor.addColorStop(1, rgba([235,175,90], 0));
  g.fillStyle=cor; g.beginPath(); g.arc(CX,CY,r*6,0,TAU); g.fill();
  // directional flare toward the sounding side
  const fx=CX+mPanS*MIN*0.16;
  const fl=g.createRadialGradient(fx,CY,0,fx,CY,MIN*(0.32+Math.abs(mPanS)*0.3));
  fl.addColorStop(0, rgba([255,222,150], 0.05+master*0.08));
  fl.addColorStop(1, 'rgba(255,222,150,0)');
  g.fillStyle=fl; g.beginPath(); g.arc(fx,CY,MIN*(0.32+Math.abs(mPanS)*0.3),0,TAU); g.fill();
  // slow rotating rays
  g.save(); g.translate(CX,CY); g.rotate(t*0.00004);
  for(let i=0;i<12;i++){ g.rotate(TAU/12);
    const rg=g.createLinearGradient(0,0,0,-r*5);
    rg.addColorStop(0, rgba([255,230,180], 0.06+master*0.08)); rg.addColorStop(1,'rgba(255,230,180,0)');
    g.fillStyle=rg; g.beginPath(); g.moveTo(-r*0.18,0); g.lineTo(r*0.18,0); g.lineTo(0,-r*5); g.closePath(); g.fill();
  }
  g.restore();
  // core
  const core=g.createRadialGradient(CX,CY,0,CX,CY,r);
  core.addColorStop(0,'rgba(255,253,247,0.95)');
  core.addColorStop(0.5, rgba([255,226,155],0.6));
  core.addColorStop(1,'rgba(255,200,110,0)');
  g.fillStyle=core; g.beginPath(); g.arc(CX,CY,r,0,TAU); g.fill();
  g.globalCompositeOperation='source-over';
}

/* ---------------- voices: comet trails + luminous bodies ---------------- */
function drawVoices(){
  // trails (additive, thin, fading)
  g.globalCompositeOperation='lighter'; g.lineCap='round';
  for(let i=0;i<N;i++){ const s=SECTIONS[i], tr=s.trail, n=tr.length/2|0; if(n<2) continue;
    for(let k=1;k<n;k++){ const a=(k/n)*(0.10+s.e*0.5);
      g.strokeStyle=rgba(s.rgb,a); g.lineWidth=(0.6+s.e*3)*(k/n);
      g.beginPath(); g.moveTo(tr[(k-1)*2],tr[(k-1)*2+1]); g.lineTo(tr[k*2],tr[k*2+1]); g.stroke(); }
  }
  // bodies
  for(let i=0;i<N;i++){ const s=SECTIONS[i];
    const r=(11+s.e*60)*s.depth;
    g.globalCompositeOperation='source-over';
    g.globalAlpha=clamp(0.28+s.e*1.1,0,0.92);
    g.drawImage(s.spr, s.x-r, s.y-r, r*2, r*2);
    g.globalAlpha=1;
    if(s.e>0.2){ g.globalCompositeOperation='lighter'; g.globalAlpha=clamp(s.e-0.2,0,0.5);
      const cr=r*0.4; g.drawImage(s.spr, s.x-cr, s.y-cr, cr*2, cr*2); g.globalAlpha=1; }
  }
  g.globalCompositeOperation='source-over';
}

/* ---------------- embers + beat ripples + shooting stars ---------------- */
function drawEmbers(t,dt){
  g.globalCompositeOperation='lighter';
  for(const e of embers){
    e.ang += e.sp*dt*(0.6+master); e.bob += dt*1.2;
    e.life -= dt*0.05; if(e.life<=0) Object.assign(e,newEmber());
    const rad=e.rad + Math.sin(e.bob)*8;
    const x=CX+Math.cos(e.ang)*rad - camShift*e.z*0.8 + mPanS*22*e.z;
    const y=CY+Math.sin(e.ang)*rad*0.62;
    const a=clamp(e.life,0,1)*(0.10+master*0.22)*e.z;
    const sz=(1.4+master*3)*e.z;
    g.globalAlpha=a; g.drawImage(sparkSpr, x-sz, y-sz, sz*2, sz*2);
  }
  g.globalAlpha=1;
  // ripples
  for(let i=rings.length-1;i>=0;i--){ const rp=rings[i]; rp.r+=dt*MIN*0.5; rp.a-=dt*0.55; if(rp.a<=0){rings.splice(i,1);continue;}
    g.strokeStyle=rgba([255,230,180],Math.max(0,rp.a)*0.5); g.lineWidth=1.4;
    g.beginPath(); g.arc(CX,CY,rp.r,0,TAU); g.stroke(); }
  // shooting stars
  for(let i=shoots.length-1;i>=0;i--){ const sh=shoots[i]; sh.x+=sh.vx*dt; sh.y+=sh.vy*dt; sh.life-=dt*0.7;
    if(sh.life<=0||sh.x< -60||sh.x>W+60){ shoots.splice(i,1); continue; }
    const tx=sh.x-sh.vx*0.06, ty=sh.y-sh.vy*0.06;
    const gr=g.createLinearGradient(tx,ty,sh.x,sh.y);
    gr.addColorStop(0,'rgba(255,240,200,0)'); gr.addColorStop(1,rgba([255,244,214],Math.max(0,sh.life)*0.8));
    g.strokeStyle=gr; g.lineWidth=2; g.beginPath(); g.moveTo(tx,ty); g.lineTo(sh.x,sh.y); g.stroke(); }
  g.globalCompositeOperation='source-over';
}

/* ---------------- subtle direction read (L … R) ---------------- */
function drawCompass(){
  g.globalCompositeOperation='source-over';
  const by=Math.max(54,H*0.085), half=Math.min(W*0.34,520);
  g.strokeStyle='rgba(202,162,58,0.14)'; g.lineWidth=1;
  g.beginPath(); g.moveTo(CX-half,by); g.lineTo(CX+half,by); g.stroke();
  g.fillStyle='rgba(217,178,74,0.5)'; g.font="11px 'Cinzel', serif"; g.textBaseline='middle';
  g.textAlign='right'; g.fillText('L', CX-half-14, by);
  g.textAlign='left';  g.fillText('R', CX+half+14, by); g.textAlign='center';
  const dx=CX+mPanS*half;
  g.globalCompositeOperation='lighter';
  const dot=g.createRadialGradient(dx,by,0,dx,by,9+master*14);
  dot.addColorStop(0,`rgba(255,240,200,${0.6+master*0.3})`); dot.addColorStop(1,'rgba(255,240,200,0)');
  g.fillStyle=dot; g.beginPath(); g.arc(dx,by,9+master*14,0,TAU); g.fill();
  g.globalCompositeOperation='source-over';
}

/* ---------------- main loop ---------------- */
let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt = _pt ? Math.min((t-_pt)/1000, 0.05) : 0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ && fps<42 && qTier>0){ qTier--; resize(); initEmbers(); } } }
  _lt=t;

  analyse(t); layout();

  // controlled trail fade (source-over — no additive runaway)
  g.globalCompositeOperation='source-over';
  g.fillStyle='rgba(5,6,11,0.30)'; g.fillRect(0,0,W,H);

  drawNebula(t);
  drawStars(dt);
  drawAuroras(t);
  drawHeart(t);
  drawVoices();
  drawEmbers(t,dt);
  drawCompass();

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
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); initEmbers(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
