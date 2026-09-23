import { generatorPermutations, reduce444 } from '../vendor/tpr444/solver';
import { apply, solved, rotatePoint } from './model';
import { solved as cubeSolved, type Basis, type Vec } from '../cube/model';
import { solveState } from '../cube/solver-core';
import type { Definition, PuzzleState } from './types';
const near=(a:number[],b:number[])=>a.every((v,i)=>Math.abs(v-b[i])<1e-5);
let maps:Record<string,{pieces:number[];mapping:number[]}>|null=null;
export function solveFourColor(def:Definition,state:PuzzleState) {
  const generators=generatorPermutations() as {token:string;corner:number[];wing:number[];center:number[]}[];
  if(!maps){
    maps={};
    for(const kind of ['corner','wing','center'] as const){
      const pieces=def.pieces.flatMap((p,i)=>p.kind===kind?[i]:[]);
      const permutations=generators.map(g=>{
        const moved=apply(def,solved(def),[g.token]);
        return pieces.map(i=>pieces.findIndex(j=>near(rotatePoint(def,moved.rotations[i],def.pieces[i].anchor),def.pieces[j].anchor)));
      });
      let mapping:number[]|null=null;
      for(let seed=0;seed<pieces.length&&!mapping;seed++){
        const table=pieces.map(()=>-1),queue=[0];table[0]=seed;let valid=true;
        for(let q=0;q<queue.length&&valid;q++)for(let g=0;g<generators.length;g++){
          const next=permutations[g][queue[q]],target=generators[g][kind].indexOf(table[queue[q]]);
          if(table[next]<0){table[next]=target;queue.push(next);}else if(table[next]!==target){valid=false;break;}
        }
        if(valid&&new Set(table).size===pieces.length)mapping=table;
      }
      if(!mapping)throw new Error('solver.invalid');maps[kind]={pieces,mapping};
    }
  }
  const input={} as Record<'corner'|'wing'|'center',number[]>;
  for(const kind of ['corner','wing','center'] as const){
    const {pieces,mapping}=maps[kind];const values=new Array<number>(pieces.length);
    pieces.forEach((i,home)=>{
      const current=pieces.findIndex(j=>near(rotatePoint(def,state.rotations[i],def.pieces[i].anchor),def.pieces[j].anchor));
      values[mapping[current]]=kind==='center'?Math.floor(mapping[home]/4):mapping[home];
    });input[kind]=values;
  }
  const reduction=reduce444(input), reduced=apply(def,state,reduction);
  const projection=cubeSolved().map(piece=>{
    const kind=piece.kind==='edge'?'wing':piece.kind;
    const home=piece.home.map(x=>x*3);
    if(kind==='wing')home[home.indexOf(0)]=1;
    if(kind==='center')for(let i=0;i<3;i++)if(home[i]===0)home[i]=1;
    const i=def.pieces.findIndex(p=>p.kind===kind&&near(p.anchor,home));
    const r=reduced.rotations[i];
    return {...piece,pos:rotatePoint(def,r,piece.home).map(Math.round) as Vec,
      basis:([[1,0,0],[0,1,0],[0,0,1]] as Vec[]).map(v=>rotatePoint(def,r,v).map(Math.round)) as Basis};
  });
  return [...reduction,...solveState(projection,'fast',false).moves];
}
