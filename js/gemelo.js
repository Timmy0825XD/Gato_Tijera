/* Gemelo Digital — Gato Tijera · Fase III (sin dependencias salvo three.js + physics.js) */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const P0 = Object.assign({}, GatoPhysics.DEFAULTS);

/* ---------- estado ---------- */
let params = { M:400, L:0.20, b:2.0, Tau0:22, p:0.003, mu:0.15 };
let sim = null, tPlay = 0, playing = true, speed = 1, autoDemo = false;
let csv = null, showCsv = true;

/* ---------- helpers ---------- */
function currentParams(){
  return { L:params.L, M:params.M, b:params.b, Tau0:params.Tau0, p:params.p, mu:params.mu,
    dm:P0.dm, J:P0.J, g:P0.g, alphaDeg:P0.alphaDeg, Lb:P0.Lb,
    th0deg:P0.th0deg, th1deg:P0.th1deg, Tstep:P0.Tstep, Ton:P0.Ton, Tfin:P0.Tfin, dt:0.01 };
}
function resim(){
  sim = GatoPhysics.simulate(currentParams());
  $('phiMaxLbl').textContent = sim.D.phi_max.toFixed(0);
  $('syncState').textContent = `sincronizado · ${sim.P.Tfin.toFixed(1)} s @ 0.01 s · λ=${sim.D.lambda.toFixed(0)} s⁻¹`;
  updateValidation();
}

/* ---------- THREE 3D ---------- */
let renderer, scene, camera, jack, bars=[];
let screwG, screwCore, threadSpin, threadRings=[], collarA, collarB, crankG, saddleG;
let boltO, boltA, boltB, boltC, topPlat, loadBox, carG, carPivot, wrenchG;
let yaw=0.65, pitch=0.34, dist=2.1, dragging=false, px=0, py=0;
const Y0 = 0.04;
let M = null, barGeo = null, lastBarL = -1;

