import { solved as cubeSolved, type Basis, type Vec } from '../cube/model';
import { solveState } from '../cube/solver-core';
import { apply, definition, inverseMove, rotatePoint, solved, pictureSolved, colorSolved } from './model';
import { solveSmallOrMinx } from './solver-bridge';
import { solveFourColor } from './four-phase';
import type { Definition, Message, PuzzleState, Stage } from './types';

const near=(a:number[],b:number[])=>a.every((v,i)=>Math.abs(v-b[i])<1e-5);
const inverse=(def:Definition, moves:string[])=>[...moves].reverse().map(m=>inverseMove(def,m));
function parity(p:number[]) { let odd=0;for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)odd^=Number(p[i]>p[j]);return odd; }
function permutation(def:Definition,state:PuzzleState,pieces:number[]) {
  return pieces.map(i=>pieces.findIndex(j=>near(rotatePoint(def,state.rotations[i],def.pieces[i].anchor),def.pieces[j].anchor)));
}
const seeds:Record<string,string>={
  wing:"R U 2R U' R' U 2R' U'",
  center:"R 2U 2R 2U' R' 2U 2R' 2U'",
  'x-center':"R 2U 2R 2U' R' 2U 2R' 2U'",
  't-center':"R 2U 3R 2U' R' 2U 3R' 2U'",
};
type CycleTable={ pieces:number[]; words:Map<number,string[]> };
const tables=new Map<string,CycleTable>();
const cycleKey=(a:number,b:number,c:number)=>a<b&&a<c ? (a*24+b)*24+c : b<c ? (b*24+c)*24+a : (c*24+a)*24+b;
function cycleTable(def:Definition,kind:string) {
  const key=def.id+kind, cached=tables.get(key);if(cached)return cached;
  const pieces=def.pieces.flatMap((p,i)=>p.kind===kind?[i]:[]);
  const seed=seeds[kind].split(' '), result=apply(def,solved(def),seed);
  if(result.rotations.some((r,i)=>r && !pieces.includes(i)))throw new Error('solver.invalid');
  const perm=permutation(def,result,pieces), a=perm.findIndex((p,i)=>p!==i), b=perm[a], c=perm[b];
  if(perm[c]!==a||perm.filter((p,i)=>p!==i).length!==3)throw new Error('solver.invalid');
  const generators=def.primitiveMoves.flatMap(m=>[m,m+"'",m+'2']);
  const permutations=generators.map(m=>permutation(def,apply(def,solved(def),[m]),pieces));
  const words=new Map<number,string[]>(),queue:[[number,number,number],string[]][]=[[[a,b,c],seed]];
  words.set(cycleKey(a,b,c),seed);
  for(let i=0;i<queue.length;i++) {
    const [cycle,word]=queue[i];
    for(let g=0;g<generators.length;g++) {
      const next=cycle.map(v=>permutations[g][v]) as [number,number,number],key=cycleKey(...next);
      if(words.has(key))continue;
      const newWord=[inverseMove(def,generators[g]),...word,generators[g]];
      words.set(key,newWord);queue.push([next,newWord]);
    }
  }
  if(words.size!==4048)throw new Error('solver.invalid');
  const table={pieces,words};tables.set(key,table);return table;
}
export function simplifyMoves(def:Definition,moves:string[]) {
  const result:string[]=[];
  const order=def.id==='megaminx'?5:4;
  for(const token of moves) {
    const match=token.match(/^(.*?)(2'?|')?$/)!;
    const base=match[1], turns=match[2]==="2'"?-2:match[2]==='2'?2:match[2]==="'"?-1:1;
    const previous=result.at(-1)?.match(/^(.*?)(2'?|')?$/);
    if(previous?.[1]===base) {
      result.pop();const a=previous[2]==="2'"?-2:previous[2]==='2'?2:previous[2]==="'"?-1:1;
      const n=((a+turns)%order+order)%order;
      if(n)result.push(base+(n===1?'':n===order-1?"'":n===2?'2':"2'"));
    } else result.push(token);
  }
  return result;
}
function reducedThree(def:Definition,state:PuzzleState) {
  return cubeSolved().map(piece=>{
    const index=def.pieces.findIndex(p=>near(p.anchor,piece.home.map(x=>x*(def.order-1))));
    if(index<0)throw new Error('solver.invalid');
    const rotation=state.rotations[index];
    return {...piece,pos:rotatePoint(def,rotation,piece.home).map(Math.round) as Vec,
      basis:([[1,0,0],[0,1,0],[0,0,1]] as Vec[]).map(v=>rotatePoint(def,rotation,v).map(Math.round)) as Basis};
  });
}
export async function solveReduction(def:Definition,initial:PuzzleState,pictures:boolean,progress:(message:Message)=>void) {
  let state=initial;
  const moves:string[]=[], stages:Stage[]=[];
  const add=(sequence:string[],key:string)=> {const start=moves.length;moves.push(...sequence);state=apply(def,state,sequence);stages.push({key,start,end:moves.length});};
  if(def.order===4&&!pictures) {
    progress({key:'solver.reducing'});
    const result=solveFourColor(def,state);
    if(!colorSolved(def,apply(def,state,result)))throw new Error('solver.failed');
    return {moves:simplifyMoves(def,result),stages:[] as Stage[]};
  }
  if(def.order===4) {
    const two=definition('cube-2');
    const corners={rotations:two.pieces.map(p=>{
      const i=def.pieces.findIndex(q=>q.kind==='corner'&&near(q.anchor,p.anchor.map(x=>x*3)));
      return state.rotations[i];
    })};
    progress({key:'solver.corners'});
    add(await solveSmallOrMinx(two,corners),'solver.corners');
  } else {
    progress({key:'solver.reduced'});
    add(solveState(reducedThree(def,state),'fast',pictures).moves,'solver.reduced');
  }
  const wings=def.pieces.flatMap((p,i)=>p.kind==='wing'?[i]:[]);
  if(parity(permutation(def,state,wings)))add(['2R'],'solver.parity');
  for(const kind of def.order===4?['wing','center']:['wing','x-center','t-center']) {
    progress({key:'solver.orbit',params:{kindKey:`puzzle.${kind}`}});
    const table=cycleTable(def,kind),start=moves.length;
    let p=permutation(def,state,table.pieces);
    if(!pictures && kind.includes('center')) {
      const face=(i:number)=>def.tiles.find(t=>t.piece===i)!.face;
      const available=new Set(p.map((_,i)=>i));const goal=new Array<number>(24).fill(-1);
      p.forEach((slot,i)=>{if(face(table.pieces[i])===face(table.pieces[slot])){goal[i]=slot;available.delete(slot);}});
      goal.forEach((slot,i)=>{if(slot<0){const next=[...available].find(j=>face(table.pieces[i])===face(table.pieces[j]))!;goal[i]=next;available.delete(next);}});
      if(parity(goal)!==parity(p)) {const a=0,b=goal.findIndex((_,i)=>i!==a&&face(table.pieces[i])===face(table.pieces[a]));[goal[a],goal[b]]=[goal[b],goal[a]];}
      // Rename identical center pieces to their chosen target slots.
      const renamed=new Array<number>(24);p.forEach((slot,i)=>renamed[goal[i]]=slot);p=renamed;
    }
    if(parity(p))throw new Error('solver.invalid');
    for(let iteration=0;iteration<24 && p.some((v,i)=>v!==i);iteration++) {
      const i=p.findIndex((v,i)=>v!==i), j=p[i];
      const k=p[j]!==i ? p[j] : p.findIndex((v,h)=>v!==h&&h!==i&&h!==j);
      if(k<0)throw new Error('solver.invalid');
      const word=table.words.get(cycleKey(j,i,k));if(!word)throw new Error('solver.invalid');
      moves.push(...word);state=apply(def,state,word);
      p=p.map(v=>v===j?i:v===i?k:v===k?j:v);
    }
    if(p.some((v,i)=>v!==i))throw new Error('solver.failed');
    stages.push({key:'solver.orbit',params:{kindKey:`puzzle.${kind}`},start,end:moves.length});
  }
  if(!(pictures?pictureSolved(def,state):colorSolved(def,state)))throw new Error('solver.failed');
  return {moves:simplifyMoves(def,moves),stages:[] as Stage[]};
}
