"use strict";
const $ = id => document.getElementById(id);
const canvas = $("pan"), ctx = canvas.getContext("2d");
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const TAU = Math.PI * 2;
let state="empty", heat=.55, soundOn=true, volume=.5, clock=0, lastTime=null;
let tilt={x:0,y:0}, targetTilt={x:0,y:0}, pointer=null, pieces=[], toss=null, flips=0;
let lastToss=-10, lastUi=0, readyNotified=false, pauseReason="";
const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Continuous filtered noise is the frying bed. A second noise buffer makes
// irregular crackles and brief landing bursts. No recordings or external assets.
let audio=null, master=null, bedGain=null, crackleTimer=0, noiseBuffer=null;
async function enableAudio() {
  try {
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio) throw new Error("Unsupported");
    if(!audio) {
      audio=new Audio(); master=audio.createGain(); master.gain.value=0; master.connect(audio.destination);
      noiseBuffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate);
      const data=noiseBuffer.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*.65;
      const source=audio.createBufferSource(); source.buffer=noiseBuffer; source.loop=true;
      const filter=audio.createBiquadFilter(); filter.type="bandpass"; filter.frequency.value=1900; filter.Q.value=.55;
      bedGain=audio.createGain(); bedGain.gain.value=0;
      source.connect(filter); filter.connect(bedGain); bedGain.connect(master); source.start();
    }
    await audio.resume(); syncAudio();
    if(audio.state!=="running") $("status").textContent="Tap Sound on again to enable audio. You can still cook silently.";
  } catch { $("status").textContent="Sound is unavailable here. The pan still works silently."; }
}
function syncAudio() {
  if(!audio) return;
  const audible=state==="cooking"&&soundOn&&!document.hidden;
  master.gain.setTargetAtTime(audible?volume*.7:0,audio.currentTime,.035);
}
function noiseBurst(level,duration=.09) {
  if(!audio||audio.state!=="running"||!soundOn||state!=="cooking"||document.hidden) return;
  const source=audio.createBufferSource(), filter=audio.createBiquadFilter(), gain=audio.createGain();
  source.buffer=noiseBuffer; source.playbackRate.value=.8+Math.random()*.5;
  filter.type="highpass"; filter.frequency.value=1200;
  const now=audio.currentTime; gain.gain.setValueAtTime(0,now);
  gain.gain.linearRampToValueAtTime(level,now+.005); gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  source.connect(filter); filter.connect(gain); gain.connect(master);
  source.start(now,Math.random()); source.stop(now+duration+.02);
  source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
}
function soundStep(dt) {
  if(!audio) return;
  const contact=toss?Math.max(.03,1-Math.sin(toss.time/toss.duration*Math.PI)):1;
  const level=state==="cooking"&&pieces.length?heat*.27*contact:0;
  bedGain.gain.setTargetAtTime(level,audio.currentTime,.055);
  if(state==="cooking"&&heat>.02&&soundOn) {
    crackleTimer-=dt;
    if(crackleTimer<=0) {
      noiseBurst((.025+Math.random()*.055)*heat*contact,.025+Math.random()*.05);
      crackleTimer=.035+Math.random()*(.22-.15*heat);
    }
  }
}
$("sound").onclick=()=>{
  soundOn=!soundOn; $("sound").textContent=soundOn?"Sound on":"Sound off";
  $("sound").setAttribute("aria-pressed",String(!soundOn)); syncAudio();
  if(soundOn) enableAudio();
};
$("volume").oninput=event=>{ volume=Number(event.target.value)/100; $("volumeValue").textContent=Math.round(volume*100)+"%"; syncAudio(); };

