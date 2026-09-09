// Optional pixel verification using @napi-rs/canvas; it is not a runtime dependency.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {defaultAppearance,defaultTransform,paintSticker,faceIds,groupBounds,removeFromGroups} from '../lib/cube/appearance';
const require=createRequire(import.meta.url),{createCanvas,Image}=require(process.env.AXIS_CANVAS_MODULE||'@napi-rs/canvas');
class TestImage extends Image{decode(){return this.width?Promise.resolve():new Promise<void>((resolve,reject)=>{this.onload=()=>resolve();this.onerror=reject;});}}
(globalThis as any).Image=TestImage;
const source=createCanvas(300,300),ctx=source.getContext('2d'),colors:string[]=[];
for(let row=0;row<3;row++)for(let col=0;col<3;col++){const color=`rgb(${40+row*70},${35+col*70},${30+(row*3+col)*20})`;colors.push(color);ctx.fillStyle=color;ctx.fillRect(col*100,row*100,100,100);}
const a=defaultAppearance(),id='group-test',members=faceIds('F');a.groups[id]={id,members,image:source.toDataURL('image/png'),bounds:groupBounds(members),...defaultTransform()};for(const sid of members)a.stickers[sid].group=id;
const pixel=(c:any,x:number,y:number)=>Array.from(c.getContext('2d').getImageData(x,y,1,1).data);
for(let i=0;i<9;i++){const c=createCanvas(160,160);await paintSticker(c,'F'+i,a,160);assert.deepEqual(pixel(c,80,80),pixel(source,(i%3)*100+50,Math.floor(i/3)*100+50));}
console.log('PASS nine real sticker textures contain nine distinct correct regions, with no repetition or mirroring');
const removed=removeFromGroups(a,['F0','F1','F2','F3','F6']);const c=createCanvas(160,160);await paintSticker(c,'F4',removed,160);assert.deepEqual(pixel(c,80,80),pixel(source,150,150));
console.log('PASS removing group members does not shift the remaining image fragments');
const quadrants=createCanvas(100,100),q=quadrants.getContext('2d');[['#ff0000',0,0],['#00ff00',50,0],['#0000ff',0,50],['#ffff00',50,50]].forEach(([color,x,y])=>{q.fillStyle=color;q.fillRect(x,y,50,50);});
const b=defaultAppearance();b.stickers.U0.image=quadrants.toDataURL('image/png');b.stickers.U0.rotation=90;const r=createCanvas(100,100);await paintSticker(r,'U0',b,100);assert.deepEqual(pixel(r,25,25),[0,0,255,255]);assert.deepEqual(pixel(r,75,25),[255,0,0,255]);
console.log('PASS clockwise texture orientation matches the 3D and face-map coordinate convention');
const subset=['F0','F1','F3','F4'],g={id:'subset',members:subset,image:quadrants.toDataURL('image/png'),bounds:groupBounds(subset),...defaultTransform()};b.groups.subset=g;subset.forEach(s=>b.stickers[s].group='subset');const p=createCanvas(100,100);await paintSticker(p,'F4',b,100);assert.deepEqual(pixel(p,50,50),[255,255,0,255]);
console.log('PASS 2×2 subset fills a shared image region correctly');
g.cropX=.5;g.cropY=.5;g.cropW=.5;g.cropH=.5;for(const sid of subset){await paintSticker(p,sid,b,100);assert.deepEqual(pixel(p,50,50),[255,255,0,255]);}
console.log('PASS explicit crop bounds apply to every member of a shared image');
