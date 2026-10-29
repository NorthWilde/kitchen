const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const elements=new Map(),listeners={},timeouts=[];
const gradient={addColorStop(){}};
const ctx=new Proxy({createRadialGradient:()=>gradient},{get:(t,k)=>t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
function element(id){if(!elements.has(id))elements.set(id,{value:id==='heat'?'55':'50',textContent:'',hidden:false,disabled:false,style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){listeners[id+':'+k]=f},getContext:()=>ctx,hasPointerCapture:()=>false,getBoundingClientRect:()=>({left:0,top:0,width:720,height:680})});return elements.get(id);}
const box={document:{getElementById:element,addEventListener(){},hidden:false,activeElement:{tagName:'BODY'}},window:{matchMedia:()=>({matches:false}),addEventListener(){},isSecureContext:true,screen:{orientation:{angle:0}}},performance:{now:()=>1000},requestAnimationFrame(){},setTimeout:f=>timeouts.push(f),console,Math};
vm.createContext(box);const run=s=>vm.runInContext(s,box);run(fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8'));
assert.equal(run('state'),'empty');run('addPotatoes();');assert.equal(run('pieces.length'),12);assert.equal(run('state'),'cooking');
run('heat=1; for(let i=0;i<400;i++) simulation(.04);');assert.ok(run('progress()')>.49);assert.ok(run('progress()')<=.5);
assert.equal(run('flip()'),true);assert.equal(run('flip()'),false);run('for(let i=0;i<400;i++) simulation(.04);');assert.ok(run('progress()')>.99);assert.equal(run('flips'),1);
run('heat=0; reset(); addPotatoes(); for(let i=0;i<100;i++) simulation(.04);');assert.equal(run('progress()'),0);
run('heat=1; pause();');const before=run('progress()');run('for(let i=0;i<100;i++) simulation(.04);');assert.equal(run('progress()'),before);
run('state="cooking"; targetTilt={x:1,y:1}; for(let i=0;i<3000;i++) simulation(.04);');assert.ok(run('pieces.every(p=>Math.hypot(p.x,p.y)<=.831)'));
run('plateUp();');assert.equal(run('state'),'plated');run('draw();');run('addPotatoes();');assert.equal(run('flips'),0);assert.equal(run('progress()'),0);
run('motionActive=true; baseline={beta:40,gamma:0}; onOrientation({beta:40,gamma:14});');assert.equal(run('targetTilt.x'),.5);
run('onMotion({acceleration:{x:0,y:0,z:12}});');assert.ok(run('toss!==null'));const flips=run('flips');run('onMotion({acceleration:{x:0,y:0,z:12}});');assert.equal(run('flips'),flips);
run('stopMotion(); reset(); draw();');assert.equal(run('motionActive'),false);assert.equal(run('pieces.length'),0);
run('audio={currentTime:0}; master={gain:{setTargetAtTime(v){this.value=v}}}; soundOn=false; syncAudio();');assert.equal(run('master.gain.value'),0);
console.log('PASS: add/reset, two-side cooking, flip cooldown, no cooking with heat off/paused, pan bounds, plating/restart, tilt calibration, flick detection, motion disable, mute, rendering paths.');
(async()=>{
  run('audio=null; stopMotion();');
  await run('requestMotion();');assert.match(element('motionStatus').textContent,/isn't available/);
  run('window.DeviceOrientationEvent={requestPermission:()=>Promise.resolve("denied")}; window.DeviceMotionEvent={requestPermission:()=>Promise.resolve("denied")};');
  await run('requestMotion();');assert.equal(run('motionActive'),false);assert.match(element('motionStatus').textContent,/wasn't granted/);
  run('window.DeviceOrientationEvent={requestPermission:()=>Promise.resolve("granted")}; window.DeviceMotionEvent={requestPermission:()=>Promise.resolve("granted")};');
  await run('requestMotion();');assert.equal(run('motionActive'),true);timeouts.pop()();assert.equal(run('motionActive'),false);assert.match(element('motionStatus').textContent,/No sensor data/);
  console.log('PASS: unsupported sensors, denied permission, granted permission with absent sensor data.');
})().catch(error=>{console.error(error);process.exitCode=1});
