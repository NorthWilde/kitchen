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

// Lightweight software 3D renderer: vertices, perspective, lit faces and depth
// sorting. It uses the existing Canvas context; no network libraries or GPU needed.
const cameraElevation=.86, cameraDistance=14, cameraFocal=1280;
let sceneFaces=[], sceneTiltX=0, sceneTiltY=0, renderLayer=0;
function rotate3(point,ax,ay,az=0) {
  let [x,y,z]=point;
  [x,y]=[x*Math.cos(az)-y*Math.sin(az),x*Math.sin(az)+y*Math.cos(az)];
  [y,z]=[y*Math.cos(ax)-z*Math.sin(ax),y*Math.sin(ax)+z*Math.cos(ax)];
  [x,z]=[x*Math.cos(ay)+z*Math.sin(ay),-x*Math.sin(ay)+z*Math.cos(ay)];
  return [x,y,z];
}
function world3(point) {return rotate3(point,sceneTiltX,sceneTiltY);}
function project3(point) {
  const [x,y,z]=point;
  const depth=y*Math.cos(cameraElevation)+z*Math.sin(cameraElevation);
  const scale=cameraFocal/(cameraDistance-depth);
  return {x:360+x*scale,y:290+(y*Math.sin(cameraElevation)-z*Math.cos(cameraElevation))*scale,depth};
}
function polygon3(vertices,color,options={}) {
  const world=vertices.map(world3), projected=world.map(project3);
  const a=world[0],b=world[1],c=world[2];
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(options.inward)normal=normal.map(n=>-n);
  const length=Math.hypot(...normal)||1;
  const light=(-normal[0]*.42-normal[1]*.32+normal[2]*.85)/length;
  const illumination=options.unlit?1:.52+Math.max(0,light)*.5;
  const lit=color.map(n=>Math.round(clamp(n*illumination,0,255)));
  sceneFaces.push({points:projected,depth:projected.reduce((sum,p)=>sum+p.depth,0)/projected.length,color:`rgb(${lit.join(",")})`,alpha:options.alpha??1,layer:options.layer??renderLayer});
}
function ring3(r0,z0,r1,z1,color,options={}) {
  const segments=64;
  for(let i=0;i<segments;i++) {
    const a=i/segments*TAU,b=(i+1)/segments*TAU;
    polygon3([[r0*Math.cos(a),r0*Math.sin(a),z0],[r0*Math.cos(b),r0*Math.sin(b),z0],[r1*Math.cos(b),r1*Math.sin(b),z1],[r1*Math.cos(a),r1*Math.sin(a),z1]],color,options);
  }
}
function disk3(radius,z,color) {
  const vertices=Array.from({length:64},(_,i)=>[Math.cos(i/64*TAU)*radius,Math.sin(i/64*TAU)*radius,z]);
  polygon3(vertices,color);
}
function box3(x,y,z,w,d,h,color) {
  const p=[[x-w/2,y-d/2,z],[x+w/2,y-d/2,z],[x+w/2,y+d/2,z],[x-w/2,y+d/2,z],
    [x-w/2,y-d/2,z+h],[x+w/2,y-d/2,z+h],[x+w/2,y+d/2,z+h],[x-w/2,y+d/2,z+h]];
  for(const ids of [[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]])polygon3(ids.map(i=>p[i]),color);
}
function potato3(p,plated=false) {
  const t=toss?toss.time/toss.duration:0;
  const air=toss?Math.sin(t*Math.PI)*(reducedMotion?.32:1.1):0;
  const width=p.size/88,depth=width*.84,height=width*.63;
  const x=p.x*(plated?1.8:2.12), y=p.y*(plated?1.8:2.12);
  const bottom=plated?.23:.04;
  const heading=p.angle*.6;
  // A bevelled block with separate top, bottom and side surfaces. It rotates
  // around its own centre while airborne rather than flattening into a sprite.
  function local(px,py,pz) {
    const turned=rotate3([px,py,pz-height/2],toss?t*Math.PI:0,0,0);
    const spun=rotate3(turned,0,0,heading);
    return [x+spun[0],y+spun[1],bottom+height/2+spun[2]+air];
  }
  function footprint(inset,z) {
    const w=width/2-inset,d=depth/2-inset,c=.055;
    return [[-w+c,-d], [w-c,-d],[w,-d+c],[w,d-c],[w-c,d],[-w+c,d],[-w,d-c],[-w,-d+c]].map(([a,b])=>local(a,b,z));
  }
  const low=footprint(.025,0),middle=footprint(0,.055),upper=footprint(0,height-.055),top=footprint(.035,height);
  const brown=p.sides[p.face],other=p.sides[1-p.face];
  const blend=(a,b,n)=>a.map((v,i)=>v+(b[i]-v)*n);
  const golden=blend([246,216,137],[196,124,46],brown);
  const side=blend([218,173,86],[173,100,36],brown*.65);
  polygon3([...low].reverse(),blend([244,212,132],[192,118,41],other));
  for(let i=0;i<8;i++) {
    const j=(i+1)%8;
    polygon3([low[i],low[j],middle[j],middle[i]],side.map(n=>n*.8));
    polygon3([middle[i],middle[j],upper[j],upper[i]],side);
    polygon3([upper[i],upper[j],top[j],top[i]],golden.map(n=>Math.min(255,n*1.06)));
  }
  polygon3(top,golden);
  // Toasted patches and salt are attached to the 3D top, so they turn with it.
  for(let i=0;i<5;i++) {
    const px=Math.sin(p.seed+i*2.7)*width*.28,py=Math.cos(p.seed+i*3.3)*depth*.25;
    const r=.018+brown*.026;
    const patch=Array.from({length:6},(_,j)=>local(px+Math.cos(j/6*TAU)*r,py+Math.sin(j/6*TAU)*r*.7,height+.002));
    polygon3(patch,blend([222,181,97],[117,66,28],brown));
  }
  for(let i=0;i<3;i++) {
    const px=Math.sin(p.seed+i*4.3)*width*.3,py=Math.cos(p.seed+i*2.3)*depth*.28,r=.009;
    polygon3([local(px-r,py-r,height+.005),local(px+r,py-r,height+.005),local(px+r,py+r,height+.005),local(px-r,py+r,height+.005)],[255,244,210]);
  }
}
function pan3() {
  // Exterior thickness, sloping inner wall and rolled metal lip.
  disk3(2.28,-.23,[38,43,40]);
  ring3(2.28,-.23,2.6,.38,[62,68,63]);
  ring3(2.6,.38,2.63,.47,[161,169,154]);
  ring3(2.63,.47,2.59,.53,[219,222,205]);
  ring3(2.59,.53,2.49,.49,[160,172,154]);
  ring3(2.49,.49,2.12,.025,[66,75,65],{inward:true});
  renderLayer=.1;
  disk3(2.12,.026,[57,67,57]);
  // Concentric machining marks, modeled as extremely narrow rings.
  renderLayer=.11;
  for(let r=.65;r<2.05;r+=.28)ring3(r,.029,r+.008,.029,[70,81,67]);
  renderLayer=.2;
  // The grip has thickness, raised detailing and a metal connector.
  box3(0,2.61,.32,.39,.61,.15,[138,148,132]);
  box3(0,3.29,.32,.45,1.13,.24,[57,66,48]);
  box3(0,3.29,.565,.32,.91,.025,[95,105,72]);
  box3(-.105,3.29,.594,.025,.72,.008,[139,148,103]);
  box3(0,3.67,.596,.12,.16,.006,[35,43,32]);
  // Two metal rivets on the near slope.
  for(const x of [-.25,.25])box3(x,2.22,.245,.1,.1,.025,[185,191,165]);
}
function servingPlate3() {
  disk3(2.55,.0,[198,197,179]);
  ring3(2.55,0,2.58,.13,[225,224,209]);
  ring3(2.58,.13,2.35,.21,[255,253,239]);
  ring3(2.35,.21,1.98,.12,[237,237,219],{inward:true});
  disk3(1.98,.12,[252,249,231]);
}
function flush3() {
  sceneFaces.sort((a,b)=>a.layer-b.layer||a.depth-b.depth);
  for(const face of sceneFaces) {
    ctx.globalAlpha=face.alpha;ctx.fillStyle=face.color;
    ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();
    // A same-color hairline closes antialiasing seams between mesh panels.
    ctx.strokeStyle=face.color;ctx.lineWidth=.45;ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function drawEllipse(x,y,rx,ry,color) {
  ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();
}
function draw() {
  ctx.clearRect(0,0,720,680);
  const plated=state==="plated";
  sceneTiltX=plated?0:tilt.y*.17;sceneTiltY=plated?0:-tilt.x*.17;sceneFaces=[];renderLayer=0;
  // Soft countertop shadow sits outside the pan coordinate transform.
  const shadow=ctx.createRadialGradient(360,345,50,360,345,275);
  shadow.addColorStop(0,"#635a3c25");shadow.addColorStop(1,"#635a3c00");
  drawEllipse(360,345,282,196,shadow);
  if(state==="cooking"&&heat>0)drawEllipse(360,326,224,145,`rgba(225,160,81,${heat*.1})`);
  if(plated)servingPlate3();else pan3();
  // Floor, small effects and food are separate layers; a large floor polygon
  // cannot paint over distant food merely because its average depth is nearer.
  // Grounded shadows become softer and smaller as food rises.
  const air=toss?Math.sin(toss.time/toss.duration*Math.PI):0;
  for(const p of pieces) {
    const r=p.size/190*(1-air*.25),verts=[];
    for(let i=0;i<16;i++){const a=i/16*TAU;verts.push([p.x*(plated?1.8:2.12)+Math.cos(a)*r,p.y*(plated?1.8:2.12)+Math.sin(a)*r,plated?.125:.035]);}
    polygon3(verts,[19,24,17],{unlit:true,alpha:.18-air*.09,layer:1});
    renderLayer=2;potato3(p,plated);
  }
  if(!plated&&state==="cooking"&&!toss&&pieces.length) {
    // Small oil bubbles lie in the plane of the cooking surface.
    const count=Math.floor(heat*42);
    for(let i=0;i<count;i++) {
      const p=pieces[i%pieces.length],a=i*2.39+clock*.3,r=.19+((i*.11+clock*.22)%.18);
      const x=p.x*2.12+Math.cos(a)*r,y=p.y*2.12+Math.sin(a)*r;
      if(Math.hypot(x,y)>2.1)continue;
      const rad=.013+((i+clock*5)%3)*.008;
      const verts=Array.from({length:8},(_,j)=>[x+Math.cos(j/8*TAU)*rad,y+Math.sin(j/8*TAU)*rad,.04]);
      polygon3(verts,[197,184,124],{unlit:true,alpha:.5,layer:1.2});
    }
  }
  flush3();
  // Steam uses projected anchors above the actual pan floor.
  if(state==="cooking"&&heat>.15&&pieces.length&&!reducedMotion) {
    for(let i=0;i<4;i++) {
      const t=(clock*.22+i*.24)%1,anchor=project3(world3([-.8+i*.55,0,.1]));
      ctx.strokeStyle=`rgba(255,255,246,${(1-t)*heat*.25})`;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(anchor.x,anchor.y-t*75);ctx.bezierCurveTo(anchor.x-14,anchor.y-25-t*75,anchor.x+18,anchor.y-45-t*75,anchor.x+5,anchor.y-75-t*75);ctx.stroke();
    }
  }
  if(state==="empty") {
    const p=project3(world3([0,-.15,.04]));ctx.fillStyle="#d7ddc5ad";ctx.font="13px Trebuchet MS";ctx.textAlign="center";ctx.fillText("A warm pan. A little possibility.",p.x,p.y);
  }
  if(state==="paused") {
    ctx.fillStyle="#fffcf0ed";ctx.beginPath();ctx.roundRect(230,255,260,65,18);ctx.fill();ctx.fillStyle="#667355";ctx.font="18px Georgia";ctx.textAlign="center";ctx.fillText("Take a little breath.",360,294);
  }
}

function frame(time) {
  if(lastTime===null)lastTime=time;
  const dt=clamp((time-lastTime)/1000,0,.04);lastTime=time;
  simulation(dt);soundStep(dt);draw();
  if(time-lastUi>120){updateUi();lastUi=time;}
  requestAnimationFrame(frame);
}
updateUi();requestAnimationFrame(frame);
