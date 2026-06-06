import './style.css';
"use strict";
/* =========================================================================
   OPUS — Liquid Spectrum  (WebGL)
   A full-screen GPU shader turns classical music into flowing liquid light:
   pitch runs low (bottom) → high (top); the LEFT and RIGHT of the screen are
   driven by the left/right audio channels and the whole field flows toward the
   side the sound comes from. Domain-warped fbm gives silky aurora filaments,
   ACES tone-mapping keeps it luminous but never blown out.
   ========================================================================= */
const cv = document.getElementById('c');
const audio = document.getElementById('audio');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

let gl = cv.getContext('webgl', {antialias:false, alpha:false, premultipliedAlpha:false})
      || cv.getContext('experimental-webgl');

/* ---------- quality (render scale; governor steps it down if needed) ---------- */
const QUAL=[0.5, 0.7, 0.9];
let qTier=2, autoQ=true, scale=QUAL[qTier];
let W=0,H=0;
function resize(){
  W=window.innerWidth; H=window.innerHeight;
  if(!gl) return;
  cv.width=Math.max(2,Math.floor(W*scale));
  cv.height=Math.max(2,Math.floor(H*scale));
  gl.viewport(0,0,cv.width,cv.height);
}
addEventListener('resize', resize);

/* ---------- shaders ---------- */
const VERT = `attribute vec2 a_p; void main(){ gl_Position=vec4(a_p,0.0,1.0); }`;
const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time, u_pan, u_level;
uniform sampler2D u_spec;            // x = pitch (low->high), r=Left energy, g=Right energy
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.02+vec2(7.3,3.1); a*=0.5; } return v; }
vec3 pal(float t){ return 0.55 + 0.45*cos(6.2831853*(vec3(1.0,0.92,0.72)*t + vec3(0.02,0.20,0.46))); }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float pitch = uv.y;
  vec2 lr = texture2D(u_spec, vec2(clamp(pitch,0.002,0.998), 0.5)).rg;
  float eL=lr.x, eR=lr.y;
  float side = smoothstep(0.0,1.0,uv.x);
  float dirE = mix(eL, eR, side);                 // left of screen = L channel, right = R
  float e = mix((eL+eR)*0.5, dirE, 0.65);
  // flowing, domain-warped noise advected toward the sounding side
  float t = u_time*0.05;
  vec2 fl = vec2(u_pan*0.85 + 0.10, 0.05);
  vec2 p  = uv*vec2(3.2,2.4);
  float w1 = fbm(p + t*fl);
  float w2 = fbm(p + 1.6*w1 + t*fl*1.4 + 5.2);
  float n  = fbm(p + 2.0*vec2(w1,w2) + t*fl);
  float fil = smoothstep(0.25,0.95,n);            // silky filaments
  float inten = e*(0.35 + 1.3*fil) + e*e*0.6;
  vec3 col = pal(pitch)*inten;
  col += pal(pitch)*e*0.5*pow(fil,3.0);           // soft glow
  col += mix(vec3(0.012,0.014,0.032), vec3(0.03,0.024,0.06), uv.y);  // background wash
  col *= 1.0 + u_level*0.4;
  vec2 q=uv-0.5; col *= 1.0 - 0.55*dot(q,q);      // vignette
  col = (col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14);   // ACES tonemap
  gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
}`;
function compile(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ console.error('shader:', gl.getShaderInfoLog(s)); return null; } return s; }

let prog, loc={}, specTex;
function initGL(){
  const vs=compile(gl.VERTEX_SHADER,VERT), fs=compile(gl.FRAGMENT_SHADER,FRAG);
  if(!vs||!fs) return false;
  prog=gl.createProgram(); gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){ console.error('link:', gl.getProgramInfoLog(prog)); return false; }
  gl.useProgram(prog);
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const a=gl.getAttribLocation(prog,'a_p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  ['u_res','u_time','u_pan','u_level','u_spec'].forEach(n=> loc[n]=gl.getUniformLocation(prog,n));
  specTex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,specTex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,SPEC_W,1,0,gl.RGBA,gl.UNSIGNED_BYTE,specData);
  gl.uniform1i(loc.u_spec,0);
  return true;
}

/* ---------- audio → spectrum texture (log-spaced, stereo) ---------- */
const SPEC_W=128;
const specData = new Uint8Array(SPEC_W*4);
const sL=new Float32Array(SPEC_W), sR=new Float32Array(SPEC_W);
let actx, anL, anR, freqL, freqR, binHz, playing=false, ready=false;
let panS=0, levelS=0;
function buildGraph(){
  if(actx) return;
  actx=new (window.AudioContext||window.webkitAudioContext)();
  const src=actx.createMediaElementSource(audio), sp=actx.createChannelSplitter(2);
  anL=actx.createAnalyser(); anR=actx.createAnalyser();
  anL.fftSize=2048; anR.fftSize=2048; anL.smoothingTimeConstant=0.8; anR.smoothingTimeConstant=0.8;
  freqL=new Uint8Array(anL.frequencyBinCount); freqR=new Uint8Array(anR.frequencyBinCount);
  binHz=actx.sampleRate/anL.fftSize;
  src.connect(sp); sp.connect(anL,0); sp.connect(anR,1); src.connect(actx.destination);
  ready=true;
}
const F_LO=40, F_HI=14000;
function specBand(arr,i){ const f0=F_LO*Math.pow(F_HI/F_LO,i/SPEC_W), f1=F_LO*Math.pow(F_HI/F_LO,(i+1)/SPEC_W);
  let a=Math.max(1,Math.round(f0/binHz)), b=Math.max(a,Math.round(f1/binHz)), m=0; b=Math.min(b,arr.length-1);
  for(let k=a;k<=b;k++) if(arr[k]>m) m=arr[k]; return m/255; }
function updateSpectrum(t,dt){
  let sumL=0,sumR=0;
  if(ready && playing){
    anL.getByteFrequencyData(freqL); anR.getByteFrequencyData(freqR);
    for(let i=0;i<SPEC_W;i++){ const tilt=1+ (i/SPEC_W)*1.2;
      const vL=Math.pow(specBand(freqL,i)*tilt,0.85), vR=Math.pow(specBand(freqR,i)*tilt,0.85);
      sL[i]+=(vL-sL[i])*0.35; sR[i]+=(vR-sR[i])*0.35; sumL+=sL[i]; sumR+=sR[i];
    }
  } else {
    for(let i=0;i<SPEC_W;i++){ const u=i/SPEC_W;
      const v=0.05+0.10*Math.max(0.0,Math.sin(t*0.0006 + u*9.0))*Math.exp(-u*1.2);
      const vl=v*(0.6+0.4*Math.sin(t*0.0004)), vr=v*(0.6+0.4*Math.cos(t*0.0004));
      sL[i]+=(vl-sL[i])*0.05; sR[i]+=(vr-sR[i])*0.05; sumL+=sL[i]; sumR+=sR[i];
    }
  }
  for(let i=0;i<SPEC_W;i++){ specData[i*4]=clamp(sL[i],0,1)*255; specData[i*4+1]=clamp(sR[i],0,1)*255; specData[i*4+2]=0; specData[i*4+3]=255; }
  const level=clamp((sumL+sumR)/(SPEC_W*2)*2.4,0,1);
  const pan=(sumR-sumL)/(sumR+sumL+1e-3);
  levelS+=(level-levelS)*0.1; panS+=(clamp(pan,-1,1)-panS)*0.06;
}

/* ---------- render loop ---------- */
let _fa=0,_fn=0,_lt=0,_pt=0,_t0=0;
function frame(t){
  requestAnimationFrame(frame);
  if(document.hidden || !gl || !prog) return;
  if(!_t0) _t0=t;
  const dt=_pt?Math.min((t-_pt)/1000,0.05):0.016; _pt=t;
  if(_lt){ _fa+=t-_lt; _fn++; if(_fa>=1500){ const fps=1000*_fn/_fa; _fa=0; _fn=0;
    if(autoQ && fps<40 && qTier>0){ qTier--; scale=QUAL[qTier]; resize(); } } }
  _lt=t;

  updateSpectrum(t,dt);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,specTex);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,SPEC_W,1,gl.RGBA,gl.UNSIGNED_BYTE,specData);
  gl.uniform2f(loc.u_res, cv.width, cv.height);
  gl.uniform1f(loc.u_time, (t-_t0));
  gl.uniform1f(loc.u_pan, panS);
  gl.uniform1f(loc.u_level, levelS);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}

if(gl){
  resize();
  if(initGL()) requestAnimationFrame(frame);
  else { gl=null; document.body.style.background='radial-gradient(circle at 50% 45%, #1a1230, #07060c 70%)'; }
}else{
  document.body.style.background='radial-gradient(circle at 50% 45%, #1a1230, #07060c 70%)';
  console.warn('WebGL unavailable — visualizer disabled.');
}

/* ---------- transport / files (unchanged) ---------- */
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

addEventListener('keydown',e=>{
  const tag=(e.target&&e.target.tagName)||''; if(tag==='INPUT'||tag==='TEXTAREA') return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); play.click(); }
  else if(k==='f'){ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  else if(k==='h'){ hud.classList.toggle('show'); }
  else if(k==='q'){ autoQ=false; qTier=(qTier+1)%3; scale=QUAL[qTier]; resize(); }
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ _lt=0; _pt=0; } });
