'use client';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FACE, COLORS, dot, cross, moveSpec, type Vec, type Piece, type Face } from '@/lib/cube/model';
import { getState, patch, subscribe, setAnimator, perform, selectSticker, cameraActions, notify } from '@/lib/cube/store';
import { paintSticker } from '@/lib/cube/appearance';

interface ComponentPart {object:T.Object3D; base:T.Vector3; direction:T.Vector3; amount:number; magnet?:boolean}
interface ModelPiece {root:T.Group; parts:ComponentPart[]; source:Piece}
const v3=(v:Vec)=>new T.Vector3(...v);
function orient(normal:T.Vector3){return new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),normal.clone().normalize());}
function basisQuaternion(p:Piece){return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(v3(p.basis[0]),v3(p.basis[1]),v3(p.basis[2])));}

export default function Viewport(){
  const host=useRef<HTMLDivElement>(null),[error,setError]=useState('');
  useEffect(()=>{
    const el=host.current!;let disposed=false,frame=0;
    let renderer:T.WebGLRenderer;
    try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setError('无法启动 3D 视图。请启用浏览器硬件加速，或使用支持 WebGL 2 的浏览器。');return;}
    const mobile=window.matchMedia('(max-width: 760px)').matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:2));renderer.setClearColor(0,0);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
    renderer.domElement.setAttribute('aria-label','交互式 3D 魔方：拖动表面转层，拖动空白旋转视角');el.appendChild(renderer.domElement);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.05,100);camera.position.set(6,4.8,7.5);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.085;controls.enablePan=false;controls.minDistance=3.4;controls.maxDistance=35;controls.rotateSpeed=.65;controls.zoomSpeed=.7;
    controls.touches.ONE=T.TOUCH.ROTATE;controls.touches.TWO=T.TOUCH.DOLLY_ROTATE;
    const environment=new RoomEnvironment();const pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(environment,.04);scene.environment=env.texture;scene.environmentIntensity=.65;environment.dispose();pmrem.dispose();
    scene.add(new T.HemisphereLight(0xeaf0ff,0x2b2d34,2));
    const key=new T.DirectionalLight(0xfff3df,4.4);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;key.shadow.normalBias=.025;key.shadow.bias=-.0004;key.shadow.radius=4;scene.add(key);
    const rim=new T.DirectionalLight(0xbdcfff,2.5);rim.position.set(4,3,-5);scene.add(rim);
    const fill=new T.DirectionalLight(0xffffff,1.2);fill.position.set(-5,0,1);scene.add(fill);
    const ground=new T.Mesh(new T.PlaneGeometry(100,100),new T.ShadowMaterial({opacity:.27}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.65;ground.receiveShadow=true;scene.add(ground);
    const plastic=new T.MeshPhysicalMaterial({color:'#232933',roughness:.37,metalness:.08,clearcoat:.16,clearcoatRoughness:.4});
    const railMaterial=new T.MeshStandardMaterial({color:'#c8d1cc',roughness:.32,metalness:.12});
    const darkMetal=new T.MeshStandardMaterial({color:'#52616a',roughness:.24,metalness:.8});
    const magnetMaterial=new T.MeshStandardMaterial({color:'#b7c4cd',roughness:.22,metalness:.93});
    const accentMaterial=new T.MeshStandardMaterial({color:'#b1c5a2',roughness:.31,metalness:.58});
    const sleeveMaterial=new T.MeshPhysicalMaterial({color:'#626d73',roughness:.36,metalness:.05,transparent:true,opacity:.78});
    const grainData=new Uint8Array(128*128);for(let i=0;i<grainData.length;i++)grainData[i]=120+Math.floor((Math.sin(i*78.233)*43758.5453%1+1)*8);
    const grain=new T.DataTexture(grainData,128,128,T.RedFormat);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(4,4);grain.magFilter=T.LinearFilter;grain.minFilter=T.LinearMipmapLinearFilter;grain.generateMipmaps=true;grain.needsUpdate=true;
    const core=new T.Group();scene.add(core);
    const hub=new T.Mesh(new T.IcosahedronGeometry(.38,2),plastic);core.add(hub);
    const axisGeometry=new T.CylinderGeometry(.085,.12,.8,24);
    Object.values(FACE).forEach(f=>{const axis=new T.Mesh(axisGeometry,darkMetal);axis.position.copy(v3(f.n).multiplyScalar(.45));axis.quaternion.copy(orient(v3(f.n)));core.add(axis);
      const collar=new T.Mesh(new T.TorusGeometry(.125,.045,8,32),accentMaterial);collar.position.copy(v3(f.n).multiplyScalar(.3));collar.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),v3(f.n));core.add(collar);});
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const direction=new T.Vector3(x,y,z).normalize(),socket=new T.Mesh(new T.CylinderGeometry(.10,.12,.10,20),plastic),magnet=new T.Mesh(new T.CylinderGeometry(.074,.074,.06,20),magnetMaterial);socket.position.copy(direction.clone().multiplyScalar(.37));socket.quaternion.copy(orient(direction));core.add(socket);magnet.position.copy(direction.clone().multiplyScalar(.435));magnet.quaternion.copy(orient(direction));magnet.userData.magnet=true;core.add(magnet);}
    core.children.forEach(object=>{object.userData.base=object.position.clone();});
    const models=new Map<string,ModelPiece>(),stickers=new Map<string,T.Mesh>(),hitMeshes:T.Mesh[]=[],textures=new Map<string,T.CanvasTexture>();
    const chassisGeo=new Map<string,T.BufferGeometry>(),shellGeo=new RoundedBoxGeometry(.905,.905,.115,4,.085);
    const jointGeo=new T.SphereGeometry(.12,16,12),magnetGeo=new T.CylinderGeometry(.072,.072,.095,20),housingGeo=new T.CylinderGeometry(.10,.11,.13,20);
    for(const p of getState().cube){
      const root=new T.Group(),parts:ComponentPart[]=[];scene.add(root);const radial=v3(p.home).normalize();
      function part(object:T.Object3D,pos:T.Vector3,direction:T.Vector3,amount:number,magnet=false){object.position.copy(pos);root.add(object);parts.push({object,base:pos.clone(),direction:direction.clone(),amount,magnet});object.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});return object;}
      // Distinct load-bearing chassis: trihedral corner, elongated edge, circular center carriage.
      if(p.kind!=='center'){
        const dims=p.home.map(a=>a?.84:.74) as Vec,key=dims.join(',');if(!chassisGeo.has(key))chassisGeo.set(key,new RoundedBoxGeometry(...dims,3,.16));
        const chassis=new T.Mesh(chassisGeo.get(key),plastic);chassis.userData.primary=true;part(chassis,radial.clone().multiplyScalar(-.045),radial,.08);
        const neck=new T.Mesh(new T.CylinderGeometry(p.kind==='corner'?.13:.20,.105,.4,20),plastic);neck.quaternion.copy(orient(radial));
        part(neck,radial.clone().multiplyScalar(-.48),radial,-.12);
        const foot=new T.Mesh(p.kind==='corner'?new T.SphereGeometry(.22,20,12,0,Math.PI*2,0,Math.PI*.72):new RoundedBoxGeometry(.47,.17,.31,3,.08),railMaterial);
        foot.quaternion.copy(orient(radial));part(foot,radial.clone().multiplyScalar(-.67),radial,-.32);
        const track=new T.Mesh(new T.TorusGeometry(p.kind==='corner'?.18:.235,.033,8,24,Math.PI*1.5),darkMetal);track.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),radial);part(track,radial.clone().multiplyScalar(-.61),radial,-.22);
      }else{
        const carriage=new T.Mesh(new T.CylinderGeometry(.34,.26,.26,40),plastic);carriage.userData.primary=true;carriage.quaternion.copy(orient(radial));part(carriage,radial.clone().multiplyScalar(-.13),radial,.12);
        const stem=new T.Mesh(new T.CylinderGeometry(.105,.13,.65,24),railMaterial);stem.quaternion.copy(orient(radial));part(stem,radial.clone().multiplyScalar(-.43),radial,-.19);
        const springPoints=Array.from({length:129},(_,i)=>new T.Vector3(.125*Math.cos(i/128*Math.PI*14),i/128*.4-.2,.125*Math.sin(i/128*Math.PI*14)));
        const spring=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(springPoints),128,.018,6,false),magnetMaterial);spring.quaternion.copy(orient(radial));part(spring,radial.clone().multiplyScalar(-.27),radial,.13);
        const dial=new T.Group();const disk=new T.Mesh(new T.CylinderGeometry(.27,.27,.07,40),accentMaterial);dial.add(disk);
        for(let i=0;i<12;i++){const ridge=new T.Mesh(new T.BoxGeometry(.04,.09,.035),plastic);ridge.position.set(Math.cos(i*Math.PI/6)*.26,0,Math.sin(i*Math.PI/6)*.26);ridge.rotation.y=-i*Math.PI/6;dial.add(ridge);}
        dial.quaternion.copy(orient(radial));part(dial,radial.clone().multiplyScalar(.13),radial,.43);
        const screw=new T.Mesh(new T.CylinderGeometry(.067,.067,.075,6),magnetMaterial);screw.quaternion.copy(orient(radial));part(screw,radial.clone().multiplyScalar(.22),radial,.62);
      }
      for(const s of p.stickers){const f=FACE[s.face],normal=v3(f.n);const material=new T.MeshPhysicalMaterial({color:COLORS[s.face],roughness:.30,metalness:0,clearcoat:.27,clearcoatRoughness:.35,bumpMap:grain,bumpScale:.004});
        const shell=new T.Mesh(shellGeo,material);shell.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(v3(f.r),v3(f.u),normal));shell.userData={sticker:s.id,piece:p.id,face:s.face};
        part(shell,normal.clone().multiplyScalar(.455),normal,p.kind==='center'?.95:.65);stickers.set(s.id,shell);hitMeshes.push(shell);
        // Inner shell bosses establish a physical attachment to the skeleton.
        if(p.kind!=='center'){const boss=new T.Mesh(jointGeo,plastic);part(boss,normal.clone().multiplyScalar(.27),normal,.40);}
      }
      if(p.kind!=='center'){
        // Magnets live at shared corner-edge interfaces, in separate retaining cups.
        for(let axis=0;axis<3;axis++)if(p.kind==='corner'?p.home[axis]!==0:p.home[axis]===0){
          const signs=p.kind==='corner'?[-p.home[axis]]:[-1,1];
          for(const sign of signs){const dir=new T.Vector3().setComponent(axis,sign),loc=dir.clone().multiplyScalar(.36).add(radial.clone().multiplyScalar(.02));
            const cup=new T.Mesh(housingGeo,sleeveMaterial);cup.quaternion.copy(orient(dir));part(cup,loc,dir,.3);
            const magnet=new T.Mesh(magnetGeo,magnetMaterial);magnet.quaternion.copy(orient(dir));part(magnet,loc.clone().addScaledVector(dir,.018),dir,.53,true);
          }
        }
        if(p.kind==='corner'){const magnet=new T.Mesh(magnetGeo,magnetMaterial);magnet.quaternion.copy(orient(radial));part(magnet,radial.clone().multiplyScalar(-.73),radial,-.47,true);}
      }
      models.set(p.id,{root,parts,source:p});
    }
    // A restrained physical center mark, bound to U4 orientation like all photo content.
    const markCanvas=document.createElement('canvas');markCanvas.width=256;markCanvas.height=256;const markCtx=markCanvas.getContext('2d')!;markCtx.fillStyle=COLORS.U;markCtx.fillRect(0,0,256,256);markCtx.strokeStyle='#536054';markCtx.lineWidth=4;markCtx.beginPath();markCtx.moveTo(102,150);markCtx.lineTo(128,102);markCtx.lineTo(154,150);markCtx.moveTo(115,132);markCtx.lineTo(141,132);markCtx.stroke();
    const markTex=new T.CanvasTexture(markCanvas);markTex.colorSpace=T.SRGBColorSpace;
    let lastArt=-1,lastCube=getState().cube,currentExplode=getState().settings.explode,targetCamera:T.Vector3|null=null,animation:{token:string;start:number;duration:number;resolve:()=>void}|null=null;
    async function updateArt(){const s=getState(),version=s.artVersion;lastArt=version;
      await Promise.all([...stickers].map(async([id,mesh])=>{const canvas=document.createElement('canvas');await paintSticker(canvas,id,s.appearance);if(disposed||getState().artVersion!==version)return;
        const material=mesh.material as T.MeshPhysicalMaterial;const art=s.appearance.stickers[id];textures.get(id)?.dispose();
        if(art.group||art.image){const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();material.map=tex;material.color.set('#ffffff');textures.set(id,tex);}
        else {material.map=id==='U4'&&art.color===COLORS.U?markTex:null;material.color.set(material.map?'#ffffff':art.color);}
        material.needsUpdate=true;
      }));
    }
    const outlineMaterial=new T.MeshBasicMaterial({color:'#d5e6ae',side:T.BackSide,transparent:true,opacity:.88});
    const selectedOutlines=new Map<string,T.Mesh>();
    for(const [id,mesh] of stickers){const outline=new T.Mesh(shellGeo,outlineMaterial);outline.scale.set(1.07,1.07,1.08);outline.visible=false;mesh.add(outline);selectedOutlines.set(id,outline);}
    const unsub=subscribe(()=>{const s=getState();if(s.artVersion!==lastArt)void updateArt();for(const [id,o]of selectedOutlines)o.visible=s.selected.includes(id);});
    setAnimator((token,duration)=>new Promise(resolve=>{animation={token,start:performance.now(),duration,resolve};}));
    function distanceForSize(){const radius=1.85+getState().settings.explode*1.65;return radius/Math.sin(T.MathUtils.degToRad(camera.fov/2))*Math.max(1,1/camera.aspect)*1.08;}
    cameraActions.fit=()=>{targetCamera=camera.position.clone().normalize().multiplyScalar(distanceForSize());};
    cameraActions.reset=()=>{camera.up.set(0,1,0);targetCamera=new T.Vector3(6,4.8,7.5).normalize().multiplyScalar(distanceForSize());};
    cameraActions.face=(face)=>{targetCamera=v3(FACE[face].n).multiplyScalar(distanceForSize()).addScaledVector(v3(FACE[face].u),.001);camera.up.copy(v3(FACE[face].u));};
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();cameraActions.reset();
    const raycaster=new T.Raycaster(),pointer=new T.Vector2();
    let down:{x:number;y:number;id:number;hit?:T.Intersection<T.Object3D>;orbit:boolean}|null=null;
    const activePointers=new Map<number,{x:number;y:number}>();let pinch:{distance:number;x:number;y:number}|null=null;
    function pinchState(){const [a,b]=[...activePointers.values()];return {distance:Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
    function hitAt(e:PointerEvent){const rect=el.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(hitMeshes,false)[0];}
    function onDown(e:PointerEvent){activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(activePointers.size>1){down=null;controls.enabled=false;pinch=pinchState();renderer.domElement.setPointerCapture(e.pointerId);e.stopImmediatePropagation();return;}
      const s=getState(),hit=hitAt(e),orbit=!hit||['camera','explode'].includes(s.mode)||e.button!==0;
      controls.enabled=orbit;if(orbit)camera.up.set(0,1,0);down={x:e.clientX,y:e.clientY,id:e.pointerId,hit,orbit};
      if(!orbit){renderer.domElement.setPointerCapture(e.pointerId);e.stopImmediatePropagation();}
      targetCamera=null;
    }
    function onMove(e:PointerEvent){if(activePointers.has(e.pointerId))activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(activePointers.size>1&&pinch){const next=pinchState(),spherical=new T.Spherical().setFromVector3(camera.position);spherical.radius=T.MathUtils.clamp(spherical.radius*pinch.distance/next.distance,controls.minDistance,controls.maxDistance);spherical.theta-=(next.x-pinch.x)*.005;spherical.phi=T.MathUtils.clamp(spherical.phi-(next.y-pinch.y)*.005,.05,Math.PI-.05);camera.up.set(0,1,0);camera.position.setFromSpherical(spherical);pinch=next;targetCamera=null;e.stopImmediatePropagation();return;}if(!down||down.orbit||down.id!==e.pointerId)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;
      if(Math.hypot(dx,dy)<20)return;const s=getState();if(s.mode==='customize'||s.mode==='inspect')return;
      const hit=down.hit!;down=null;if(s.busy||s.solving)return;
      const p=s.cube.find(p=>p.id===hit.object.userData.piece)!;
      const normal=new T.Vector3(0,0,1).applyQuaternion(hit.object.getWorldQuaternion(new T.Quaternion()));
      const normalArray=normal.toArray().map(Math.round) as Vec;
      let best:{score:number;token:string}|null=null;
      // Project each physically possible tangent; compare with the actual screen drag.
      for(let axis=0;axis<3;axis++)if(!normalArray[axis]){
        const axial=[0,0,0] as Vec;axial[axis]=1;
        const tangent=v3(cross(axial,normalArray));const screenA=hit.point.clone().project(camera),screenB=hit.point.clone().add(tangent).project(camera);
        const sx=(screenB.x-screenA.x)*el.clientWidth,sy=-(screenB.y-screenA.y)*el.clientHeight,projection=(dx*sx+dy*sy)/Math.hypot(sx,sy),score=Math.abs(projection);
        const layer=p.pos[axis],face=axis===0?(layer===1?'R':layer===-1?'L':'M'):axis===1?(layer===1?'U':layer===-1?'D':'E'):(layer===1?'F':layer===-1?'B':'S');
        const spec=moveSpec(face),token=face+(e.altKey?'2':Math.sign(projection)===Math.sign(spec.turns)?'':"'");
        if(!best||score>best.score)best={score,token};
      }
      if(best)void perform(best.token);controls.enabled=true;
    }
    function onUp(e:PointerEvent){activePointers.delete(e.pointerId);if(down&&!down.orbit&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<12&&down.hit){const s=getState(),id=down.hit.object.userData.sticker;selectSticker(id,s.mode==='customize');if(s.mode==='inspect'){const p=s.cube.find(p=>p.id===down!.hit!.object.userData.piece)!;notify(`${p.kind==='corner'?'角块':p.kind==='edge'?'棱块':'中心块'} · ${id} · 当前坐标 ${p.pos.join(' / ')}`);}}
      down=null;pinch=null;controls.enabled=true;
    }
    const cancel=()=>{down=null;pinch=null;activePointers.clear();controls.enabled=true;};
    renderer.domElement.addEventListener('pointerdown',onDown,true);renderer.domElement.addEventListener('pointermove',onMove,true);renderer.domElement.addEventListener('pointerup',onUp,true);renderer.domElement.addEventListener('pointercancel',cancel,true);
    let last=performance.now(),visibilityAt=0,lastQuality='';
    function render(now:number){if(disposed)return;const dt=Math.min((now-last)/1000,.05);last=now;const s=getState();
      currentExplode=T.MathUtils.damp(currentExplode,s.settings.explode,9,dt);
      const inner=Math.max(0,currentExplode-1)*s.settings.internal;
      for(const p of s.cube){const m=models.get(p.id)!;m.root.position.copy(v3(p.pos).multiplyScalar(1+s.settings.gap+currentExplode*.72));m.root.quaternion.copy(basisQuaternion(p));m.root.scale.setScalar(s.settings.size);
        for(const part of m.parts){part.object.position.copy(part.base).addScaledVector(part.direction,inner*part.amount);part.object.visible=Boolean(part.object.userData.primary||part.object.userData.sticker||currentExplode>.05||animation);if(part.magnet)part.object.visible=part.object.visible&&s.settings.showMagnets;}
        for(const sticker of p.stickers){const mesh=stickers.get(sticker.id)!;mesh.position.addScaledVector(v3(FACE[sticker.face].n),s.settings.stickerOffset);(mesh.material as T.MeshPhysicalMaterial).roughness=s.settings.roughness;}
      }
      core.visible=currentExplode>.05||Boolean(animation);
      core.children.forEach(object=>{const base=object.userData.base as T.Vector3;object.position.copy(base).multiplyScalar(1+inner*.28);if(object.userData.magnet)object.visible=s.settings.showMagnets;});
      if(animation){const a=animation,spec=moveSpec(a.token),raw=Math.min(1,(now-a.start)/a.duration);let t=raw;
        if(s.settings.easing==='smooth')t=raw*raw*(3-2*raw);else if(s.settings.easing==='magnetic')t=1-Math.pow(1-raw,3);
        const q=new T.Quaternion().setFromAxisAngle(new T.Vector3().setComponent(spec.axis,1),spec.turns*Math.PI/2*t);
        for(const p of s.cube)if(spec.layers.includes(p.pos[spec.axis])){const root=models.get(p.id)!.root;root.position.applyQuaternion(q);root.quaternion.premultiply(q);}
        if(raw===1){animation=null;a.resolve();}
      }
      if(targetCamera){camera.position.lerp(targetCamera,1-Math.exp(-dt*7));if(camera.position.distanceTo(targetCamera)<.002)targetCamera=null;}
      controls.autoRotate=s.settings.autoRotate&&!animation;controls.autoRotateSpeed=.7;controls.update();
      ground.position.y=-(1.68+currentExplode*1.55)*s.settings.size;
      if(now-visibilityAt>150){visibilityAt=now;const direction=camera.position.clone().normalize(),faces=Object.keys(FACE) as Face[];const visible=faces.filter(f=>v3(FACE[f].n).dot(direction)>.13);
        const anchors:typeof s.faceAnchors={};
        for(const f of faces){const point=v3(FACE[f].n).multiplyScalar(1.8).project(camera),angle=Math.atan2(-point.y,point.x),x=50+Math.cos(angle)*35,y=52+Math.sin(angle)*29;anchors[f]={x:Math.round(x),y:Math.round(y),fromX:Math.round(50+point.x*32),fromY:Math.round(50-point.y*32)};}
        if(visible.join('')!==s.visibleFaces.join('')||JSON.stringify(anchors)!==JSON.stringify(s.faceAnchors))patch({visibleFaces:visible,faceAnchors:anchors});}
      if(lastQuality!==s.settings.quality){lastQuality=s.settings.quality;renderer.setPixelRatio(s.settings.quality==='low'?1:Math.min(devicePixelRatio,s.settings.quality==='high'?2:mobile?1.5:2));}
      renderer.render(scene,camera);lastCube=s.cube;frame=requestAnimationFrame(render);
    }
    void updateArt();frame=requestAnimationFrame(render);patch({ready:true});
    const loss=(e:Event)=>{e.preventDefault();setError('3D 显示连接已中断。请刷新页面恢复，已保存的方案会自动载入。');};renderer.domElement.addEventListener('webglcontextlost',loss);
    return()=>{disposed=true;cancelAnimationFrame(frame);animation?.resolve();setAnimator(async()=>{});unsub();observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',onDown,true);renderer.domElement.removeEventListener('pointermove',onMove,true);renderer.domElement.removeEventListener('pointerup',onUp,true);renderer.domElement.removeEventListener('pointercancel',cancel,true);renderer.domElement.removeEventListener('webglcontextlost',loss);
      const geos=new Set<T.BufferGeometry>(),mats=new Set<T.Material>();scene.traverse(o=>{if(o instanceof T.Mesh){geos.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());markTex.dispose();grain.dispose();env.dispose();renderer.dispose();el.replaceChildren();void lastCube;};
  },[]);
  return <div ref={host} className="viewport">{error&&<div className="webgl-error"><strong>3D 视图暂不可用</strong><p>{error}</p><button onClick={()=>location.reload()}>重新加载</button></div>}</div>;
}