function makePieces() {
  return Array.from({length:12},(_,i)=>{
    const angle=i*2.39996, r=.12+Math.sqrt(i/12)*.55;
    return {x:Math.cos(angle)*r,y:Math.sin(angle)*r,vx:0,vy:0,angle:angle,spin:(i%2?1:-1)*(.5+Math.random()),size:30+Math.random()*7,face:0,sides:[0,0],seed:i*.79};
  });
}
function progress() { return pieces.length?pieces.reduce((n,p)=>n+p.sides[0]+p.sides[1],0)/(pieces.length*2):0; }
function updateUi() {
  const amount=Math.round(progress()*100);
  $("progressFill").style.width=amount+"%";
  $("progress").setAttribute("aria-valuenow",String(amount));
  $("progressText").textContent=state==="empty"?"Ready when you are":amount===100?"Golden on both sides":amount+"% golden · flip to cook both sides";
  $("flips").textContent=flips+ (flips===1?" flip":" flips");
  $("phase").textContent=({empty:"PAN READY",cooking:toss?"IN THE AIR":"SIZZLING",paused:"TAKE A BREATH",plated:"BON APPÉTIT"})[state];
  $("add").disabled=state==="cooking"||state==="paused";
  $("add").textContent=state==="plated"?"Cook another batch ↗":"Add potatoes ↗";
  $("flip").disabled=state!=="cooking"||!!toss;
  $("plate").disabled=state!=="cooking"||!!toss;
  $("pause").disabled=state!=="cooking"&&state!=="paused";
  $("pause").textContent=state==="paused"?"Resume":"Pause";
  $("plateCard").hidden=state!=="plated";
  $("panHint").textContent=state==="plated"?"YOUR LITTLE KITCHEN CREATION":motionActive?"TILT GENTLY · FLICK OR TAP FLIP":"DRAG TO TILT · TAP FLIP TO TOSS";
}
function clearPointer() {
  const old=pointer; pointer=null;
  if(old!==null&&canvas.hasPointerCapture(old)) canvas.releasePointerCapture(old);
}
function reset() {
  state="empty";pieces=[];toss=null;flips=0;lastToss=-10;readyNotified=false;
  targetTilt={x:0,y:0};tilt={x:0,y:0};clearPointer();
  $("status").textContent="A clean pan, a fresh start. Add potatoes whenever you like.";
  syncAudio();updateUi();
}
function addPotatoes() {
  if(state==="cooking"||state==="paused") return;
  reset();state="cooking";pieces=makePieces();
  $("status").textContent="Hear that sizzle? Slide the potatoes, then flip to cook the other side.";
  enableAudio().then(()=>noiseBurst(.25*heat,.35));updateUi();
}
function flip() {
  if(state!=="cooking"||toss||clock-lastToss<.9) return false;
  lastToss=clock;toss={time:0,duration:reducedMotion?.45:.72};
  pieces.forEach(p=>{p.vx+=targetTilt.x*.35;p.vy-=.2;});
  flips++;$("status").textContent="Up, over… and back into the pan.";updateUi();return true;
}
function plateUp() {
  if(state!=="cooking"||toss) return;
  const pct=Math.round(progress()*100);
  state="plated";clearPointer();targetTilt={x:0,y:0};
  $("plateSummary").textContent=`${pct}% golden · ${flips} ${flips===1?"flip":"flips"}. ${pct>=95?"Beautifully golden, both sides.":pct>=50?"A lovely start. Try another flip next time.":"A little pale, and that's okay. Try a warmer pan next time."}`;
  $("status").textContent="Dinner is served. Start another batch whenever you feel like it.";
  syncAudio();updateUi();
}
function pause(reason="") {
  if(state!=="cooking") return;
  state="paused";pauseReason=reason;clearPointer();targetTilt={x:0,y:0};
  $("status").textContent=reason||"Take your time. Heat and movement are paused.";syncAudio();updateUi();
}
$("add").onclick=addPotatoes;$("flip").onclick=()=>{enableAudio();flip();};
$("plate").onclick=plateUp;$("reset").onclick=reset;
$("pause").onclick=()=>{
  if(state==="cooking") pause();
  else if(state==="paused"&&!document.hidden) {state="cooking";lastTime=null;$("status").textContent="Back to the lovely sizzle.";enableAudio();updateUi();}
};
$("heat").oninput=event=>{
  heat=Number(event.target.value)/100;
  $("heatName").textContent=heat===0?"Off":heat<.35?"Low":heat<.75?"Medium":"High";
  if(state==="cooking") $("status").textContent=heat===0?"Heat off. The pan is taking a little rest.":"Listen to how the sizzle changes with the heat.";
};
canvas.addEventListener("pointerdown",e=>{
  if(state!=="cooking"||pointer!==null||e.button!==0) return;
  e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);drag(e);enableAudio();
});
function drag(e) {
  const rect=canvas.getBoundingClientRect();
  targetTilt.x=clamp(((e.clientX-rect.left)/rect.width-.5)*2,-1,1);
  targetTilt.y=clamp(((e.clientY-rect.top)/rect.height-.43)*2,-1,1);
}
canvas.addEventListener("pointermove",e=>{if(pointer===e.pointerId&&state==="cooking")drag(e);});
for(const name of ["pointerup","pointercancel","lostpointercapture"]) canvas.addEventListener(name,e=>{if(pointer===e.pointerId){clearPointer();targetTilt={x:0,y:0};}});
document.addEventListener("keydown",e=>{
  if(e.code==="Space"&&!["INPUT","BUTTON","A"].includes(document.activeElement.tagName)) {e.preventDefault();if(!e.repeat){enableAudio();flip();}}
});
document.addEventListener("visibilitychange",()=>{if(document.hidden) pause("You stepped away, so the stove is paused. Press Resume to continue.");});
window.addEventListener("blur",()=>pause("The stove is paused while you're away. Press Resume to continue."));

