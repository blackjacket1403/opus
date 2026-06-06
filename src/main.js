import './style.css';
"use strict";
/* =========================================================================
   OPUS — A Performance
   You are in the audience of a darkened hall. On a glowing stage a full
   orchestra plays Vivaldi: ~60 musicians seated in their real sections. The
   section that is sounding RIGHT NOW lights up — and the left/right of the
   stage answers to the stereo image, so you can feel where the sound comes
   from. Soft light of the music rises from the players and washes through the
   hall. The aim is simply: see what you are hearing.
   Vanilla JS · Canvas 2D · Web Audio.
   ========================================================================= */
const cv = document.getElementById('c');
const g  = cv.getContext('2d', { alpha:false });
const audio = document.getElementById('audio');
const TAU = Math.PI*2;
const lerp  = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rgba  = (c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

let W,H,DPR,CX,MIN, stageFront, stageBack;
const QUAL=[
  {dpr:1.00, wisps:55},   // low
  {dpr:1.35, wisps:95},   // medium
  {dpr:1.60, wisps:150},  // high
];
let qTier = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 1 : 2;
let autoQ = true;

/* ---------------- the sounding sections (frequency bands → families) -------- */
const SECTIONS = [
  { name:'Double Basses',      lo:24,   hi:95,    rgb:[214,120, 72] },
  { name:'Cellos',             lo:95,   hi:260,   rgb:[228,150, 84] },
  { name:'Violas',             lo:260,  hi:620,   rgb:[232,182,104] },
  { name:'Violins',            lo:620,  hi:1600,  rgb:[238,214,150] },
  { name:'Woodwinds',          lo:1600, hi:4200,  rgb:[160,214,186] },
  { name:'Flutes & high airs', lo:4200, hi:13000, rgb:[180,206,240] },
];
const N = SECTIONS.length;
SECTIONS.forEach(s=>{ s.eL=0; s.eR=0; s.e=0; s.pan=0; });
function glow(rgb){
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
  const gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,248,235,0.95)');
  gr.addColorStop(0.32,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`);
  gr.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  x.fillStyle=gr; x.fillRect(0,0,64,64); return c;
}
SECTIONS.forEach(s=> s.spr=glow(s.rgb));

/* ---------------- the orchestra: ~60 seated players in real sections -------- */
/* each row: depth d (0 front → 1 back), how many players, which band lights it,
   horizontal spread, and an instrument hint. Strings fan in front, winds & brass
   behind, timpani at the back — the classic seating. */
const ROWS = [
  { d:0.06, n:14, band:3, spread:0.98, kind:'bow'  },  // 1st + 2nd violins (front arc)
  { d:0.20, n:12, band:3, spread:0.95, kind:'bow'  },
  { d:0.34, n:10, band:2, spread:0.90, kind:'bow'  },  // violas
  { d:0.47, n:8,  band:1, spread:0.82, kind:'cello'},  // cellos
  { d:0.60, n:6,  band:0, spread:0.74, kind:'bass' },  // double basses
  { d:0.55, n:7,  band:4, spread:0.46, kind:'wind' },  // woodwinds (centre, behind strings)
  { d:0.70, n:6,  band:2, spread:0.52, kind:'brass'},  // brass
  { d:0.78, n:3,  band:5, spread:0.26, kind:'wind' },  // flutes / piccolo
  { d:0.82, n:2,  band:0, spread:0.16, kind:'timp' },  // timpani (back centre)
];
let players=[], bandPlayers=[];
function buildOrchestra(){
  players=[]; bandPlayers=Array.from({length:N},()=>[]);
  for(const r of ROWS){
    const y    = lerp(stageFront, stageBack, r.d);
    const sc   = lerp(1.0, 0.5, r.d);                 // perspective shrink
    const arcW = lerp(W*0.36, W*0.12, r.d);
    for(let k=0;k<r.n;k++){
      const u = r.n>1 ? (k/(r.n-1))*2-1 : 0;          // -1 (stage L) … +1 (stage R)
      const x = CX + u*arcW*r.spread;
      const yy= y + Math.abs(u)*sc*10;                // edges a touch nearer → gentle arc
      const p={ x, y:yy, sc, band:r.band, kind:r.kind, side:u<0?-1:1, ph:Math.random()*TAU, lit:0 };
      players.push(p); bandPlayers[r.band].push(p);
    }
  }
  players.sort((a,b)=>a.y-b.y);                       // draw back → front
}

/* ---------------- the hall: audience silhouettes + chandeliers ------------- */
let audience=[], chand=[];
function buildHall(){
  audience=[];
  // a few rows of audience heads in the foreground, framing the view
  for(let row=0; row<3; row++){
    const y=lerp(H*0.985,H*0.86,row/2), sz=lerp(20,12,row/2), step=sz*1.7;
    for(let x=-step; x<W+step; x+=step){
      audience.push({ x:x+(row%2)*step*0.5+(Math.random()-0.5)*4, y:y+(Math.random()-0.5)*4, r:sz*(0.85+Math.random()*0.3) });
    }
  }
  chand=[];
  for(let i=0;i<5;i++) chand.push({ x:W*(0.12+0.19*i)+ (Math.random()-0.5)*20, y:H*(0.08+Math.random()*0.05), tw:Math.random()*TAU });
}

function resize(){
  DPR = Math.min(window.devicePixelRatio||1, QUAL[qTier].dpr);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W*DPR); cv.height = Math.floor(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; MIN=Math.min(W,H);
  stageFront = H*0.74; stageBack = H*0.40;
  buildOrchestra(); buildHall();
  g.fillStyle='#06050a'; g.fillRect(0,0,W,H);
}
addEventListener('resize', resize);

/* ---------------- music-flow wisps (soft light rising from the players) ----- */
let wisps=[];
function initWisps(){ const cap=QUAL[qTier].wisps; wisps=new Array(cap); for(let i=0;i<cap;i++) wisps[i]={alive:false}; }

resize(); initWisps();

/* ---------------- audio: stereo, per-section ---------------- */
let actx, anL, anR, freqL, freqR, binHz, playing=false, ready=false;
function buildGraph(){
  if(actx) return;
  actx = new (window.AudioContext||window.webkitAudioContext)();
  const src = actx.createMediaElementSource(audio);
  const sp  = actx.createChannelSplitter(2);
  anL = actx.createAnalyser(); anR = actx.createAnalyser();
  anL.fftSize = 2048; anR.fftSize = 2048;
  anL.smoothingTimeConstant = 0.84; anR.smoothingTimeConstant = 0.84;
  freqL = new Uint8Array(anL.frequencyBinCount);
  freqR = new Uint8Array(anR.frequencyBinCount);
  binHz = actx.sampleRate / anL.fftSize;
  src.connect(sp); sp.connect(anL,0); sp.connect(anR,1);
  src.connect(actx.destination);
  SECTIONS.forEach(s=>{ s.i0=Math.max(1,Math.round(s.lo/binHz)); s.i1=Math.max(s.i0,Math.round(s.hi/binHz)); });
  ready=true;
}
function bandAvg(arr,s){ let sum=0,n=0, hi=Math.min(s.i1,arr.length-1); for(let i=s.i0;i<=hi;i++){sum+=arr[i];n++;} return n?sum/n/255:0; }

let master=0, mPan=0, mPanS=0, pulse=0, flux=0, dom=3, domScore=0;
function analyse(t){
  if(ready && playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    let tot=0, wpan=0, hi=0, best=-1, bi=dom;
    for(let i=0;i<N;i++){ const s=SECTIONS[i]; const tilt=1+i*0.16;
      const eL=bandAvg(freqL,s)*tilt, eR=bandAvg(freqR,s)*tilt;
      s.eL += (eL-s.eL)*0.25; s.eR += (eR-s.eR)*0.25;
      const e=Math.pow((s.eL+s.eR)*0.5, 0.85);
      s.e += (e-s.e)*0.2;
      s.pan += ((s.eR-s.eL)/(s.eR+s.eL+1e-4) - s.pan)*0.12;
      tot+=s.e; wpan+=s.e*s.pan; if(i>=4) hi+=s.e;
      if(s.e>best){ best=s.e; bi=i; }
    }
    master += (clamp(tot/N*1.7,0,1)-master)*0.1;
    mPan = tot>1e-3 ? clamp(wpan/tot,-1,1) : 0;
    const d=hi-flux; flux=hi; if(d>0.05) pulse=Math.min(1,pulse+d*2.4); pulse*=0.9;
    if(bi===dom) domScore=Math.min(1,domScore+0.04); else { domScore-=0.05; if(domScore<=0){ dom=bi; domScore=0.3; } }
  } else {
    for(let i=0;i<N;i++){ const s=SECTIONS[i];
      const e=0.07+0.06*Math.sin(t*0.0004+i*1.1);
      s.e += (e-s.e)*0.06; s.eL=s.e; s.eR=s.e;
      s.pan += (0.4*Math.sin(t*0.00025+i*0.9)-s.pan)*0.04;
    }
    master += (0.14-master)*0.04; mPan=0.35*Math.sin(t*0.00022); pulse*=0.92;
  }
  mPanS += (mPan-mPanS)*0.06;
  // light up each player from its section + the matching stereo side
  for(const p of players){ const s=SECTIONS[p.band];
    const chan = p.side<0 ? s.eL : s.eR;
    const target = clamp(0.10 + chan*1.5 + s.e*0.25, 0, 1);
    p.lit += (target - p.lit)*0.2;
  }
}

/* ---------------- spawn / draw the rising music-light ---------------- */
function spawnWisp(){
  let p=null; for(const q of wisps){ if(!q.alive){ p=q; break; } } if(!p) return;
  // emit from a random player of an active section (weighted by energy)
  let tot=0; for(let i=0;i<N;i++) tot+=0.02+SECTIONS[i].e; let r=Math.random()*tot, bi=0;
  for(let i=0;i<N;i++){ r-=0.02+SECTIONS[i].e; if(r<=0){ bi=i; break; } }
  const arr=bandPlayers[bi]; const src=arr[(Math.random()*arr.length)|0]; if(!src) return;
  p.alive=true; p.band=bi; p.x=src.x+(Math.random()-0.5)*20; p.y=src.y;
  p.vx=(Math.random()-0.5)*16 + mPanS*30; p.vy=-(22+Math.random()*34);   // rise, lean with stereo
  p.life=1; p.size=18+Math.random()*30;
}
function drawWisps(dt){
  // emission rate from overall energy
  spawnWisp._acc=(spawnWisp._acc||0)+dt*(8+master*70);
  while(spawnWisp._acc>=1){ spawnWisp._acc-=1; spawnWisp(); }
  g.globalCompositeOperation='lighter';
  for(const p of wisps){ if(!p.alive) continue;
    p.life-=dt*0.34; if(p.life<=0){ p.alive=false; continue; }
    p.vx+=Math.sin((p.y+p.x)*0.01)*6*dt; p.vy*=0.992;
    p.x+=p.vx*dt; p.y+=p.vy*dt;
    const a=clamp(p.life,0,1), s=SECTIONS[p.band];
    const r=p.size*(0.6+(1-a)*0.9);                    // grow softly as it rises & fades
    g.globalAlpha=a*a*0.16;
    g.drawImage(s.spr, p.x-r, p.y-r, r*2, r*2);
  }
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
}

/* ---------------- the hall ---------------- */
function drawHall(t){
  // deep hall gradient + warm proscenium glow behind the stage
  const bg=g.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#0a0710'); bg.addColorStop(0.5,'#0b0810'); bg.addColorStop(1,'#070509');
  g.fillStyle=bg; g.fillRect(0,0,W,H);
  // proscenium / stage backlight
  const pg=g.createRadialGradient(CX,stageBack,0,CX,stageBack,MIN*0.95);
  pg.addColorStop(0, rgba([90,64,40], 0.30+master*0.18));
  pg.addColorStop(0.5, rgba([50,34,24], 0.16));
  pg.addColorStop(1, 'rgba(20,14,16,0)');
  g.fillStyle=pg; g.fillRect(0,0,W,H);
  // chandeliers high in the hall
  g.globalCompositeOperation='lighter';
  for(const c of chand){ c.tw+=0.02; const a=0.18+0.08*Math.sin(c.tw);
    const cg=g.createRadialGradient(c.x,c.y,0,c.x,c.y,42);
    cg.addColorStop(0, rgba([255,224,168],a)); cg.addColorStop(1,'rgba(255,224,168,0)');
    g.fillStyle=cg; g.beginPath(); g.arc(c.x,c.y,42,0,TAU); g.fill();
    g.fillStyle=rgba([255,236,196],a*1.6); g.beginPath(); g.arc(c.x,c.y,1.5,0,TAU); g.fill();
  }
  g.globalCompositeOperation='source-over';
}
function drawStage(){
  // a raised, warmly-lit stage platform (trapezoid in perspective)
  const fy=stageFront+H*0.06, by=stageBack-H*0.02, fw=W*0.46, bw=W*0.18;
  g.beginPath();
  g.moveTo(CX-fw,fy); g.lineTo(CX+fw,fy); g.lineTo(CX+bw,by); g.lineTo(CX-bw,by); g.closePath();
  const sg=g.createLinearGradient(0,by,0,fy);
  sg.addColorStop(0, rgba([60,44,30], 0.55)); sg.addColorStop(1, rgba([26,18,16], 0.85));
  g.fillStyle=sg; g.fill();
  // warm footlight glow across the front of the stage
  g.globalCompositeOperation='lighter';
  const fl=g.createLinearGradient(0,fy-40,0,fy+10);
  fl.addColorStop(0,'rgba(255,200,120,0)'); fl.addColorStop(1, rgba([255,196,120],0.10+master*0.10));
  g.fillStyle=fl; g.fillRect(CX-fw,fy-40,fw*2,50);
  g.globalCompositeOperation='source-over';
}
function drawPlayers(t){
  for(const p of players){ const s=SECTIONS[p.band], b=p.lit;
    const bow = Math.sin(t*0.005*(1+s.e*3)+p.ph)*(0.6+b*2.4);   // gentle playing motion
    const x=p.x, y=p.y+bow*0.5, sc=p.sc;
    // glow when sounding
    if(b>0.14){ g.globalCompositeOperation='lighter'; const gr=sc*(10+b*30);
      g.globalAlpha=clamp(b*0.7,0,0.8); g.drawImage(s.spr, x-gr, y-gr, gr*2, gr*2);
      g.globalAlpha=1; g.globalCompositeOperation='source-over'; }
    // the musician — a small seated silhouette tinted by their section
    const bodyA = 0.45+b*0.5;
    g.fillStyle=rgba(s.rgb, bodyA);
    g.beginPath(); g.ellipse(x, y, sc*3.0, sc*4.2, 0, 0, TAU); g.fill();           // torso
    g.beginPath(); g.arc(x, y-sc*4.6, sc*1.7, 0, TAU); g.fill();                   // head
    // instrument hint (a pale stroke) for bowed strings & basses
    if(p.kind==='bow'||p.kind==='cello'||p.kind==='bass'){
      g.strokeStyle=rgba([255,244,220], 0.25+b*0.5); g.lineWidth=Math.max(0.8,sc*0.9);
      const len=sc*(p.kind==='bass'?9:5.5), ang=-0.5 - bow*0.06;
      g.beginPath(); g.moveTo(x-sc*1.5, y-sc*1.5);
      g.lineTo(x-sc*1.5+Math.cos(ang)*len, y-sc*1.5+Math.sin(ang)*len); g.stroke();
    }
  }
}
function drawConductor(){
  const x=CX, y=stageFront+H*0.085, sc=1.25;
  // baton sway with the beat
  const sway=Math.sin(performance.now()*0.004)*(6+pulse*16);
  g.fillStyle='rgba(8,6,10,0.96)';
  g.beginPath(); g.ellipse(x,y,sc*7,sc*12,0,0,TAU); g.fill();          // body (back to us)
  g.beginPath(); g.arc(x,y-sc*13,sc*4.4,0,TAU); g.fill();              // head
  g.strokeStyle='rgba(20,14,16,0.96)'; g.lineWidth=sc*2.4; g.lineCap='round';
  g.beginPath(); g.moveTo(x-sc*4,y-sc*4); g.lineTo(x-sc*10-sway*0.3, y-sc*12-Math.abs(sway)*0.2); g.stroke();
  g.beginPath(); g.moveTo(x+sc*4,y-sc*4); g.lineTo(x+sc*10+sway, y-sc*12-Math.abs(sway)*0.3); g.stroke();
}
function drawAudience(){
  for(const a of audience){
    g.fillStyle='rgba(6,5,9,0.98)';
    g.beginPath(); g.ellipse(a.x,a.y,a.r,a.r*1.25,0,0,TAU); g.fill();        // shoulders
    g.beginPath(); g.arc(a.x,a.y-a.r*1.1,a.r*0.62,0,TAU); g.fill();          // head
    // faint warm rim from the stage
    g.strokeStyle='rgba(255,200,140,0.06)'; g.lineWidth=1.2;
    g.beginPath(); g.arc(a.x,a.y-a.r*1.1,a.r*0.62,Math.PI*1.15,Math.PI*1.95); g.stroke();
  }
}
function drawNowSounding(){
  const s=SECTIONS[dom];
  g.textAlign='center'; g.textBaseline='alphabetic';
  g.font="11px 'Cinzel', serif";
  g.fillStyle='rgba(217,178,74,0.45)'; g.fillText('NOW SOUNDING', CX, H*0.90);
  g.font="italic 22px 'Cormorant Garamond', Georgia, serif";
  g.fillStyle=rgba(s.rgb, 0.55+SECTIONS[dom].e*0.4);
  g.fillText(s.name, CX, H*0.925);
}

/* ---------------- main loop ---------------- */
let _fa=0,_fn=0,_lt=0,_pt=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  const dt = _pt ? Math.min((t-_pt)/1000, 0.05) : 0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ && fps<42 && qTier>0){ qTier--; resize(); initWisps(); } } }
  _lt=t;

  analyse(t);
  drawHall(t);
  drawStage();
  drawWisps(dt);     // soft music-light rising behind/among the players
  drawPlayers(t);
  drawConductor();
  drawAudience();
  drawNowSounding();
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
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; resize(); initWisps(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
