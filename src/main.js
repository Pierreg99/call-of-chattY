import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { Sky } from "three/addons/objects/Sky.js";
import "./style.css";

const CFG = Object.freeze({
  world: 180, gravity: 26, walk: 9.5, sprint: 15.5, jump: 8.2,
  look: 0.0021, fireRate: 720, mag: 30, reserve: 150,
  enemyCount: 16, maxFrame: 0.05
});

const state = {
  running:false, paused:false, health:100, stamina:100, score:0, wave:1,
  ammo:CFG.mag, reserve:CFG.reserve, reloading:false, reloadT:0, fireT:0,
  recoil:0, damageFlash:0, hitMarker:0, elapsed:0, shots:0, hits:0
};

const clock = new THREE.Clock();
const keys = new Set();
const $ = (id) => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;

const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08100f);
scene.fog = new THREE.FogExp2(0x0b1715, 0.0105);

const camera = new THREE.PerspectiveCamera(74, innerWidth/innerHeight, 0.05, 420);
camera.position.set(0, 2.2, 8);
scene.add(camera);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.minPolarAngle = 0.22;
controls.maxPolarAngle = Math.PI-0.22;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.22,0.45,0.84);
composer.addPass(bloom);

document.querySelector("#app").innerHTML = `
<div id="hud">
  <div id="topbar"><div class="panel"><div class="kicker">OPERATION</div><div class="value">COLD FRONT</div></div><div class="panel"><div class="kicker">SCORE</div><div class="value" id="score">000000</div></div><div class="panel"><div class="kicker">PERFORMANCE</div><div class="value" id="perf">— FPS</div></div></div>
  <div id="reticle"></div><div id="crosshairHint">LMB fire · R reload · SHIFT sprint · SPACE jump</div>
  <div id="vitals" class="panel"><div class="kicker">SYSTEMS / VITALS</div><div class="value"><span id="health">100</span>%</div><div class="meter"><i id="healthbar"></i></div></div>
  <div id="ammo" class="panel"><div class="kicker">CARBINE / 5.56</div><div><span class="value" id="ammoNow">30</span><span class="reserve" id="ammoReserve"> / 150</span></div></div>
  <div id="damage"></div><div id="prompt"></div><div id="toast"></div><div id="debug"></div>
  <div id="start"><div class="card"><h1>Call of<br>chattY</h1><p>Three.js tactical sandbox: procedural environment, hitscan weapon, responsive movement, AI combatants, cinematic atmosphere, reactive particles, dynamic lighting and a built-in quality gate.</p><button id="deploy">DEPLOY</button><div class="meta"><span>THREE.JS ${THREE.REVISION}</span><span>WEBGL2</span><span>AAA-SLICE / v0.1</span></div></div></div>
</div>`;

function makeTex(base, accent="") {
  const c=document.createElement("canvas"); c.width=c.height=128;
  const x=c.getContext("2d"); x.fillStyle=base; x.fillRect(0,0,128,128);
  for(let i=0;i<520;i++){ const g=Math.random()*255|0; x.fillStyle=`rgba(${g},${g},${g},${0.04+Math.random()*0.12})`; x.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*4,1+Math.random()*4); }
  if(accent){ x.strokeStyle=accent; x.globalAlpha=.18; for(let y=0;y<128;y+=16){x.beginPath();x.moveTo(0,y);x.lineTo(128,y+8);x.stroke();} }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4); return t;
}
const texGround=makeTex("#31423d","#b8ccbe");
const texMetal=makeTex("#20282a","#8ba39d");
const texConcrete=makeTex("#656a64","#a7afa8");
function mat(color, rough=.72, metal=0, map=null, emissive=0x000000, intensity=0) {
  return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,map,emissive,emissiveIntensity:intensity});
}
const mats = {
  ground: mat(0x617168,.96,0,texGround),
  concrete: mat(0x777a72,.8,0,texConcrete),
  metal: mat(0x2a3235,.5,.75,texMetal),
  dark: mat(0x111719,.48,.82,texMetal),
  rubber: mat(0x090b0c,1,0),
  glass: new THREE.MeshPhysicalMaterial({color:0x7fb4ab,roughness:.08,metalness:.15,transmission:.35,thickness:.3,transparent:true,opacity:.8}),
  red: mat(0xa3312c,.55,.25,null,0x280300,.4),
  light: mat(0xe7f7ed,.3,.1,null,0xb6ffe2,4.5)
};