// Device orientation controls pan tilt; acceleration detects a modest flick.
// Sensor readings stay on this device and are never sent or stored.
let motionActive=false,motionPending=false,lastOrientation=null,baseline=null;
let orientationSeen=0,accelerationSeen=0,motionGeneration=0,gravity=null;
function screenAngle() {return (window.screen?.orientation?.angle ?? window.orientation ?? 0)*Math.PI/180;}
function onOrientation(event) {
  if(!motionActive||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma)) return;
  lastOrientation={beta:event.beta,gamma:event.gamma};orientationSeen=performance.now();
  if(!baseline) baseline={...lastOrientation};
  if(state!=="cooking"||pointer!==null) return;
  const db=clamp(event.beta-baseline.beta,-50,50)/28,dg=clamp(event.gamma-baseline.gamma,-50,50)/28,a=screenAngle();
  targetTilt.x=clamp(dg*Math.cos(a)+db*Math.sin(a),-1,1);
  targetTilt.y=clamp(db*Math.cos(a)-dg*Math.sin(a),-1,1);
}
function onMotion(event) {
  if(!motionActive) return;
  const direct=event.acceleration, raw=event.accelerationIncludingGravity;
  let vector=null;
  if(direct&&[direct.x,direct.y,direct.z].every(Number.isFinite)) vector=[direct.x,direct.y,direct.z];
  else if(raw&&[raw.x,raw.y,raw.z].every(Number.isFinite)) {
    const v=[raw.x,raw.y,raw.z];
    if(!gravity) {gravity=v;return;}
    gravity=gravity.map((g,i)=>g*.9+v[i]*.1);vector=v.map((n,i)=>n-gravity[i]);
  }
  if(!vector) return;
  accelerationSeen=performance.now();
  const strength=Math.hypot(...vector);
  if(strength>8&&strength<35&&state==="cooking"&&pointer===null) flip();
}
window.addEventListener("deviceorientation",onOrientation);
window.addEventListener("devicemotion",onMotion);
async function requestMotion() {
  if(motionPending) return;
  if(motionActive) {stopMotion();return;}
  if(!window.isSecureContext) {$("motionStatus").textContent="Motion needs HTTPS. Use drag and Flip here, or open the published HTTPS page.";return;}
  const Orientation=window.DeviceOrientationEvent, Motion=window.DeviceMotionEvent;
  if(!Orientation&&!Motion) {$("motionStatus").textContent="Motion isn't available on this device. Drag and Flip work instead.";return;}
  motionPending=true;$("motion").disabled=true;
  $("motionStatus").textContent="Waiting for motion access…";
  // Invoke both permission requests inside the original button gesture.
  const requests=[Orientation,Motion].map(Type=>{
    if(!Type) return Promise.resolve("unavailable");
    try {return typeof Type.requestPermission==="function"?Type.requestPermission():Promise.resolve("granted");}
    catch {return Promise.resolve("denied");}
  });
  const results=await Promise.allSettled(requests);
  motionPending=false;$("motion").disabled=false;
  const allowed=results.some(r=>r.status==="fulfilled"&&r.value==="granted");
  if(!allowed) {$("motionStatus").textContent="Motion access wasn't granted. You can still drag and tap Flip.";return;}
  motionActive=true;baseline=null;gravity=null;lastOrientation=null;orientationSeen=0;accelerationSeen=0;
  const generation=++motionGeneration;
  $("motion").textContent="Disable motion";$("calibrate").disabled=true;
  $("motionStatus").textContent="Checking for sensor data. Hold still for a moment…";
  setTimeout(()=>{
    if(!motionActive||generation!==motionGeneration)return;
    if(!orientationSeen&&!accelerationSeen) {
      stopMotion();$("motionStatus").textContent="No sensor data arrived. Try your phone's browser; drag and Flip still work.";return;
    }
    $("calibrate").disabled=!orientationSeen;
    $("motionStatus").textContent=orientationSeen&&accelerationSeen?"Motion connected. Calibrate at a comfortable angle, then tilt or flick gently.":orientationSeen?"Tilt connected. Tap Flip to toss; acceleration isn't available.":"Flick connected. Drag to tilt; orientation isn't available.";
    $("modeLabel").textContent="Phone motion mode · drag and buttons also work";updateUi();
  },3500);
  updateUi();
}
function stopMotion() {
  motionActive=false;motionGeneration++;baseline=null;gravity=null;targetTilt={x:0,y:0};
  $("motion").textContent="Enable motion";$("calibrate").disabled=true;
  $("motionStatus").textContent="Motion off. Use drag and Flip.";$("modeLabel").textContent="Touch / mouse mode";updateUi();
}
$("motion").onclick=requestMotion;
$("calibrate").onclick=()=>{
  if(lastOrientation){baseline={...lastOrientation};gravity=null;targetTilt={x:0,y:0};$("motionStatus").textContent="Centered. Tilt from this comfortable position.";}
};
window.addEventListener("orientationchange",()=>{if(motionActive){baseline=null;targetTilt={x:0,y:0};$("motionStatus").textContent="Screen turned. Hold comfortably, then calibrate again.";}});

