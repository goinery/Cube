'use client';
import { useEffect,useRef,useMemo } from 'react';
import { FACE,FACES,facelets,solved,type Face,type Facelet } from '@/lib/cube/model';
import { paintSticker } from '@/lib/cube/appearance';
import { useCube,selectSticker,cameraActions } from '@/lib/cube/store';

export function StickerTile({item,onSelect,selected=false}:{item:Facelet;onSelect:()=>void;selected?:boolean}){
  const s=useCube(),canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{let active=true;const c=document.createElement('canvas');void paintSticker(c,item.sticker.id,s.appearance,160).then(()=>{if(active&&canvas.current){canvas.current.width=160;canvas.current.height=160;canvas.current.getContext('2d')!.drawImage(c,0,0);}});return()=>{active=false;};},[s.artVersion,item.sticker.id,s.appearance]);
  return <button className={`sticker-tile ${selected?'selected':''}`} aria-label={`${item.face} 面第 ${item.row+1} 行 ${item.col+1} 列，贴片 ${item.sticker.id}`} aria-pressed={selected} onClick={onSelect}><canvas ref={canvas} style={{transform:`rotate(${item.angle}deg)`}}/><span className="tile-index">{item.sticker.id}</span></button>;
}
export function FaceGrid({face,home=false,large=false}:{face:Face;home?:boolean;large?:boolean}){
  const s=useCube(),map=useMemo(()=>facelets(home?solved():s.cube),[s.cube,home]);
  return <div className={`face-grid ${large?'large':''}`}>{map[face].map(item=><StickerTile key={item.row*3+item.col} item={item} selected={s.selected.includes(item.sticker.id)} onSelect={()=>selectSticker(item.sticker.id,s.mode==='customize')}/>)}</div>;
}
export default function FaceMaps(){const s=useCube();if(s.view==='normal'||s.presentation)return null;
  const faces=s.view==='hidden'?FACES.filter(f=>!s.visibleFaces.includes(f)):FACES;
  if(s.view==='hidden')return <div className="spatial-maps" aria-label="与摄像机方向对应的隐藏面映射"><svg className="map-leaders" viewBox="0 0 100 100" preserveAspectRatio="none">{faces.map(f=>{const a=s.faceAnchors[f];return a?<g key={f}><line x1={a.fromX} y1={a.fromY} x2={a.x} y2={a.y}/><circle cx={a.fromX} cy={a.fromY} r=".3"/></g>:null;})}</svg>{faces.map((face,i)=>{const a=s.faceAnchors[face]||{x:15+i*35,y:76};return <div key={face} className="spatial-face" style={{left:`${a.x}%`,top:`${a.y}%`}}><button className="face-label" onClick={()=>cameraActions.face(face)} title={`转向${FACE[face].name}面`}><b>{face}</b><span>{FACE[face].name}面</span><span className="face-direction">↗</span></button><FaceGrid face={face}/><span className="mapping-caption">隐藏面映射</span></div>;})}</div>;
  return <div className={`face-maps ${s.view}`} aria-label="实时六面状态映射"><div className="map-heading"><span>{s.view==='six'?'SIX FACE OVERVIEW':'CUBE NET'}</span><i/><span>实时同步</span></div><div className="maps-grid">{faces.map(face=><div key={face} className={`mini-face face-${face} ${s.visibleFaces.includes(face)?'visible-face':'hidden-face'}`}><button className="face-label" onClick={()=>cameraActions.face(face)} title={`摄像机转向${FACE[face].name}面`}><b>{face}</b><span>{FACE[face].name}面</span><span className="face-direction">{face==='U'?'↑':face==='D'?'↓':face==='L'?'←':face==='R'?'→':face==='B'?'↗':'↙'}</span></button><FaceGrid face={face}/></div>)}</div></div>;
}