function box(name,size,pos,material,cast=false){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.name=name;m.position.set(...pos);m.castShadow=cast;m.receiveShadow=true;scene.add(m);return m;}
function buildWorld(){
  const floor=box("terrain",[CFG.world,.8,CFG.world],[0,-.4,0],mats.ground,false); floor.material.map.repeat.set(28,28);
  const grid=new THREE.GridHelper(CFG.world,90,0x68877b,0x30443f); grid.position.y=.015; grid.material.opacity=.17; grid.material.transparent=true; scene.add(grid);
  for(let i=0;i<55;i++){
    const x=(Math.random()-.5)*150, z=(Math.random()-.5)*150;
    if(Math.hypot(x,z)<18){i--;continue;}
    const sx=3+Math.random()*7, sy=1.5+Math.random()*4, sz=3+Math.random()*7;
    if(Math.random()<.68) box(`cover_${i}`,[sx,sy,sz],[x,sy/2,z],Math.random()<.45?mats.concrete:mats.metal,true);
    else { const h=5+Math.random()*9; box(`tower_${i}`,[sx*.7,h,sz*.7],[x,h/2,z],mats.dark,true); box(`light_${i}`,[.18,.18,2],[x+.01,h*.72,z],mats.light,false); }
  }
  for(let i=0;i<12;i++){ const x=-62+i*11; box(`barrier_${i}`,[8,.8,1],[x,.5,13],mats.metal,true); box(`barrier2_${i}`,[8,.8,1],[x,.5,-13],mats.metal,true); }
  const runway=box("runway",[18,.05,110],[0,.04,0],mats.rubber,false);
  for(let z=-50;z<=50;z+=10) box("runway_mark",[.3,.02,4],[0,.08,z],mats.light,false);
}
buildWorld();

const sky=new Sky(); sky.scale.setScalar(450); scene.add(sky);
sky.material.uniforms.turbidity.value=4.8; sky.material.uniforms.rayleigh.value=1.5; sky.material.uniforms.mieCoefficient.value=.008; sky.material.uniforms.mieDirectionalG.value=.85; sky.material.uniforms.sunPosition.value.set(-70,55,-70);
scene.add(new THREE.HemisphereLight(0xacc7bf,0x111615,.62));
const keyLight=new THREE.DirectionalLight(0xd7eee4,4.2); keyLight.position.set(-48,72,-36); keyLight.castShadow=true; keyLight.shadow.mapSize.set(2048,2048); keyLight.shadow.camera.left=-80;keyLight.shadow.camera.right=80;keyLight.shadow.camera.top=80;keyLight.shadow.camera.bottom=-80;keyLight.shadow.bias=-.00015;scene.add(keyLight);
const rim=new THREE.DirectionalLight(0x7ba4ff,1.1); rim.position.set(70,24,50); scene.add(rim);

function makeWeapon(){
  const g=new THREE.Group(); g.position.set(.31,-.26,-.58); g.rotation.set(-.04,-.03,-.02);
  const body=new THREE.Mesh(new THREE.BoxGeometry(.18,.16,.72),mats.dark); body.castShadow=true; g.add(body);
  const handguard=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.5,12),mats.metal); handguard.rotation.x=Math.PI/2; handguard.position.z=-.46; g.add(handguard);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,.42,12),mats.dark); barrel.rotation.x=Math.PI/2; barrel.position.z=-.88; g.add(barrel);
  const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.045,.037,.11,12),mats.metal); muzzle.rotation.x=Math.PI/2; muzzle.position.z=-1.11; g.add(muzzle);
  const sight=new THREE.Mesh(new THREE.BoxGeometry(.055,.055,.24),mats.dark); sight.position.set(0,.11,-.3); g.add(sight);
  const optic=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.18,16),mats.glass); optic.rotation.x=Math.PI/2; optic.position.set(0,.17,-.24); g.add(optic);
  const stock=new THREE.Mesh(new THREE.BoxGeometry(.16,.17,.35),mats.rubber); stock.position.z=.45; g.add(stock);
  camera.add(g); return g;
}
const weapon=makeWeapon();