function simulation(dt) {
  clock+=dt;
  if(state!=="cooking") {tilt.x*=Math.exp(-dt*6);tilt.y*=Math.exp(-dt*6);return;}
  const blend=1-Math.exp(-dt*7);
  tilt.x+=(targetTilt.x-tilt.x)*blend;tilt.y+=(targetTilt.y-tilt.y)*blend;
  if(toss) {
    toss.time+=dt;
    if(toss.time>=toss.duration) {
      toss=null;pieces.forEach(p=>{p.face=1-p.face;p.vx+=(Math.random()-.5)*.45;p.vy+=(Math.random()-.5)*.45;});
      noiseBurst(.32*heat,.24);$("status").textContent="A soft landing. Let this side turn golden.";updateUi();
    }
  }
  for(const p of pieces) {
    p.vx+=tilt.x*dt*1.8;p.vy+=tilt.y*dt*1.8;
    const friction=Math.exp(-dt*(toss?.6:2.8));p.vx*=friction;p.vy*=friction;
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    const r=Math.hypot(p.x,p.y), limit=.83;
    if(r>limit){const nx=p.x/r,ny=p.y/r;p.x=nx*limit;p.y=ny*limit;const outward=p.vx*nx+p.vy*ny;if(outward>0){p.vx-=outward*nx*1.35;p.vy-=outward*ny*1.35;}}
    p.angle+=p.spin*Math.hypot(p.vx,p.vy)*dt;
    if(!toss) p.sides[p.face]=Math.min(1,p.sides[p.face]+heat*dt/12);
  }
  // Soft pair separation prevents all pieces collapsing into a single pile.
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++) {
    const a=pieces[i],b=pieces[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=.205;
    if(d>0&&d<min){const push=(min-d)*.35,nx=dx/d,ny=dy/d;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}
  }
  // Constrain again after separating neighbours.
  for(const p of pieces){const d=Math.hypot(p.x,p.y);if(d>.83){p.x*=.83/d;p.y*=.83/d;}}
  if(progress()>=.999&&!readyNotified){readyNotified=true;$("status").textContent="Golden on both sides. Plate up whenever you're ready.";}
}