/* Micro-relieve procedural: una sola textura de ruido para rugosidad y relieve */
let _noiseTex = null;
function noiseTex(){
  if(_noiseTex) return _noiseTex;
  const S=256, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const cx=cv.getContext('2d'), img=cx.createImageData(S,S);
  for(let i=0;i<img.data.length;i+=4){ const v=(100+Math.random()*110)|0;
    img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255; }
  cx.putImageData(img,0,0);
  _noiseTex=new THREE.CanvasTexture(cv);
  _noiseTex.wrapS=_noiseTex.wrapT=THREE.RepeatWrapping;
  return _noiseTex;
}
function pbr(color, roughness, metalness, extra){
  return new THREE.MeshStandardMaterial(Object.assign(
    {color, roughness, metalness, roughnessMap:noiseTex(), bumpMap:noiseTex(), bumpScale:0.0012},
    extra||{}));
}
/* Estudio procedural para IBL: tarjetas HDR como softboxes (sin descargas) */
function buildEnvironment(){
  const es = new THREE.Scene();
  const card=(w,h,rgb,x,y,z,ry,rx)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    m.material.color.setRGB(rgb[0],rgb[1],rgb[2]);
    m.position.set(x,y,z); m.rotation.set(rx||0,ry||0,0); es.add(m);
  };
  card(8,8,[5.2,5.2,5.2], 0,7,0, 0,Math.PI/2);       // softbox cenital
  card(3,7,[0.5,2.0,2.8], -7,2.5,0, Math.PI/2,0);     // tira fría izquierda
  card(3,7,[3.0,1.7,0.8], 7,2.5,0, -Math.PI/2,0);     // tira cálida derecha
  card(10,3,[0.5,0.9,1.8], 0,3,-8, 0,0);              // fondo azul
  card(8,3,[0.35,0.45,0.65], 0,2,8, Math.PI,0);       // relleno frontal
  card(12,12,[0.10,0.13,0.22], 0,-3,0, 0,-Math.PI/2); // rebote de suelo
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(es, 0.035);
  pm.dispose();
  return rt.texture;
}
function groundTexture(){
  const S=512, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const cx=cv.getContext('2d');
  const g=cx.createRadialGradient(S/2,S/2,40,S/2,S/2,S/2);
  g.addColorStop(0,'#1b2342'); g.addColorStop(0.55,'#0d1330'); g.addColorStop(1,'#05081a');
  cx.fillStyle=g; cx.fillRect(0,0,S,S);
  for(let i=0;i<9000;i++){ const a=Math.random()*0.05;
    cx.fillStyle=Math.random()<0.5?('rgba(255,255,255,'+a.toFixed(3)+')'):('rgba(0,0,0,'+(a*1.6).toFixed(3)+')');
    cx.fillRect(Math.random()*S,Math.random()*S,1.3,1.3); }
  const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; return t;
}
/* Brazo estampado: rectángulo redondeado con agujero y bordes biselados */
function buildBarGeometry(L){
  const w=0.046, r=0.02, x0=-L/2, x1=L/2, y0=-w/2, y1=w/2;
  const s=new THREE.Shape();
  s.moveTo(x0+r,y0); s.lineTo(x1-r,y0); s.quadraticCurveTo(x1,y0,x1,y0+r);
  s.lineTo(x1,y1-r); s.quadraticCurveTo(x1,y1,x1-r,y1);
  s.lineTo(x0+r,y1); s.quadraticCurveTo(x0,y1,x0,y1-r);
  s.lineTo(x0,y0+r); s.quadraticCurveTo(x0,y0,x0+r,y0);
  const hole=new THREE.Path(); hole.absarc(0,0,0.0085,0,Math.PI*2,true); s.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(s,{depth:0.008,bevelEnabled:true,bevelThickness:0.0016,
    bevelSize:0.0016,bevelSegments:2,curveSegments:24});
  g.translate(0,0,-0.004);
  return g;
}
function ensureBars(L){
  if(barGeo && Math.abs(lastBarL-L)<1e-12) return;
  if(barGeo) barGeo.dispose();
  barGeo=buildBarGeometry(L); lastBarL=L;
  bars.forEach(b=>{ b.geometry=barGeo; b.castShadow=true; b.receiveShadow=true; });
}
/* Tornillo de pivote: eje + arandelas + tuercas hexagonales */
function makeBolt(r, len){
  const g=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,16), M.steel);
  shaft.rotation.x=Math.PI/2; g.add(shaft);
  [-1,1].forEach(s=>{
    const wsh=new THREE.Mesh(new THREE.CylinderGeometry(r*1.7,r*1.7,0.004,20), M.steelDark);
    wsh.rotation.x=Math.PI/2; wsh.position.z=s*(len/2+0.002); g.add(wsh);
    const nut=new THREE.Mesh(new THREE.CylinderGeometry(r*1.7,r*1.7,0.011,6), M.steelDark);
    nut.rotation.x=Math.PI/2; nut.position.z=s*(len/2+0.0095); g.add(nut);
  });
  g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  return g;
}
/* Calcomanía 1.5 T del brazo */
function stickerTexture(){
  const cv=document.createElement('canvas'); cv.width=256; cv.height=128;
  const cx=cv.getContext('2d');
  cx.fillStyle='#101114'; cx.fillRect(0,0,256,128);
  cx.strokeStyle='#c8ccd2'; cx.lineWidth=6; cx.strokeRect(7,7,242,114);
  cx.fillStyle='#d32a20'; cx.font='bold 62px Arial'; cx.textAlign='center';
  cx.fillText('1.5 T',128,72);
  cx.fillStyle='#c8ccd2'; cx.font='bold 22px Arial';
  cx.fillText('CE · 1500 kg',128,106);
  const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t;
}
/* Llave de gancho del kit, recostada en el suelo */
function buildWrench(){
  const g=new THREE.Group();
  const rod=(len,r,x,z,alongX)=>{
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,14), M.steel);
    if(alongX) m.rotation.z=Math.PI/2; else m.rotation.x=Math.PI/2;
    m.position.set(x,0.008,z); g.add(m);
  };
  rod(0.42,0.008,-0.04,0,true);
  rod(0.12,0.008,0.17,0.06,false);
  const hook=new THREE.Mesh(new THREE.TorusGeometry(0.028,0.008,10,16,Math.PI*1.1), M.steel);
  hook.rotation.x=Math.PI/2; hook.position.set(0.17,0.008,0.145); g.add(hook);
  const sock=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.05,6), M.steelDark);
  sock.rotation.z=Math.PI/2; sock.position.set(-0.27,0.008,0); g.add(sock);
  g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  g.position.set(-0.2,0,0.85); g.rotation.y=0.5;
  return g;
}
/* Auto estilizado: balancín en y local 0.2065, ruedas en el suelo local 0 */
function buildCar(){
  const car=new THREE.Group();
  const paint=pbr(0x7e93ad,0.32,0.85,{envMapIntensity:1.0});
  const glass=pbr(0x0d131b,0.08,0.9,{envMapIntensity:1.2});
  const trim=pbr(0x1b2130,0.7,0.3,{envMapIntensity:0.4});
  const R=0.2065, yB=R+0.09;
  const rock=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.09,0.88), trim);
  rock.position.y=R+0.045; car.add(rock);
  const b=new THREE.Shape();
  b.moveTo(-0.85,yB);
  b.lineTo(-0.85,0.50); b.quadraticCurveTo(-0.85,0.60,-0.75,0.60);
  b.lineTo(0.45,0.60); b.quadraticCurveTo(0.68,0.60,0.74,0.52);
  b.lineTo(0.82,0.44); b.lineTo(0.85,0.36); b.lineTo(0.85,yB);
  b.lineTo(0.73,yB); b.absarc(0.52,yB,0.21,0,Math.PI,false);
  b.lineTo(-0.31,yB); b.absarc(-0.52,yB,0.21,0,Math.PI,false);
  b.lineTo(-0.85,yB);
  const bodyG=new THREE.ExtrudeGeometry(b,{depth:0.90,bevelEnabled:true,bevelThickness:0.01,
    bevelSize:0.01,bevelSegments:2,curveSegments:20});
  bodyG.translate(0,0,-0.45);
  car.add(new THREE.Mesh(bodyG, paint));
  const g2=new THREE.Shape();
  g2.moveTo(0.42,0.60); g2.lineTo(0.12,0.755); g2.lineTo(-0.30,0.755);
  g2.lineTo(-0.58,0.60); g2.lineTo(0.42,0.60);
  const glassG=new THREE.ExtrudeGeometry(g2,{depth:0.80,bevelEnabled:true,bevelThickness:0.008,
    bevelSize:0.008,bevelSegments:2,curveSegments:8});
  glassG.translate(0,0,-0.40);
  car.add(new THREE.Mesh(glassG, glass));
  const roof=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.02,0.76), paint);
  roof.position.set(-0.09,0.762,0); car.add(roof);
  [-1,1].forEach(s=>{
    const pil=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.16,0.014), paint);
    pil.position.set(0.02,0.68,s*0.405); car.add(pil);
  });
  [0.845,-0.845].forEach(x=>{
    const p=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.10,0.90), trim);
    p.position.set(x,0.36,0); car.add(p);
  });
  const plateM=new THREE.MeshStandardMaterial({color:0xd8dce2,roughness:0.6,metalness:0.1});
  [0.878,-0.878].forEach(x=>{
    const pl=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.06,0.18), plateM);
    pl.position.set(x,0.30,0); car.add(pl);
  });
  const hlM=new THREE.MeshStandardMaterial({color:0x30363e,emissive:0xbcc8d8,emissiveIntensity:0.55,roughness:0.2,metalness:0.4});
  const tlM=new THREE.MeshStandardMaterial({color:0x3a0d0d,emissive:0xd21f1f,emissiveIntensity:0.6,roughness:0.2,metalness:0.4});
  [-0.28,0.28].forEach(z=>{
    const h=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.055,0.13), hlM); h.position.set(0.852,0.47,z); car.add(h);
    const t=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.055,0.13), tlM); t.position.set(-0.852,0.47,z); car.add(t);
  });
  [-1,1].forEach(s=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.045,0.035), paint); m.position.set(0.38,0.56,s*0.50); car.add(m);
    [0.10,-0.28].forEach(x=>{
      const hnd=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.016,0.012), M.steelDark); hnd.position.set(x,0.53,s*0.46); car.add(hnd);
    });
  });
  const exh=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.09,12), trim);
  exh.rotation.z=Math.PI/2; exh.position.set(-0.86,0.30,0.28); car.add(exh);
  const wellM=new THREE.MeshStandardMaterial({color:0x07090d,roughness:1,metalness:0});
  [-0.52,0.52].forEach(x=>{
    const well=new THREE.Mesh(new THREE.CylinderGeometry(0.205,0.205,0.7,20), wellM);
    well.rotation.x=Math.PI/2; well.position.set(x,0.19,0); car.add(well);
  });
  const tireM=pbr(0x14161a,0.9,0.0,{envMapIntensity:0.3});
  const rimM=pbr(0xb9bfc7,0.3,1.0,{envMapIntensity:1.0});
  const spokeM=pbr(0x2a2f38,0.5,0.8,{envMapIntensity:0.6});
  [[-0.52,-0.44],[0.52,-0.44],[-0.52,0.44],[0.52,0.44]].forEach(([x,z])=>{
    const w=new THREE.Group();
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.19,0.11,28), tireM);
    tire.rotation.x=Math.PI/2; w.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,0.112,20), rimM);
    rim.rotation.x=Math.PI/2; w.add(rim);
    for(let k=0;k<5;k++){
      const sp=new THREE.Mesh(new THREE.BoxGeometry(0.032,0.17,0.114), spokeM);
      sp.rotation.z=k*Math.PI*2/5; w.add(sp);
    }
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.12,12), spokeM);
    cap.rotation.x=Math.PI/2; w.add(cap);
    w.position.set(x,0.19,z); car.add(w);
  });
  car.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  return car;
}
function initThree(){
  const el = $('three');
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050b1f, 2.4, 6);
  scene.environment = buildEnvironment();
  camera = new THREE.PerspectiveCamera(42, 1, 0.01, 20);
  scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x0a0f24, 0.5));
  const key = new THREE.DirectionalLight(0xfff1de, 1.55);
  key.position.set(1.4, 2.3, 1.2); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left=-1.2; key.shadow.camera.right=1.2;
  key.shadow.camera.top=1.3; key.shadow.camera.bottom=-0.3;
  key.shadow.camera.near=0.5; key.shadow.camera.far=6;
  key.shadow.bias=-0.0003; key.shadow.normalBias=0.015;
  key.target.position.set(0,0.25,0);
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0x6fb7ff, 1.0); rim.position.set(-1.6,1.1,-1.4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.35); fill.position.set(-0.6,0.7,1.9); scene.add(fill);
  // materiales PBR del taller
  M = {
    paint: pbr(0xcc2a1e, 0.36, 0.55, {envMapIntensity:0.9}),
    black: pbr(0x17191d, 0.42, 0.85, {envMapIntensity:0.7}),
    steel: pbr(0xc9ced6, 0.30, 1.0, {envMapIntensity:1.1}),
    steelDark: pbr(0x39435a, 0.5, 0.85, {envMapIntensity:0.8}),
    frame: pbr(0xa82318, 0.5, 0.5, {envMapIntensity:0.7}),
    rubber: pbr(0x11141a, 0.95, 0.0, {envMapIntensity:0.35}),
    plastic: pbr(0x1a1e26, 0.5, 0.0, {envMapIntensity:0.5})
  };
  // suelo de taller
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2.6, 56),
    new THREE.MeshStandardMaterial({map:groundTexture(), roughness:0.92, metalness:0.05}));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
  jack = new THREE.Group(); jack.position.z = 0.30; scene.add(jack); // bajo el estribo derecho
  // base: placa + rieles + tuercas de anclaje + orejetas
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56,0.04,0.36), M.frame);
  plate.position.y = Y0-0.02; jack.add(plate);
  [-0.165,0.165].forEach(z=>{
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.56,0.024,0.03), M.frame);
    rail.position.set(0, 0.012, z); jack.add(rail);
  });
  [[-0.22,-0.12],[0.22,-0.12],[-0.22,0.12],[0.22,0.12]].forEach(([x,z])=>{
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.011,0.011,0.009,6), M.steelDark);
    n.position.set(x, Y0+0.004, z); jack.add(n);
  });
  [-0.055,0.055].forEach(z=>{
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.045,0.022), M.frame);
    lug.position.set(0, Y0+0.022, z); jack.add(lug);
  });
  // brazos (geometría exacta según L)
  for(let i=0;i<8;i++){ const b=new THREE.Mesh(); b.material=M.paint; bars.push(b); jack.add(b); }
  ensureBars(0.20);
  // tornillería de los 4 pivotes
  boltO=makeBolt(0.009,0.19); boltA=makeBolt(0.009,0.19);
  boltB=makeBolt(0.009,0.19); boltC=makeBolt(0.009,0.19);
  [boltO,boltA,boltB,boltC].forEach(b=>jack.add(b));
  // tornillo de potencia con rosca visible
  screwG = new THREE.Group(); jack.add(screwG);
  screwCore = new THREE.Mesh(new THREE.CylinderGeometry(0.0105,0.0105,1,20), M.black);
  screwCore.rotation.z = Math.PI/2; screwG.add(screwCore);
  threadSpin = new THREE.Group(); screwG.add(threadSpin);
  for(let i=0;i<18;i++){
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0113,0.0021,10,28), M.black);
    ring.rotation.y = Math.PI/2; threadSpin.add(ring); threadRings.push(ring);
  }
  collarA = new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.017,0.022,20), M.steelDark);
  collarA.rotation.z = Math.PI/2; screwG.add(collarA);
  collarB = collarA.clone(); screwG.add(collarB);
  // manivela: cubo + brazo + empuñadura
  crankG = new THREE.Group(); jack.add(crankG);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.034,20), M.steelDark);
  hub.rotation.z = Math.PI/2; crankG.add(hub);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014,0.075,0.016), M.steel);
  arm.position.set(0.012,0.037,0); crankG.add(arm);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0135,0.0135,0.095,16), M.plastic);
  grip.rotation.z = Math.PI/2; grip.position.set(0.06,0.075,0); crankG.add(grip);
  // cabeza: placa + bloque dentado (la cuna toca en y=+0.063)
  saddleG = new THREE.Group(); jack.add(saddleG);
  const saddlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.03,0.26), M.frame);
  saddlePlate.position.y = 0.015; saddleG.add(saddlePlate);
  const saddleBlock = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.027,0.20), M.frame);
  saddleBlock.position.y = 0.0435; saddleG.add(saddleBlock);
  [-0.06,0,0.06].forEach(z=>{
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.006,0.02), M.steelDark);
    tooth.position.set(0, 0.060, z); saddleG.add(tooth);
  });
  [-0.055,0.055].forEach(z=>{
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.022), M.frame);
    lug.position.set(0, 0.0, z); saddleG.add(lug);
  });
  // auto: pivota sobre las ruedas izquierdas; el balancín (y local 0.2065) apoya en la cuna
  carPivot = new THREE.Group(); carPivot.position.set(0,0,-0.44); scene.add(carPivot);
  carG = buildCar(); carG.position.set(0,0,0.44); carPivot.add(carG);
  // llave de gancho del kit, recostada en el suelo
  wrenchG = buildWrench(); scene.add(wrenchG);
  // calcomanía 1.5 T en el brazo delantero superior
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.085,0.038),
    new THREE.MeshStandardMaterial({map:stickerTexture(), roughness:0.5, metalness:0.1}));
  sticker.position.set(0.01,0,0.0064); bars[1].add(sticker);
  jack.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  topPlat = saddlePlate;
  const vp = $('viewport');
  const resize=()=>{ const w=vp.clientWidth,h=vp.clientHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(vp); resize();
  vp.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;vp.setPointerCapture(e.pointerId);});
  vp.addEventListener('pointermove',e=>{ if(!dragging)return; yaw+=(e.clientX-px)*0.008; pitch=Math.min(1.3,Math.max(0.08,pitch+(e.clientY-py)*0.006)); px=e.clientX;py=e.clientY; });
  vp.addEventListener('pointerup',()=>dragging=false);
  vp.addEventListener('wheel',e=>{e.preventDefault();dist=Math.min(3.0,Math.max(0.5,dist+e.deltaY*0.001));},{passive:false});
}
/* Balanceo: el punto de la cuna (A, z 0.74 del pivote) debe alcanzar la altura S.
   A·cosθ + B·sinθ = S  →  θ = 2·atan((B + √(R²−S²)) / (A+S)) */
