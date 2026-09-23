import assert from 'node:assert/strict';
import { definition, solved, apply, colorSolved, pictureSolved } from '../lib/puzzle/model';
import { solvePuzzle } from '../lib/puzzle/solver';
let seed=0x6d2b79f5;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(const id of ['cube-2','cube-4','cube-5','megaminx'] as const) {
  const def=definition(id), records:{moves:number;ms:number;pictures:boolean}[]=[];
  const generators=def.primitiveMoves;
  for(let sample=0;sample<20;sample++) {
    const scramble=Array.from({length:id==='cube-2'?30:80},()=>generators[Math.floor(random()*generators.length)]+['',"'",'2'][Math.floor(random()*3)]);
    if(sample%2===0)scramble.push(...(id==='megaminx'?['R++','D--','@F']:['x','y2','z\'']));
    const initial=apply(def,solved(def),scramble), pictures=sample%2===0, start=performance.now();
    const result=await solvePuzzle(def,structuredClone(initial),pictures);
    const end=apply(def,initial,result.moves);
    assert.ok(pictures?pictureSolved(def,end):colorSolved(def,end),`${id} sample ${sample}`);
    assert.ok(result.moves.length < (id==='cube-2'?15:2000));
    records.push({moves:result.moves.length,ms:Math.round(performance.now()-start),pictures});
  }
  for(const pictures of [false,true]) {
    const selected=records.filter(r=>r.pictures===pictures);
    console.log(JSON.stringify({id,pictures,cases:selected.length,minMoves:Math.min(...selected.map(r=>r.moves)),maxMoves:Math.max(...selected.map(r=>r.moves)),maxMs:Math.max(...selected.map(r=>r.ms))}));
  }
  const near=apply(def,solved(def),['R','U']);
  assert.ok((await solvePuzzle(def,near,true)).moves.length<=2);
}
process.exit(0);