// All artwork is generated with Canvas paths, gradients and shapes.
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function mix(a,b,t){return `rgb(${a.map((n,i)=>Math.round(n+(b[i]-n)*t)).join(",")})`;}
function drawPotato(p,x,y,scale=1,air=0) {
  const brown=p.sides[p.face],pulse=toss?Math.sin(toss.time/toss.duration*Math.PI):0;
  ctx.save();ctx.translate(x,y);ctx.rotate(p.angle+(toss?pulse*p.spin*.6:0));
  ctx.scale(scale,scale*(toss?Math.max(.18,Math.abs(Math.cos(toss.time/toss.duration*Math.PI))):1));
  rounded(-p.size/2,-p.size*.4,p.size,p.size*.8,8,"#aa7133");
  rounded(-p.size/2,-p.size*.4-4,p.size,p.size*.8,8,mix([247,219,137],[190,117,39],brown));
  rounded(-p.size*.33,-p.size*.3-3,p.size*.47,4,2,"#fff3bf77");
  for(let i=0;i<4;i++){const sx=Math.sin(p.seed+i*2)*p.size*.26,sy=Math.cos(p.seed+i*3)*p.size*.22;ellipse(sx,sy-2,2+brown*2,1+brown,"#aa6d2840");}
  ctx.restore();
}
function draw() {
  ctx.clearRect(0,0,720,680);
  const plated=state==="plated",cx=360+tilt.x*12,cy=292+tilt.y*10;
  if(plated){
    ellipse(360,390,230,154,"#c3b99d26");ellipse(360,365,236,170,"#d4d6c7");ellipse(360,358,236,170,"#fffdf6");
    ctx.strokeStyle="#e0e0d1";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(360,358,202,140,0,0,TAU);ctx.stroke();
    pieces.forEach(p=>drawPotato(p,360+p.x*160,350+p.y*102,1.1));
    for(let i=0;i<14;i++){const a=i*2.4,r=40+(i%4)*30;ellipse(360+Math.cos(a)*r,350+Math.sin(a)*r*.6,2.5,1.8,"#758858");}
    return;
  }
  // Burner and the small warm glow under a hot pan.
  ellipse(360,330,252,193,"#d7cfba35");
  if(heat>0&&state==="cooking") {ctx.globalAlpha=heat*.22;ellipse(cx,cy+25,237,170,"#e4b579");ctx.globalAlpha=1;}
  // Handle, rivet and softly shaded pan body.
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-.12+tilt.x*.04);
  rounded(-23,137,46,185,19,"#353a32");rounded(-17,151,34,164,13,"#64694e");rounded(-10,160,6,134,3,"#ffffff12");ellipse(0,292,7,9,"#343b30");ctx.restore();
  ellipse(cx,cy+13,246,187,"#30372f");ellipse(cx,cy,246,184,"#858b75");ellipse(cx,cy-4,240,178,"#bec2aa");
  const interior=ctx.createRadialGradient(cx-65,cy-60,20,cx,cy,240);interior.addColorStop(0,"#50584a");interior.addColorStop(1,"#292f29");
  ellipse(cx,cy,230,166,interior);
  ctx.strokeStyle="#ffffff11";ctx.lineWidth=1;
  for(let r=55;r<230;r+=28){ctx.beginPath();ctx.ellipse(cx,cy,r,r*.71,0,0,TAU);ctx.stroke();}
  // An oil sheen, deliberately subtle so food remains easy to see.
  ctx.save();ctx.beginPath();ctx.ellipse(cx,cy,222,157,0,0,TAU);ctx.clip();
  ctx.strokeStyle="#dfd59b30";ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(cx+tilt.x*35,cy+tilt.y*20,145,95,-.2,0,TAU);ctx.stroke();
  const air=toss?Math.sin(toss.time/toss.duration*Math.PI):0;
  if(pieces.length) {
    for(const p of pieces) ellipse(cx+p.x*210,cy+p.y*145,p.size*.56,p.size*.25,`rgba(0,0,0,${.14-air*.09})`);
    const bubbleCount=state==="cooking"&&!toss?Math.floor(heat*55):0;
    for(let i=0;i<bubbleCount;i++) {
      const p=pieces[i%pieces.length],a=i*2.39+clock*.3,r=17+((i*11+clock*22)%20);
      const x=cx+p.x*210+Math.cos(a)*r,y=cy+p.y*145+Math.sin(a)*r*.7;
      ctx.strokeStyle="#e7dca86b";ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,1+((i+clock*7)%3),0,TAU);ctx.stroke();
    }
  }
  ctx.restore();
  pieces.slice().sort((a,b)=>a.y-b.y).forEach(p=>drawPotato(p,cx+p.x*210,cy+p.y*145-air*(reducedMotion?26:100),1+air*.12,air));
  ellipse(cx-33,cy+140,5,3,"#c3c8b1");ellipse(cx+33,cy+140,5,3,"#c3c8b1");
  // Steam is decorative; it stops with the simulation when paused.
  if(state==="cooking"&&heat>.15&&pieces.length&&!reducedMotion) {
    for(let i=0;i<4;i++){const t=(clock*.22+i*.24)%1;ctx.strokeStyle=`rgba(255,255,246,${(1-t)*heat*.2})`;ctx.lineWidth=3;ctx.beginPath();const x=cx-80+i*51;ctx.moveTo(x,cy-45-t*85);ctx.bezierCurveTo(x-14,cy-70-t*85,x+18,cy-90-t*85,x+5,cy-120-t*85);ctx.stroke();}
  }
  if(state==="empty") {ctx.fillStyle="#d7ddc5a0";ctx.font="13px Trebuchet MS";ctx.textAlign="center";ctx.fillText("A warm pan. A little possibility.",cx,cy+4);}
  if(state==="paused") {rounded(230,255,260,65,18,"#fffcf0ed");ctx.fillStyle="#667355";ctx.font="18px Georgia";ctx.textAlign="center";ctx.fillText("Take a little breath.",360,294);}
}
function frame(time) {
  if(lastTime===null)lastTime=time;
  const dt=clamp((time-lastTime)/1000,0,.04);lastTime=time;
  simulation(dt);soundStep(dt);draw();
  if(time-lastUi>120){updateUi();lastUi=time;}
  requestAnimationFrame(frame);
}
updateUi();requestAnimationFrame(frame);