const ROLL_A=0.2065, ROLL_B=-0.74, ROLL_R=Math.hypot(ROLL_A,ROLL_B);
function rollAngle(S){
  const disc=ROLL_R*ROLL_R-S*S;
  if(!(disc>0)) return -Math.PI/2;
  return 2*Math.atan((ROLL_B+Math.sqrt(disc))/(ROLL_A+S));
}
function placeBar(m, x1,y1, x2,y2, z){
  m.position.set((x1+x2)/2,(y1+y2)/2,z);
  m.rotation.z = Math.atan2(y2-y1,x2-x1);
}
function renderJack(s){
  const L = sim.P.L, th = s.theta, h = s.h;
  ensureBars(L);
  const d = 2*L*Math.cos(th), yB = Y0, yT = Y0+h, yM = Y0+h/2;
  const ax=-d/2, bx=d/2, z1=0.07, z2=-0.07;
  placeBar(bars[0], 0,yB, ax,yM, z1); placeBar(bars[1], ax,yM, 0,yT, z1);
  placeBar(bars[2], 0,yB, bx,yM, z1); placeBar(bars[3], bx,yM, 0,yT, z1);
  placeBar(bars[4], 0,yB, ax,yM, z2); placeBar(bars[5], ax,yM, 0,yT, z2);
  placeBar(bars[6], 0,yB, bx,yM, z2); placeBar(bars[7], bx,yM, 0,yT, z2);
  // tornillo: núcleo + anillos de rosca + collarines
  screwG.position.set(0,yM,0);
  const span=Math.max(0.05,d-0.03);
  screwCore.scale.set(1,span,1);
  for(let i=0;i<threadRings.length;i++)
    threadRings[i].position.x=-span/2+(i+0.5)*(span/threadRings.length);
  threadSpin.rotation.x=s.phi;
  collarA.position.x=-d/2; collarB.position.x=d/2;
  // manivela gira con el tornillo
  crankG.position.set(d/2+0.02,yM,0); crankG.rotation.x=s.phi;
  // tornillería de pivotes
  boltO.position.set(0,yB,0); boltA.position.set(ax,yM,0);
  boltB.position.set(bx,yM,0); boltC.position.set(0,yT,0);
  // cabeza completa + auto (solo sube el lado del gato; el otro pivota en sus ruedas)
  saddleG.position.set(0,yT,0);
  carPivot.rotation.x = rollAngle(yT + 0.063);
  camera.position.set(dist*Math.cos(pitch)*Math.sin(yaw), dist*Math.sin(pitch)+0.32, dist*Math.cos(pitch)*Math.cos(yaw));
  camera.lookAt(0, 0.34+h*0.25, 0);
  renderer.render(scene,camera);
}