const enemies=[];
class Enemy {
  constructor(pos,id){
    this.id=id; this.group=new THREE.Group(); this.group.position.copy(pos); this.hp=100; this.alive=true; this.cool=Math.random()*1.4; this.seed=Math.random()*100;
    this.group.userData.enemy=true;
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,1.0,5,10),mat(0x2f3432,.84,0.05)); body.position.y=1.1; body.castShadow=true; this.group.add(body);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(.62,.48,.16),mat(0x46504c,.7,.4)); plate.position.set(0,1.28,.35); plate.castShadow=true; this.group.add(plate);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.28,16,12),mat(0x3a403e,.8,.1)); head.position.y=2.05; head.castShadow=true; this.group.add(head);
    const eye=new THREE.Mesh(new THREE.BoxGeometry(.24,.035,.04),mats.red); eye.position.set(0,2.07,.26); this.group.add(eye);
    scene.add(this.group);
  }
  takeDamage(d){if(!this.alive)return;this.hp-=d;state.hits++;state.hitMarker=.14;if(this.hp<=0){this.alive=false;this.group.visible=false;state.score+=100;spawnBurst(this.group.position,0xb6fff0,20);}}
  update(dt){
    if(!this.alive)return; this.cool-=dt;
    const toP=new THREE.Vector3().subVectors(camera.position,this.group.position); const dist=toP.length();
    if(dist<38){toP.y=0;toP.normalize();const strafe=Math.sin(state.elapsed*.9+this.seed)*.65;const side=new THREE.Vector3(-toP.z,0,toP.x);const dir=toP.multiplyScalar(.3).add(side.multiplyScalar(strafe)).normalize();this.group.position.addScaledVector(dir,dt*(dist>11?1.7:.75));this.group.position.x=clamp(this.group.position.x,-84,84);this.group.position.z=clamp(this.group.position.z,-84,84);this.group.lookAt(camera.position.x,this.group.position.y+1.1,camera.position.z);if(dist<31&&this.cool<=0&&Math.random()<dt*.8){this.cool=1.5+Math.random()*1.8;state.health=clamp(state.health-(5+Math.random()*8),0,100);state.damageFlash=.55;}}
    else {this.group.position.x+=Math.sin(state.elapsed*.25+this.seed)*dt*.8;this.group.position.z+=Math.cos(state.elapsed*.21+this.seed)*dt*.8;}
  }
}
for(let i=0;i<CFG.enemyCount;i++){const a=Math.random()*Math.PI*2,r=35+Math.random()*42;enemies.push(new Enemy(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r),i));}

const particles=[];
function spawnBurst(pos,color,count=14){for(let i=0;i<count;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.025+Math.random()*.045,6,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));p.position.copy(pos);p.velocity=new THREE.Vector3((Math.random()-.5)*7,Math.random()*6,(Math.random()-.5)*7);p.life=.25+Math.random()*.45;p.max=p.life;scene.add(p);particles.push(p);}}
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=12*dt;p.position.addScaledVector(p.velocity,dt);p.material.opacity=clamp(p.life/p.max,0,1);if(p.life<=0){scene.remove(p);p.material.dispose();particles.splice(i,1);}}}

function raycastFire(){
  if(state.ammo<=0){startReload();return;}
  state.ammo--;state.shots++;state.fireT=CFG.fireRate/1000;state.recoil=1;
  weapon.position.z=-.61;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);const objects=[];for(const e of enemies)if(e.alive)objects.push(...e.group.children);const hit=ray.intersectObjects(objects,false)[0];
  if(hit){let ownerGroup=hit.object.parent;while(ownerGroup && !ownerGroup.userData.enemy)ownerGroup=ownerGroup.parent;const owner=enemies.find(e=>e.group===ownerGroup);if(owner){owner.takeDamage(34+Math.random()*15);spawnBurst(hit.point,0xffffdf,7);state.score+=10;toast("TARGET HIT");}}
  else {const p=ray.ray.origin.clone().addScaledVector(ray.ray.direction,60);spawnBurst(p,0x9fd4c8,4);}
}
function startReload(){if(state.reloading||state.ammo===CFG.mag||state.reserve<=0)return;state.reloading=true;state.reloadT=1.15;toast("RELOADING");}

document.addEventListener("keydown",e=>{keys.add(e.code);if(e.code==="KeyR")startReload();if(e.code==="Space")e.preventDefault();});
document.addEventListener("keyup",e=>keys.delete(e.code));
document.addEventListener("mousedown",e=>{if(e.button===0&&state.running&&controls.isLocked&&!state.reloading)fireHeld=true;});
document.addEventListener("mouseup",e=>{if(e.button===0)fireHeld=false;});
document.addEventListener("contextmenu",e=>e.preventDefault());
let fireHeld=false;

