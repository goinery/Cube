import { COLORS, FACES, type Face } from './model';
export interface ArtTransform { fit:'fill'|'fit'|'crop'; scale:number; x:number; y:number; rotation:number; cropX:number; cropY:number; cropW:number; cropH:number }
export interface StickerArt { color:string; image?:string; group?:string; rotation:number }
export interface ImageGroup extends ArtTransform { id:string; members:string[]; image:string; bounds?:{row:number;col:number;rows:number;cols:number} }
export interface Appearance { stickers:Record<string,StickerArt>; groups:Record<string,ImageGroup> }
export const defaultTransform = ():ArtTransform => ({fit:'fill',scale:1,x:0,y:0,rotation:0,cropX:0,cropY:0,cropW:1,cropH:1});
export function defaultAppearance():Appearance {return {stickers:Object.fromEntries(FACES.flatMap(f=>Array.from({length:9},(_,i)=>[f+i,{color:COLORS[f],rotation:0}]))),groups:{}};}
const imageCache=new Map<string,HTMLImageElement>();
export async function loadImage(src:string):Promise<HTMLImageElement> {
  const cached=imageCache.get(src);if(cached) return cached;
  const img=new Image();img.src=src;await img.decode();imageCache.set(src,img);return img;
}
export function groupBounds(members:string[]) {
  const rows=members.map(id=>Math.floor(Number(id.slice(1))/3)),cols=members.map(id=>Number(id.slice(1))%3);
  const row=Math.min(...rows),col=Math.min(...cols);
  return {row,col,rows:Math.max(...rows)-row+1,cols:Math.max(...cols)-col+1};
}
export function drawGroup(ctx:CanvasRenderingContext2D,image:HTMLImageElement,g:ArtTransform,w:number,h:number) {
  const sx=g.cropX*image.width,sy=g.cropY*image.height,sw=g.cropW*image.width,sh=g.cropH*image.height;
  const fit=g.fit==='fit'?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh);
  ctx.save();ctx.translate(w/2+g.x*w,h/2+g.y*h);ctx.rotate(g.rotation*Math.PI/180);ctx.scale(g.scale,g.scale);
  ctx.drawImage(image,sx,sy,sw,sh,-sw*fit/2,-sh*fit/2,sw*fit,sh*fit);ctx.restore();
}
export async function paintSticker(canvas:HTMLCanvasElement,id:string,appearance:Appearance,size=256) {
  canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d')!,art=appearance.stickers[id];
  ctx.fillStyle=art.color;ctx.fillRect(0,0,size,size);
  const g=art.group?appearance.groups[art.group]:undefined,src=g?.image||art.image;
  if(!src) return;
  const image=await loadImage(src);ctx.save();ctx.translate(size/2,size/2);ctx.rotate(art.rotation*Math.PI/180);ctx.translate(-size/2,-size/2);
  if(g) {const b=g.bounds||groupBounds(g.members),row=Math.floor(Number(id.slice(1))/3),col=Number(id.slice(1))%3;
    ctx.translate(-(col-b.col)*size,-(row-b.row)*size);drawGroup(ctx,image,g,b.cols*size,b.rows*size);
  }else drawGroup(ctx,image,defaultTransform(),size,size);
  ctx.restore();
}
export async function importImage(file:File):Promise<string> {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG、JPEG 或 WebP 图片。');
  if(file.size>25*1024*1024) throw new Error('图片文件不能超过 25 MB。');
  const url=URL.createObjectURL(file);
  try {const img=await loadImage(url),canvas=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(img.width,img.height));
    canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
    imageCache.delete(url);return canvas.toDataURL('image/webp',.92);
  }finally{URL.revokeObjectURL(url);}
}
export function removeFromGroups(appearance:Appearance,ids:string[]):Appearance {
  const a=structuredClone(appearance);
  for(const id of ids) {delete a.stickers[id].group;delete a.stickers[id].image;}
  for(const [id,g] of Object.entries(a.groups)) {g.members=g.members.filter(x=>!ids.includes(x));if(!g.members.length) delete a.groups[id];}
  return a;
}
export const faceIds=(face:Face)=>Array.from({length:9},(_,i)=>face+i);