/* ---------- GRÁFICAS sincronizadas ---------- */
const COLORS = { sim:{h:'#38E1FF',w:'#8B5CF6',T:'#FFC24B',tau:'#34D399',phi:'#4C7DFF'}, csv:'#F59E0B' };
function drawChart(id, channels, tCur){
  const cv = $(id), ctx = cv.getContext('2d');
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(devicePixelRatio,2);
  if(cv.width!==W*dpr){cv.width=W*dpr;cv.height=H*dpr;}
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
  const pad={l:44,r:8,t:8,b:18}, iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  const tMax = sim.P.Tfin;
  let mn=Infinity,mx=-Infinity;
  channels.forEach(ch=>{
    const a = ch.data;
    for(let i=0;i<a.length;i+=4){ if(a[i]<mn)mn=a[i]; if(a[i]>mx)mx=a[i]; }
    if(ch.csv){ const c=ch.csv; for(let i=0;i<c.length;i+=4){ if(c[i]<mn)mn=c[i]; if(c[i]>mx)mx=c[i]; } }
  });
  if(!isFinite(mn)){mn=0;mx=1;} if(mx-mn<1e-9){mx=mn+1;}
  const mg=(mx-mn)*0.08; mn-=mg; mx+=mg;
  const X=t=>pad.l+(t/tMax)*iw, Y=v=>pad.t+ih-((v-mn)/(mx-mn))*ih;
  ctx.strokeStyle='rgba(120,150,255,.14)';ctx.fillStyle='#64749A';ctx.font='10px Inter';ctx.lineWidth=1;
  for(let g=0;g<=4;g++){ const v=mn+(mx-mn)*g/4, y=Y(v);
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillText(fmtTick(v),4,y+3); }
  for(let s=0;s<=6;s++){ const t=tMax*s/6; ctx.fillText(t.toFixed(0)+'s',X(t)-8,H-5); }
  channels.forEach(ch=>{
    ctx.strokeStyle=ch.color;ctx.lineWidth=2;ctx.beginPath();
    const a=ch.data;
    for(let i=0;i<a.length;i+=2){ const x=X(sim.t[i]),y=Y(a[i]); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
    ctx.stroke();
    if(ch.csv&&showCsv){ ctx.strokeStyle=COLORS.csv;ctx.lineWidth=1.6;ctx.setLineDash([5,4]);ctx.beginPath();
      const c=ch.csv, tt=ch.csvT||sim.t;
      let pen=false;
      for(let i=0;i<c.length;i+=2){ const xv=X(tt[i]),yv=Y(c[i]);
        if(!isFinite(xv)||!isFinite(yv)){ pen=false; continue; }
        if(!pen){ ctx.moveTo(xv,yv); pen=true; } else ctx.lineTo(xv,yv); }
      ctx.stroke();ctx.setLineDash([]); }
  });
  // cursor + puntos
  const cx=X(tCur);
  ctx.strokeStyle='rgba(234,240,255,.75)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(cx,pad.t);ctx.lineTo(cx,pad.t+ih);ctx.stroke();
  channels.forEach(ch=>{ const v=interp(sim.t,ch.data,tCur);
    ctx.fillStyle=ch.color;ctx.beginPath();ctx.arc(cx,Y(v),3.4,0,7);ctx.fill();
    ctx.fillStyle='#040816';ctx.beginPath();ctx.arc(cx,Y(v),1.4,0,7);ctx.fill(); });
}
function fmtTick(v){ const a=Math.abs(v); if(a>=1000)return v.toFixed(0); if(a>=10)return v.toFixed(1); if(a>=1)return v.toFixed(2); return v.toFixed(3); }
function interp(tt,aa,t){ const dt=sim.dt; let i=Math.floor(t/dt); i=Math.max(0,Math.min(aa.length-2,i)); const f=Math.max(0,Math.min(1,(t-tt[i])/dt)); return aa[i]*(1-f)+aa[i+1]*f; }

/* ---------- CSV Simulink ---------- */
function parseCSV(text){
  text = String(text).replace(/^\uFEFF/, '');
  const rawLines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if(rawLines.length<2) throw new Error('el archivo no tiene filas de datos');
  // delimitador: el que más columnas produzca en la primera línea
  const delim = [',',';','\t'].map(d=>({d, n:rawLines[0].split(d).length}))
    .sort((a,b)=>b.n-a.n)[0].d;
  const cells = s => s.split(delim).map(c=>{
    c = c.trim().replace(/^"|"$/g,'');
    if(delim !== ',' ) c = c.replace(/\s/g,'').replace(',','.'); // "0,5" → 0.5
    return c;
  });
  const head = cells(rawLines[0]);
  const hasHeader = head.some(c=>/[a-zA-Z°_µ]/.test(c));
  const cols = head.map(c=>c.toLowerCase());
  const find = (names)=>{ for(const n of names){ const i=cols.findIndex(c=>c.startsWith(n)); if(i>=0)return i; } return -1; };
  let it,itau,iphi,iw,ith,ih,iv,iT,itc;
  if(hasHeader){
    it=find(['t [','t(','"t"','time']); if(it<0){ const e=cols.indexOf('t'); if(e>=0)it=e; }
    itau=find(['tau_u','tau u','torque']); iphi=find(['phi']);
    iw=find(['omega','vel_ang']); ith=find(['theta']); ih=find(['h [','h(','altura']);
    iv=find(['v [','vel']); itc=find(['tau_c','tau c']);
    iT=-1;
    cols.forEach((c,i)=>{ if(/^\W*t\s*\[n/.test(c)||c==='traccion'||c==='tracción'||c==='tension'||c==='fuerza') iT=i; });
    if(it<0)it=0; if(itau<0)itau=1; if(iphi<0)iphi=2; if(iw<0)iw=3; if(ith<0)ith=4;
    if(ih<0)ih=5; if(iv<0)iv=6; if(iT<0)iT=7; if(itc<0)itc=8;
  } else { it=0;itau=1;iphi=2;iw=3;ith=4;ih=5;iv=6;iT=7;itc=8; }
  const ncols = head.length;
  const take = (r,i)=> (i<r.length && isFinite(r[i])) ? r[i] : NaN;
  const o={t:[],tau:[],phi:[],w:[],theta:[],h:[],v:[],T:[],Tc:[]};
  for(let i=hasHeader?1:0;i<rawLines.length;i++){
    const r=cells(rawLines[i]).map(Number);
    const t=take(r,it);
    if(!isFinite(t)) continue;
    const row=[t,take(r,itau),take(r,iphi),take(r,iw),take(r,ith),take(r,ih),take(r,iv),take(r,iT),take(r,itc)];
    if(!isFinite(row[5])&&!isFinite(row[3])&&!isFinite(row[7])&&!isFinite(row[2])) continue;
    o.t.push(row[0]);o.tau.push(row[1]);o.phi.push(row[2]);o.w.push(row[3]);o.theta.push(row[4]);
    o.h.push(row[5]);o.v.push(row[6]);o.T.push(row[7]);o.Tc.push(row[8]);
  }
  if(o.t.length===0){
    const prev=head.slice(0,9).join('|').slice(0,80);
    throw new Error('no se leyeron filas (delim="'+(delim==='\t'?'TAB':delim)+'", cols='+ncols+', encabezado="'+prev+'")');
  }
  const pack=a=>a.some(isFinite)?new Float64Array(a.map(v=>isFinite(v)?v:NaN)):null;
  o.t=new Float64Array(o.t);
  ['tau','phi','w','theta','h','v','T','Tc'].forEach(k=>{o[k]=pack(o[k]);});
  return o;
}
function updateValidation(){
  const tb=$('rmseBody');
  if(!csv || !csv.t || csv.t.length===0){ tb.innerHTML=['h [m]','ω [rad/s]','T [N]','φ [rad]'].map(k=>`<tr><td>${k}</td><td>—</td><td><span class="pill warn">sin CSV</span></td></tr>`).join('');
    $('csvInfo').textContent='Sin CSV: la curva sólida es la réplica del .slx (Euler implícito, 0.01 s).'; return; }
  const defs=[['h [m]','h',0.004],['ω [rad/s]','w',0.05],['T [N]','T',30],['φ [rad]','phi',0.15]];
  tb.innerHTML = defs.map(([lbl,key,tol])=>{
    if(!csv[key]) return `<tr><td>${lbl}</td><td>—</td><td><span class="pill warn">sin datos</span></td></tr>`;
    let s=0,n=0;
    for(let i=0;i<csv.t.length;i+=5){ const t=csv.t[i]; if(t>sim.P.Tfin)break;
      const b=csv[key][i]; if(!isFinite(b))continue;
      const a=interp(sim.t,sim[key],t); if(!isFinite(a))continue;
      const d=a-b; s+=d*d; n++; }
    if(n===0) return `<tr><td>${lbl}</td><td>—</td><td><span class="pill warn">sin datos</span></td></tr>`;
    const r=Math.sqrt(s/n), ok=r<tol;
    return `<tr><td>${lbl}</td><td>${r.toPrecision(3)}</td><td><span class="pill ${ok?'ok':'bad'}">${ok?'coincide':'difiere'}</span></td></tr>`;
  }).join('');
  const f=(v,d)=>isFinite(v)?v.toFixed(d):'—';
  const tEnd=csv.t[csv.t.length-1];
  const hEnd=csv.h?csv.h[csv.h.length-1]:NaN;
  const hSim=isFinite(tEnd)?interp(sim.t,sim.h,Math.min(sim.P.Tfin,tEnd)):NaN;
  $('csvInfo').innerHTML=`CSV: <b>${csv.t.length}</b> filas · t ${f(csv.t[0],2)}→${f(tEnd,2)} s · h ${f(hEnd,3)} m vs gemelo ${f(hSim,3)} m.`;
}

/* ---------- UI ---------- */
function bindSlider(id, key, fmt, parse){
  $(id).addEventListener('input', e=>{
    params[key]=parse(e.target.value);
    $(id.replace('s','v')).textContent=fmt(params[key]);
    resim();
  });
}
function initUI(){
  bindSlider('sM','M',v=>v.toFixed(0)+' kg',Number);
  bindSlider('sL','L',v=>v.toFixed(2)+' m → hmax '+(2*v*Math.sin(65*Math.PI/180)).toFixed(2)+' m',Number);
  bindSlider('sb','b',v=>v.toFixed(2)+' N·m·s/rad',Number);
  bindSlider('sT','Tau0',v=>v.toFixed(1)+' N·m',Number);
  bindSlider('sp','p',v=>(v*1000).toFixed(1)+' mm',v=>Number(v)/1000);
  bindSlider('smu','mu',v=>v.toFixed(3),Number);
  $('btnReset').onclick=()=>{ params={M:400,L:0.20,b:2.0,Tau0:22,p:0.003,mu:0.15};
    $('sM').value=400;$('sL').value=0.20;$('sb').value=2;$('sT').value=22;$('sp').value=3;$('smu').value=0.15;
    $('vM').textContent='400 kg';$('vL').textContent='0.20 m';$('vb').textContent='2.00 N·m·s/rad';$('vT').textContent='22.0 N·m';$('vp').textContent='3.0 mm';$('vmu').textContent='0.15';
    resim(); };
  $('btnPlay').onclick=()=>{ if(!playing && tPlay>=sim.P.Tfin-1e-9){ tPlay=0; } playing=!playing; $('btnPlay').textContent=playing?'Pausar':'Reanudar'; };
  $('btnRestart').onclick=()=>{ tPlay=0; playing=true; $('btnPlay').textContent='Pausar'; };
  $('scrub').addEventListener('input',e=>{ tPlay=Number(e.target.value); });
  $('speed').onchange=e=>speed=Number(e.target.value);
  $('btnAuto').onclick=e=>{ autoDemo=!autoDemo; e.target.textContent=autoDemo?'Detener demo':'Demo auto'; if(autoDemo){tPlay=0;playing=true;} };
  $('csvFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(!f)return;
    $('csvName').textContent=f.name;
    const r=new FileReader(); r.onload=()=>{ try{csv=parseCSV(r.result);updateValidation();}catch(err){csv=null;updateValidation();alert('No se pudo leer el CSV: '+err.message);} }; r.readAsText(f); });
  $('btnSample').onclick=async()=>{ try{ const r=await fetch('data/datos_mecanismo.csv'); if(!r.ok)throw new Error('archivo no encontrado'); csv=parseCSV(await r.text()); $('csvName').textContent='datos_mecanismo.csv (incluido)'; updateValidation(); }catch(e){ alert('No se pudo cargar data/datos_mecanismo.csv (abre con servidor local o usa Examinar).'); } };
  $('btnClearCsv').onclick=()=>{ csv=null; $('csvFile').value=''; $('csvName').textContent='Ningún archivo seleccionado'; updateValidation(); };
  $('chkCsv').onchange=e=>showCsv=e.target.checked;
  $('btnExport').onclick=()=>{
    let s='t [s],tau_u [N*m],phi [rad],omega [rad/s],theta [rad],h [m],v [m/s],T [N],tau_c [N*m]\n';
    for(let i=0;i<sim.t.length;i++) s+=`${sim.t[i].toFixed(6)},${sim.tau[i].toFixed(6)},${sim.phi[i].toFixed(6)},${sim.w[i].toFixed(6)},${sim.theta[i].toFixed(6)},${sim.h[i].toFixed(6)},${sim.v[i].toFixed(6)},${sim.T[i].toFixed(6)},${sim.Tc[i].toFixed(6)}\n`;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([s],{type:'text/csv'})); a.download='datos_mecanismo.csv'; a.click();
  };
}

