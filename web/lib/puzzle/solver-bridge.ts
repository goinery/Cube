import { KPattern, type KPuzzle } from 'cubing/kpuzzle';
import { puzzles } from 'cubing/puzzles';
import { experimentalSolve2x2x2, solveMegaminx } from 'cubing/search';
import { apply, moveSpec, rotatePoint } from './model';
import type { Definition, PuzzleState } from './types';

type Mapping = { name: string; pieces: number[]; home: number[]; flags: number[]; orientations: number };
type Bridge = { kp: KPuzzle; mappings: Mapping[]; faces: Record<string,string> };
const cache = new Map<string,Promise<Bridge>>();
const near = (a: number[], b: number[]) => a.every((v,i) => Math.abs(v-b[i]) < 1e-5);
async function makeBridge(def: Definition): Promise<Bridge> {
  const kp = await puzzles[def.id === 'megaminx' ? 'megaminx' : '2x2x2'].kpuzzle();
  const names = def.id === 'megaminx' ? ['U','R','F','L','BR','BL','FR','FL','DR','DL','B','D'] : ['U','R','F','D','L','B'];
  const candidates: Record<string,string>[] = [];
  if (def.id !== 'megaminx') candidates.push(Object.fromEntries(names.map(n=>[n,n])));
  else {
    const moved = names.map(n => kp.moveToTransformation(n).transformationData.CORNERS.permutation.flatMap((v,i)=>v===i?[]:[i]));
    const adjacent = (i:number,j:number) => moved[i].some(v=>moved[j].includes(v));
    const assignment:number[]=[];
    function visit() {
      const i=assignment.length;
      if (i===12) { candidates.push(Object.fromEntries(def.faces.map((f,j)=>[f.id,names[assignment[j]]]))); return; }
      for(let k=0;k<12;k++) if(!assignment.includes(k) && assignment.every((v,j)=> adjacent(k,v)===(def.faces[i].normal.reduce((s,x,d)=>s+x*def.faces[j].normal[d],0)>.4))) {
        assignment.push(k); visit(); assignment.pop();
      }
    }
    visit();
  }
  for (const faces of candidates) {
    const mappings:Mapping[]=[];
    let valid=true;
    for (const [kind,name] of [['corner','CORNERS'],['edge','EDGES']] as const) {
      const pieces=def.pieces.flatMap((p,i)=>p.kind===kind?[i]:[]);
      if(!pieces.length) continue;
      const orbit=kp.definition.orbits.find(o=>o.orbitName===name)!;
      const count=orbit.numPieces*orbit.numOrientations, representative=pieces[0];
      const moves=def.faces.map(f=>moveSpec(def,f.id));
      const kpMoves=def.faces.map(f=> {
        const t=kp.moveToTransformation(faces[f.id]).transformationData[name];
        const dest=t.permutation.map((_,i)=>t.permutation.indexOf(i));
        return Array.from({length:count},(_,flag)=>{
          const slot=dest[Math.floor(flag/orbit.numOrientations)];
          return slot*orbit.numOrientations+(flag%orbit.numOrientations+t.orientationDelta[slot])%orbit.numOrientations;
        });
      });
      let flags:number[]|null=null;
      for(let seed=0;seed<count&&!flags;seed++) {
        const map=new Array<number>(def.group.quaternions.length).fill(-1), queue=[0]; map[0]=seed;
        let consistent=true;
        for(let q=0;q<queue.length&&consistent;q++) {
          const g=queue[q];
          for(let m=0;m<moves.length;m++) {
            const next=moves[m].affects(representative,g)?def.group.multiply[moves[m].rotation][g]:g;
            const target=kpMoves[m][map[g]];
            if(map[next]<0) { map[next]=target; queue.push(next); }
            else if(map[next]!==target) {consistent=false;break;}
          }
        }
        if(consistent && map.every(x=>x>=0) && new Set(map).size===count) flags=map;
      }
      if(!flags) { valid=false; break; }
      const home=pieces.map(i=>def.group.quaternions.findIndex((_,g)=>near(rotatePoint(def,g,def.pieces[representative].anchor),def.pieces[i].anchor)));
      mappings.push({name,pieces,home,flags,orientations:orbit.numOrientations});
    }
    if(valid) return {kp,mappings,faces};
  }
  throw new Error('solver.invalid');
}
export async function solveSmallOrMinx(def:Definition,state:PuzzleState):Promise<string[]> {
  let promise=cache.get(def.id); if(!promise) {promise=makeBridge(def);cache.set(def.id,promise);}
  const bridge=await promise, data=structuredClone(bridge.kp.defaultPattern().patternData);
  for(const map of bridge.mappings) map.pieces.forEach((piece,i)=>{
    const home=map.flags[map.home[i]], current=map.flags[def.group.multiply[state.rotations[piece]][map.home[i]]];
    const slot=Math.floor(current/map.orientations);
    data[map.name].pieces[slot]=Math.floor(home/map.orientations);
    data[map.name].orientation[slot]=(current-home+map.orientations*100)%map.orientations;
  });
  const pattern=new KPattern(bridge.kp,data);
  const solution=await (def.id==='megaminx'?solveMegaminx(pattern):experimentalSolve2x2x2(pattern));
  const reverse=Object.fromEntries(Object.entries(bridge.faces).map(([a,b])=>[b,a]));
  return solution.toString().trim().split(/\s+/).filter(Boolean).map(token=>token.replace(/^[A-Z]+/,face=>reverse[face]));
}
