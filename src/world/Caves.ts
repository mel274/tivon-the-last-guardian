import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldContext, LocalText } from './types';
import { horseAndRider } from './horse';
import { worldMaterial } from './materials';

/** Interpretation-space catacombs and an explicitly fictional underground network. */
export function buildCaves(ctx: WorldContext): void {
  const cave = new THREE.Group(); cave.name = 'Catacombs • fictional connected plan';
  ctx.scene.add(cave); ctx.groups.caves = cave;
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, roughness = .96) => { let m = materials.get(color + roughness); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness }); materials.set(color + roughness, m); } return m; };
  const texture = (color: string, mortar = false) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!; c.fillStyle = color; c.fillRect(0,0,256,256);
    let seed=28674; const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<5500;i++){c.fillStyle=`rgba(${rand()>.5?'240,225,185':'46,43,32'},${rand()*.13})`;c.fillRect(rand()*256,rand()*256,rand()*9+1,rand()*3+1);}
    c.strokeStyle='rgba(32,36,31,.16)';c.lineWidth=1.5;
    for(let i=0;i<12;i++){c.beginPath();const y=rand()*256;c.moveTo(0,y);for(let x=0;x<256;x+=24)c.lineTo(x,y+rand()*8-4);c.stroke();}
    if(mortar){c.strokeStyle='rgba(31,29,20,.3)';for(let y=0;y<256;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(256,y);c.stroke();for(let x=(y%128?48:0);x<256;x+=96){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+64);c.stroke();}}}
    const t = new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
  };
  // World-projected stone so long merged walls keep true texture scale.
  const limestone=worldMaterial('cavestone',{color:'#d8cfb6',scale:2.4,roughness:1});
  const carved=worldMaterial('limestone',{color:'#e6dcc4',scale:2,roughness:1});
  const darkStone=worldMaterial('cavestone',{color:'#7c8379',scale:2.2,roughness:1});
  const floorMaterial=worldMaterial('soil',{color:'#a49d8a',scale:2.6,roughness:1});
  void texture;
  const cube=new THREE.BoxGeometry(1,1,1), sphereGeo=new THREE.SphereGeometry(1,9,7);
  const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,shadow=true)=>{const mesh=new THREE.Mesh(cube,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=shadow;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const sphere=(parent:THREE.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(sphereGeo,m);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const cylinder=(parent:THREE.Object3D,x:number,y:number,z:number,r:number,h:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const collision=(x:number,y:number,z:number,w:number,h:number,d:number,gate?:string)=>ctx.colliders.push({minX:x-w/2,maxX:x+w/2,minY:y-h/2,maxY:y+h/2,minZ:z-d/2,maxZ:z+d/2,gate});
  const target=(id:string,parent:THREE.Object3D,x:number,y:number,z:number,label:LocalText,radius=3.2)=>{const o=new THREE.Object3D();o.position.set(x,y,z);parent.add(o);o.userData.interactionId=id;ctx.interactables.push({id,object:o,label,radius});return o;};
  const sign=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,lines:string[],color='#c8c0a0',rotation=Math.PI)=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*h/w);const c=canvas.getContext('2d')!;
    c.fillStyle=color;c.fillRect(0,0,canvas.width,canvas.height);c.strokeStyle='#6f735f';c.lineWidth=5;c.strokeRect(13,13,998,canvas.height-26);c.textAlign='center';c.textBaseline='middle';c.fillStyle='#343c33';
    lines.forEach((line,i)=>{c.direction=/[א-ת]/.test(line)?'rtl':'ltr';c.font=`${i===0?'600 ':''}${canvas.height/(lines.length+1)*.68}px Arial`;c.fillText(line,512,(i+1)*canvas.height/(lines.length+1),956);});
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:1,side:THREE.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;parent.add(mesh);return mesh;
  };
  // Carved symbols for the three-seal puzzle: lamp, tree, wave — drawn once, reused on the
  // panels, the light-revealed mark and the seals so the connection reads at a glance.
  const symbolCanvas=(kind:'lamp'|'tree'|'wave',numeral:string,bg:string,ink:string)=>{
    const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!;
    g.fillStyle=bg;g.fillRect(0,0,256,256);g.strokeStyle=ink;g.fillStyle=ink;g.lineWidth=10;g.lineCap='round';g.lineJoin='round';
    if(kind==='lamp'){g.beginPath();g.ellipse(118,150,62,28,0,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(176,146);g.lineTo(206,128);g.stroke();g.beginPath();g.moveTo(206,118);g.quadraticCurveTo(190,88,206,58);g.quadraticCurveTo(222,88,206,118);g.fill();g.beginPath();g.arc(98,148,9,0,7);g.fill();}
    else if(kind==='tree'){g.beginPath();g.moveTo(128,200);g.lineTo(128,120);g.stroke();g.beginPath();g.arc(128,92,46,0,Math.PI*2);g.stroke();for(const dx of[-34,0,34]){g.beginPath();g.moveTo(128,196);g.quadraticCurveTo(128+dx*.5,212,128+dx,222);g.stroke();}}
    else{for(let k=0;k<3;k++){g.beginPath();for(let x=36;x<=220;x+=4){const y=90+k*40+Math.sin((x-36)/184*Math.PI*3)*14;x===36?g.moveTo(x,y):g.lineTo(x,y);}g.stroke();}}
    if(numeral){g.font='700 44px Georgia';g.textAlign='center';g.fillText(numeral,128,46);}
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
  };
  const clueMarker=(id:string,x:number,y:number,z:number)=>{
    const g=new THREE.Group();g.position.set(x,y,z);g.name=`clue_${id}`;cave.add(g);ctx.groups[`clue_${id}`]=g;
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(.13,0),new THREE.MeshStandardMaterial({color:'#fff1c2',emissive:'#ffd36b',emissiveIntensity:2.2,roughness:.3}));g.add(m);
    const halo=new THREE.PointLight('#ffd98a',1.4,5,2);g.add(halo);
  };
  const glow=(x:number,y:number,z:number,color:string,intensity:number,distance=11)=>{const light=new THREE.PointLight(color,intensity,distance,2);light.position.set(x,y,z);cave.add(light);ctx.lights.push(light);return light;};
  const lamp=(x:number,z:number,color='#ddc692',intensity=2.8)=>{
    box(cave,x,.24,z,.28,.45,.25,mat('#363c34',.6));const bulb=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.45});box(cave,x,.33,z-.135,.17,.2,.02,bulb,false);glow(x,.65,z-.2,color,intensity,12);
  };

  // An occupancy grid generates boundary walls only, so every drawn doorway is
  // traversable and side chambers genuinely reconnect with the main gallery.
  const cells=new Map<string,{x:number;z:number}>();
  const fill=(x0:number,x1:number,z0:number,z1:number)=>{for(let x=x0;x<=x1;x+=2)for(let z=z0;z<=z1;z+=2)cells.set(`${x},${z}`,{x,z});};
  fill(124,128,90,98); fill(120,132,98,110);
  fill(108,144,110,114); fill(102,114,116,126);fill(138,150,116,126);
  fill(124,128,114,152);fill(106,110,126,148);fill(142,146,126,148);
  fill(102,114,136,148);fill(120,132,128,146);fill(138,150,136,148);fill(108,144,140,144);
  fill(150,160,120,122);fill(156,160,124,128); // quiet archaeological dead end
  fill(120,132,152,164);fill(124,128,164,188);
  fill(116,136,188,204);fill(124,128,204,214);
  fill(112,140,214,236);fill(124,128,236,246);fill(120,132,238,246);fill(124,128,246,260);
  const ceiling=(z:number)=>z<170?4.35:z<208?5.5:z<238?7.2:4.35;
  cells.forEach(({x,z})=>{
    const h=ceiling(z), m=z<170?limestone:darkStone;
    box(cave,x,-.17,z,2,.3,2,floorMaterial,false);box(cave,x,h+.15,z,2.03,.3,2.03,m);
    ctx.grounds.push({minX:x-1,maxX:x+1,minZ:z-1,maxZ:z+1,y:0});
    for(const [dx,dz] of [[-2,0],[2,0],[0,-2],[0,2]]){
      if(cells.has(`${x+dx},${z+dz}`))continue;
      // The first and final tunnel mouths remain open to the outside world.
      if(z===90&&dz===-2)continue;
      const wx=x+dx/2,wz=z+dz/2,w=dx?.34:2.2,d=dz?.34:2.2;
      box(cave,wx,h/2,wz,w,h,d,m);collision(wx,h/2,wz,w,h,d);
      if(z<170){box(cave,wx,.3,wz,dx?.42:2.2,.6,dz?.42:2.2,carved);box(cave,wx,h-.35,wz,dx?.43:2.2,.28,dz?.43:2.2,carved);}
    }
  });
  const gate=(flag:string,z:number,w=5.7)=>{
    const g=new THREE.Group();g.name=`gate_${flag}`;g.position.set(126,0,z);cave.add(g);ctx.groups[`gate_${flag}`]=g;
    box(g,0,2.1,0,w,4.2,.4,carved);for(const x of [-w/2+.4,w/2-.4])box(g,x,2.1,-.28,.22,3.7,.14,limestone);
    collision(126,2.1,z,w,4.2,.45,flag);return g;
  };
  const entryGate=gate('cavesEntered',93);sign(entryGate,0,1.8,-.24,3.1,1.2,['בית שערים','מרחב פרשנות ארכאולוגי','ARCHAEOLOGICAL INTERPRETATION']);
  const hiddenGate=gate('hiddenOpened',167);sign(hiddenGate,0,2.15,-.26,2.8,1.1,['אור • שורש • מים','תצרף בדיוני','LIGHT · ROOT · WATER']);
  const exitGate=gate('spiritFreed',249);sign(exitGate,0,1.8,-.26,2.6,.85,['עוד לא הגיע הבוקר','THE DAWN IS STILL WAITING']);

  // Carved courtyard façade with three arches, after the arched fronts of Beit She'arim's
  // caves (e.g. the Cave of Coffins). The layout beyond is not a survey of the real park.
  box(cave,126,-.09,81.5,15,.2,15,floorMaterial,false);ctx.grounds.push({minX:118.5,maxX:133.5,minZ:74,maxZ:89,y:.01});
  for(const [a,b] of [[102,123.1],[128.9,150]]){box(cave,(a+b)/2,4.6,89.4,b-a,9.2,1.2,carved);collision((a+b)/2,4.6,89.4,b-a,9.2,1.2);}
  box(cave,126,6.9,89.4,5.8,4.6,1.2,carved);box(cave,126,9.35,89.4,48,.5,1.6,limestone);
  for(const ax of [116,126,136]){
    for(const sd of [-1,1]){box(cave,ax+sd*2.65,2.3,88.6,.7,4.6,.5,limestone);collision(ax+sd*2.65,2.3,88.6,.7,4.6,.5);}
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.65,.3,6,20,Math.PI),limestone);ring.position.set(ax,4.6,88.5);ring.castShadow=true;cave.add(ring);
    if(ax!==126){box(cave,ax,2.3,88.78,4.6,4.6,.16,darkStone,false);const tym=new THREE.Mesh(new THREE.CircleGeometry(2.35,20,0,Math.PI),darkStone);tym.position.set(ax,4.6,88.7);tym.rotation.y=Math.PI;cave.add(tym);}
  }
  sign(cave,126,7.9,88.75,6.4,.8,['בית שערים · BEIT SHE’ARIM'],'#c3bb9c');
  target('cave_entrance',cave,126,1.55,90,{he:'שער הקטקומבות',en:'Catacomb entrance'},4);
  sign(cave,116,1.7,88.6,2.6,1.25,['אתר אמיתי. מסלול בדיוני.','Real heritage. Fictional route.','Respect the stones. Leave no trace.'],'#d5ccb0');
  lamp(121.5,88.1,'#e6c27a',3.4);lamp(130.5,88.1,'#e6c27a',3.4);

  const sarcophagus=(x:number,z:number,angle=0)=>{
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;cave.add(g);
    box(g,0,.51,0,1.45,.92,2.65,carved);box(g,0,1.03,0,1.6,.15,2.82,limestone);box(g,0,1.14,0,1.3,.09,2.6,carved);
    for(const side of [-1,1]){box(g,side*.45,.5,-1.34,.18,.6,.06,limestone);sphere(g,side*.43,.63,-1.39,.14,.14,.035,limestone);}
    collision(x,.58,z,angle?2.85:1.6,1.16,angle?1.6:2.85);
  };
  sarcophagus(121,104);sarcophagus(131,104);sarcophagus(103,120);sarcophagus(113,120);sarcophagus(139,120);sarcophagus(149,120);
  sarcophagus(103,143);sarcophagus(149,143);sarcophagus(121,133);sarcophagus(131,143);sarcophagus(158,126,Math.PI/2);
  for(const [x,z] of [[120,99],[132,109],[102,117],[114,125],[138,117],[150,125],[103,137],[113,147],[139,137],[149,147],[120,154],[132,163]])lamp(x,z);
  sign(cave,132.62,2.2,104,3.2,1.2,['עיר המתים של בית שערים','A Jewish necropolis of the Roman era','The chambers here are a fictional plan.'],'#c8c0a0',-Math.PI/2);
  sign(cave,158,2.15,128.5,3,.95,['משמרים את העדות','Study the carvings; do not disturb burials.']);
  // The explorer's chalk board: what opens the sealed door, in four steps.
  box(cave,119.35,2.05,104,.08,2.35,3.65,mat('#3a3426'),false);
  sign(cave,119.42,2.05,104,3.5,2.2,['איך נפתחת דלת האבן?','1 · קראו את הלוחות I · II · III','2 · אספו שני חצאי מפה','3 · פנס (F) מול הקיר הכהה','4 · לחצו על החותמות לפי הסדר','READ I-II-III · 2 MAP HALVES · FLASHLIGHT · SEALS'],'#d9d0b4',Math.PI/2);
  sign(cave,123.3,3.5,111.3,2.2,.62,['→ לוח I · מערב','PANEL I · WEST →'],'#d6ccad');
  sign(cave,128.7,3.5,111.3,2.2,.62,['לוח II · מזרח ←','← PANEL II · EAST'],'#d6ccad');
  sign(cave,126,4.05,111.3,2.6,.5,['↑ לוח III · החותמות · STRAIGHT ON'],'#d6ccad');
  sign(cave,126,3.5,147.4,2.6,.6,['↑ החותמות והדלת','SEALS & DOOR ↑'],'#d6ccad');
  const inscription=(id:string,x:number,z:number,he:string,en:string,number:string,kind:'lamp'|'tree'|'wave')=>{
    box(cave,x,1.95,z+.07,2.8,3.1,.14,carved);
    const panel=sign(cave,x,1.35,z,2.6,1.15,[`לוח ${number} · ${he}`,en,'תצרף בדיוני · FICTIONAL REPLICA']);
    const icon=new THREE.Mesh(new THREE.PlaneGeometry(1.15,1.15),new THREE.MeshStandardMaterial({map:symbolCanvas(kind,number,'#bdb390','#3a3426'),roughness:1}));icon.position.set(x,2.75,z-.01);icon.rotation.y=Math.PI;cave.add(icon);
    target(id,cave,x,1.9,z-.08,{he:`לוח ${number} · ${he}`,en:`Panel ${number} · ${en}`},3.4);
    clueMarker(id,x,3.75,z-.3);
    return panel;
  };
  inscription('inscription_a',108,125.7,'החותם הראשון: נר','FIRST SEAL: LAMP','I','lamp');
  inscription('inscription_b',144,125.7,'החותם השני: עץ','SECOND SEAL: TREE','II','tree');
  inscription('inscription_c',126,136.2,'החותם השלישי: גל','THIRD SEAL: WAVE','III','wave');
  box(cave,145,1.6,147.78,2.8,1.5,.12,darkStone);
  sign(cave,145,.62,147.7,2.3,.3,['קיר כהה · שריטות חיוורות · DARK WALL'],'#6c705f');
  const lightMark=new THREE.Group();lightMark.position.set(145,1.65,147.7);cave.add(lightMark);ctx.groups.light_mark=lightMark;
  (['lamp','tree','wave'] as const).forEach((k,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(.75,.75),new THREE.MeshStandardMaterial({map:symbolCanvas(k,'','#1c2420','#9fe3c8'),emissive:'#ffffff',emissiveMap:symbolCanvas(k,'','#000000','#7fe0b8'),emissiveIntensity:1.4,roughness:.6}));m.position.set(-.85+i*.85,0,-.08);m.rotation.y=Math.PI;lightMark.add(m);});
  target('light_mark',cave,145,1.6,147.6,{he:'קיר כהה עם שריטות',en:'Dark wall with faint scratches'},3.4);
  clueMarker('light_mark',145,2.9,147.3);
  const fragment=(id:string,x:number,z:number,label:string)=>{
    box(cave,x,.55,z,1.4,1.1,.85,darkStone);const paper=box(cave,x,1.13,z,.8,.025,.5,mat('#d9c99d'));paper.rotation.y=.18;
    for(let i=0;i<5;i++)box(cave,x-.3+i*.13,1.15,z,.018,.008,.3,mat('#707451'));
    target(id,cave,x,1.15,z,{he:`חצי מפה ${label}`,en:`Map half ${label}`},3.2);clueMarker(id,x,1.9,z);
    lamp(x+1,z+.5,'#c4c8a0',2);
  };
  fragment('map_a',108,146.4,'A');fragment('map_b',126,130,'B');
  const mechanism=new THREE.Group();mechanism.position.set(126,0,160);cave.add(mechanism);ctx.groups.mechanism=mechanism;
  box(mechanism,0,.65,0,3.3,1.3,1.25,carved);
  (['lamp','tree','wave'] as const).forEach((k,i)=>{
    const seal=new THREE.Group();seal.position.set((i-1)*1,1,-.66);mechanism.add(seal);ctx.groups[`seal_${i}`]=seal;
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.1,20),mat('#7f8b73',.6));rim.rotation.x=Math.PI/2;seal.add(rim);
    const face=new THREE.MeshStandardMaterial({map:symbolCanvas(k,['I','II','III'][i],'#b7bea2','#2f3a2f'),emissive:'#ffcf73',emissiveIntensity:0,roughness:.7});
    const disc=new THREE.Mesh(new THREE.CircleGeometry(.36,24),face);disc.position.z=-.06;disc.rotation.y=Math.PI;seal.add(disc);seal.userData.face=face;
  });
  sign(mechanism,0,1.78,-.64,3.1,.4,['נר · עץ · גל — לפי הלוחות I · II · III'],'#c9c0a2');
  sign(mechanism,0,1.72,.25,3.1,.55,['הסדר נשמר בזיכרון · REMEMBER THE ORDER']);
  collision(126,.65,160,3.3,1.3,1.25);target('mechanism',mechanism,0,1,-.75,{he:'מנגנון שלוש החותמות',en:'Three-seal mechanism'},3.5);
  target('hidden_gate',cave,126,1.8,165.8,{he:'המעבר החתום',en:'Sealed passage'},3.5);

  // The shift in rock, ceiling height and light marks the fictional hidden caves.
  for(let z=174;z<207;z+=8){
    for(const side of [-1,1]){
      const x=126+side*(z<188?2.1:8.9);const crystal=sphere(cave,x,.6,z,.65,1.7,.9,darkStone);crystal.rotation.z=side*.2;
      if(z>=188)collision(x,.65,z,1.1,1.3,1.5);
    }
  }
  lamp(124.4,176,'#7caaa2',1.1);lamp(118,194,'#709c95',1.8);lamp(134,202,'#79958e',1.3);
  sign(cave,126,2.2,186.4,3.3,.95,['מכאן והלאה — דמיון','BEYOND THIS POINT — A FICTIONAL CAVE NETWORK'],'#939e8a');
  box(cave,120,.37,199,1.2,.7,.9,mat('#645942'));box(cave,120,.75,199,.6,.03,.4,mat('#d0bf94'));
  target('explorer_note',cave,120,1,199,{he:'מחברת של חוקר בדיוני',en:'A fictional explorer’s notebook'},3.2);
  // Dark fallen column fragments create cover and readable movement routes.
  for(const [x,z] of [[118,218],[134,218],[118,232],[134,232]]){
    box(cave,x,.8,z,1.4,1.6,1.5,darkStone);box(cave,x,1.67,z,1.7,.2,1.8,limestone);collision(x,.83,z,1.7,1.8,1.8);
  }

  const ghost=new THREE.Group();ghost.position.set(126,.1,226);ghost.name='The unnamed guardian';cave.add(ghost);ctx.groups.ghost=ghost;
  const spectral=new THREE.MeshStandardMaterial({color:'#b8d9cf',emissive:'#78b8a4',emissiveIntensity:.8,transparent:true,opacity:.43,roughness:.3,depthWrite:false});
  ghost.add(horseAndRider(spectral));const spectralLight=new THREE.PointLight('#9cd8ca',4,11,2);spectralLight.position.set(0,2,0);ghost.add(spectralLight);ctx.lights.push(spectralLight);
  target('guardian',cave,126,1.7,218,{he:'ההד שבחשכה',en:'The presence in the dark'},3.8);
  sign(cave,126,1.5,215.6,2.8,.9,['הקשיבו לפני שתתקדמו','LISTEN BEFORE YOU APPROACH'],'#9eaa94');

  const memory=(id:string,x:number,z:number,kind:'lantern'|'photo'|'letter')=>{
    const g=new THREE.Group();g.position.set(x,0,z);cave.add(g);ctx.groups[id]=g;box(g,0,.5,0,1.15,1,.95,carved);
    if(kind==='lantern'){
      box(g,0,1.32,0,.36,.48,.32,mat('#697969',.5));box(g,0,1.32,-.17,.21,.28,.015,new THREE.MeshStandardMaterial({color:'#d4d3a5',emissive:'#9dba8e',emissiveIntensity:.35}));cylinder(g,0,1.62,0,.22,.08,mat('#697969',.5));
      const handle=new THREE.Mesh(new THREE.TorusGeometry(.15,.025,5,12),mat('#697969',.5));handle.position.set(0,1.8,0);g.add(handle);
    } else if(kind==='photo') {box(g,0,1.31,0,.64,.5,.06,mat('#725d3e'));sign(g,0,1.31,-.04,.54,.39,['זיכרון העמק','FICTIONAL MEMENTO'],'#cabd99');}
    else {box(g,0,1.03,0,.67,.025,.42,mat('#cbbb96'));for(let i=0;i<5;i++)box(g,-.02,1.048,-.13+i*.06,.44,.005,.009,mat('#645f44'));}
    target(id,g,0,1.2,0,{he:kind==='lantern'?'פנס השומר':kind==='photo'?'תמונת העמק':'מכתב שלא נשלח',en:kind==='lantern'?'The watchman’s lantern':kind==='photo'?'A picture of the valley':'An unsent letter'},3.2);
    glow(x,2.2,z,'#91b5a1',2,8);
  };
  memory('memory_lantern',114,224,'lantern');memory('memory_photo',138,224,'photo');memory('memory_letter',126,234,'letter');
  const oath=new THREE.Group();oath.position.set(126,0,240);cave.add(oath);ctx.groups.oath=oath;
  box(oath,0,.55,0,3,1.1,1.2,carved);sign(oath,0,1.37,.35,3,.6,['לשמור על החיים, לא על הפחד','PROTECT LIFE. LET FEAR GO.'],'#b9c3a7');
  for(const x of [-1,0,1]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.22,.025,5,16),mat('#afbd91',.5));ring.rotation.x=-Math.PI/2;ring.position.set(x,1.14,0);oath.add(ring);}
  target('oath',oath,0,1.2,-.65,{he:'מקום הזיכרון',en:'The place of remembrance'},3.4);collision(126,.55,240,3,1.1,1.2);
  const treasure=new THREE.Group();treasure.position.set(126,0,244.5);cave.add(treasure);ctx.groups.treasure=treasure;
  box(treasure,0,.52,0,2.1,1,1.3,mat('#726347'));box(treasure,0,1.05,0,2.2,.12,1.4,mat('#8b825d'));
  for(let i=0;i<5;i++)box(treasure,-.7+i*.35,1.17,0,.22,.13,.55,mat(['#9e9c77','#c4b48a','#6f836e'][i%3]));
  target('treasure',treasure,0,1.2,0,{he:'ארכיון העמק',en:'The valley archive'},3.4);collision(126,.55,244.5,2.2,1.1,1.4);

  // The exit: an old stairway climbing out of the hill. Taking it brings the player up to the
  // Alexander Zaid memorial on Sheikh Abreik at sunrise (handled by the game on "finish").
  const overlook=new THREE.Group();overlook.position.set(126,0,255);cave.add(overlook);ctx.groups.overlook=overlook;
  for(let i=0;i<14;i++)box(overlook,0,.12+i*.24,.6+i*.3,3.8,.24+i*.48,.3,limestone);
  glow(126,4,259,'#ffd9a0',3.2,10);
  sign(overlook,0,2.6,-.2,3.2,.65,['אל אור היום','UP TO DAYLIGHT'],'#e1d5b4');
  target('overlook',overlook,0,1.5,-.4,{he:'מדרגות אל אור היום',en:'Stairs up to daylight'},4.2);

  // Merge static cave meshes by material; gates, relics, horseman and light-mark
  // group remain separate so the runtime can animate them or hide opened gates.
  cave.updateWorldMatrix(true,true);
  const buckets=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];meshes:THREE.Mesh[];shadow:boolean}>();
  cave.children.forEach(child=>{
    if(!(child instanceof THREE.Mesh)||Array.isArray(child.material)||child.material.transparent)return;
    const key=child.material.uuid+child.castShadow;let bucket=buckets.get(key);if(!bucket){bucket={material:child.material,geometries:[],meshes:[],shadow:child.castShadow};buckets.set(key,bucket);}
    const geo=child.geometry.clone().applyMatrix4(child.matrix);if(!geo.getAttribute('uv'))geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count*2),2));bucket.geometries.push(geo);bucket.meshes.push(child);
  });
  buckets.forEach(bucket=>{if(bucket.geometries.length<2){bucket.geometries.forEach(g=>g.dispose());return;}const geo=mergeGeometries(bucket.geometries,false);bucket.geometries.forEach(g=>g.dispose());if(!geo)return;const mesh=new THREE.Mesh(geo,bucket.material);mesh.castShadow=bucket.shadow;mesh.receiveShadow=true;cave.add(mesh);bucket.meshes.forEach(m=>m.removeFromParent());});
}