/* ---------- bucle ---------- */
let last=performance.now();
function frame(now){
  const dtR=Math.min(0.1,(now-last)/1000); last=now;
  if(autoDemo){ // perturba la masa para exhibir reacción inmediata
    const m=400+250*Math.sin(now/4000);
    params.M=m; $('sM').value=m; $('vM').textContent=m.toFixed(0)+' kg'; resim();
  }
  if(playing){ tPlay+=dtR*speed; if(tPlay>=sim.P.Tfin){tPlay=sim.P.Tfin;playing=false;$('btnPlay').textContent='Repetir';} }
  $('scrub').value=tPlay; $('scrub').max=sim.P.Tfin;
  const s=GatoPhysics.sampleAt(sim,tPlay);
  // HUD + lecturas
  $('hudT').textContent=s.t.toFixed(2)+' s';$('hudTh').textContent=(s.theta*180/Math.PI).toFixed(1)+'°';$('hudH').textContent=s.h.toFixed(3)+' m';
  $('clock').textContent=s.t.toFixed(2)+' / '+sim.P.Tfin.toFixed(1)+' s';
  $('kT').textContent=s.t.toFixed(2)+' s';$('kTau').textContent=s.tau.toFixed(1)+' N·m';
  $('kPhi').textContent=s.phi.toFixed(1)+' rad';$('kW').textContent=s.w.toFixed(2)+' rad/s';
  $('kTh').textContent=(s.theta*180/Math.PI).toFixed(2)+'°';$('kH').textContent=s.h.toFixed(3)+' m';
  $('kV').textContent=(s.v*1000).toFixed(1)+' mm/s';$('kTT').textContent=s.T.toFixed(0)+' N';
  $('kTc').textContent=s.Tc.toFixed(2)+' N·m';$('kRev').textContent=(s.phi/(2*Math.PI)).toFixed(1);
  $('kRoll').textContent=(-rollAngle(Y0+s.h+0.063)*180/Math.PI).toFixed(1)+'°';
  try{ renderJack(s); }catch(e){ if(!window.__gemeloErr){ window.__gemeloErr=String(e&&e.message||e); console.error('[gemelo3d]',e); } }
  drawChart('cH',[{data:sim.h,color:COLORS.sim.h,csv:csv&&csv.h,csvT:csv&&csv.t}],tPlay);
  drawChart('cW',[{data:sim.w,color:COLORS.sim.w,csv:csv&&csv.w,csvT:csv&&csv.t}],tPlay);
  drawChart('cT',[{data:sim.T,color:COLORS.sim.T,csv:csv&&csv.T,csvT:csv&&csv.t}],tPlay);
  drawChart('cTau',[{data:sim.tau,color:COLORS.sim.tau,csv:csv&&csv.tau,csvT:csv&&csv.t},{data:sim.Tc,color:COLORS.sim.phi,csv:csv&&csv.Tc,csvT:csv&&csv.t}],tPlay);
  requestAnimationFrame(frame);
}

/* ---------- init ---------- */
try{ initThree(); }catch(e){ $('three').innerHTML='<p class="note" style="padding:20px">3D no disponible (sin WebGL/CDN). Las gráficas y sliders siguen funcionando.</p>'; }
initUI(); resim();
// autocargar CSV incluido si hay servidor
fetch('data/datos_mecanismo.csv').then(r=>{ if(!r.ok)throw 0; return r.text(); }).then(t=>{ csv=parseCSV(t); updateValidation(); }).catch(()=>{});
requestAnimationFrame(frame);
})();