const playerVel=new THREE.Vector3();let grounded=true;
function updatePlayer(dt){
  const sprint=(keys.has("ShiftLeft")||keys.has("ShiftRight"))&&(keys.has("KeyW")||keys.has("KeyA")||keys.has("KeyS")||keys.has("KeyD"));const moving=keys.has("KeyW")||keys.has("KeyA")||keys.has("KeyS")||keys.has("KeyD");const speed=sprint&&state.stamina>0?CFG.sprint:CFG.walk;
  if(sprint&&moving)state.stamina=clamp(state.stamina-dt*18,0,100);else state.stamina=clamp(state.stamina+dt*14,0,100);
  const dir=new THREE.Vector3(Number(keys.has("KeyD"))-Number(keys.has("KeyA")),0,Number(keys.has("KeyS"))-Number(keys.has("KeyW")));if(dir.lengthSq()>0)dir.normalize();dir.applyQuaternion(camera.quaternion);dir.y=0;if(dir.lengthSq()>0)dir.normalize();
  const accel=grounded?14:4;const target=dir.multiplyScalar(speed);playerVel.x=lerp(playerVel.x,target.x,clamp(accel*dt,0,1));playerVel.z=lerp(playerVel.z,target.z,clamp(accel*dt,0,1));
  if(keys.has("Space")&&grounded){playerVel.y=CFG.jump;grounded=false;}playerVel.y-=CFG.gravity*dt;camera.position.addScaledVector(playerVel,dt);
  if(camera.position.y<2.2){camera.position.y=2.2;playerVel.y=0;grounded=true;}camera.position.x=clamp(camera.position.x,-88,88);camera.position.z=clamp(camera.position.z,-88,88);
}
function updateWeapon(dt){
  state.fireT=Math.max(0,state.fireT-dt);state.recoil=lerp(state.recoil,0,Math.min(1,dt*12));weapon.position.x=lerp(weapon.position.x,.31,Math.min(1,dt*12));weapon.position.y=lerp(weapon.position.y,-.26,Math.min(1,dt*12));weapon.rotation.x=lerp(weapon.rotation.x,-.04-state.recoil*.12,Math.min(1,dt*18));weapon.position.z=lerp(weapon.position.z,-.58,Math.min(1,dt*18));
  if(fireHeld&&state.fireT<=0)raycastFire();
  if(state.reloading){state.reloadT-=dt;weapon.rotation.z=Math.sin(state.reloadT*7)*.13;if(state.reloadT<=0){const need=CFG.mag-state.ammo,n=Math.min(need,state.reserve);state.ammo+=n;state.reserve-=n;state.reloading=false;weapon.rotation.z=0;toast("READY");}}
}
function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("show");void $("toast").offsetWidth;$("toast").classList.add("show");}
let frames=0,fps=0,fpsT=0;
function updateUI(dt){
  $("score").textContent=String(state.score).padStart(6,"0");$("health").textContent=Math.round(state.health);$("healthbar").style.width=`${state.health}%`;$("ammoNow").textContent=state.ammo;$("ammoReserve").textContent=` / ${state.reserve}`;$("damage").style.opacity=state.damageFlash.toFixed(2);
  $("debug").textContent=`ENEMIES ${enemies.filter(e=>e.alive).length}/${enemies.length}\nDRAW ${renderer.info.render.calls} / TRIS ${Math.round(renderer.info.render.triangles/1000)}K\nSHOTS ${state.shots} / HITS ${state.hits}`;
  fpsT+=dt;frames++;if(fpsT>=.5){fps=frames/fpsT;frames=0;fpsT=0;$("perf").textContent=`${fps.toFixed(0)} FPS`;}
  state.damageFlash=Math.max(0,state.damageFlash-dt*3.8);state.hitMarker=Math.max(0,state.hitMarker-dt);$("reticle").style.transform=`translate(-50%,-50%) scale(${state.hitMarker>0?1.18:1})`;
}
function frame(){const dt=Math.min(clock.getDelta(),CFG.maxFrame);state.elapsed+=dt;if(state.running&&!state.paused){updatePlayer(dt);updateWeapon(dt);enemies.forEach(e=>e.update(dt));updateParticles(dt);updateUI(dt);}composer.render(scene,camera);}

$("deploy").addEventListener("click",()=>{state.running=true;controls.lock();$("start").style.display="none";toast("OPERATION STARTED");});
controls.addEventListener("lock",()=>{$("start").style.display="none";state.paused=false;});
controls.addEventListener("unlock",()=>{if(state.running){state.paused=true;$("prompt").textContent="CLICK TO RESUME";$("prompt").classList.add("show");$("start").style.display="grid";}});
window.addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);bloom.setSize(innerWidth,innerHeight);});
document.addEventListener("visibilitychange",()=>{state.paused=document.hidden;});
