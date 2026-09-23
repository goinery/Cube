import { apply, colorSolved, inverseMove, moveSpec, pictureSolved, rotatePoint } from './model';
import { shortSolution } from './short-search';
import { solveSmallOrMinx } from './solver-bridge';
import { simplifyMoves, solveReduction } from './reduction-solver';
import type { Definition, Message, PuzzleState, Stage } from './types';

function minxFrame(def:Definition,state:PuzzleState) {
  const centers=def.pieces.flatMap((p,i)=>p.kind==='center'?[i]:[]);
  const frame=def.group.quaternions.findIndex((_,g)=>centers.every(i=>{
    const a=rotatePoint(def,state.rotations[i],def.pieces[i].anchor),b=rotatePoint(def,g,def.pieces[i].anchor);
    return a.every((v,j)=>Math.abs(v-b[j])<1e-5);
  }));
  if(frame<0)throw new Error('solver.invalid');
  const goal=def.group.inverse[frame], paths=new Map<number,string[]>([[0,[]]]),queue=[0];
  for(let i=0;i<queue.length&&!paths.has(goal);i++)for(const face of def.faces) {
    const token='@'+face.id,g=def.group.multiply[moveSpec(def,token).rotation][queue[i]];
    if(!paths.has(g)){paths.set(g,[...paths.get(queue[i])!,token]);queue.push(g);}
  }
  return paths.get(goal)!;
}
function minxCenters(def:Definition,state:PuzzleState) {
  const values=def.faces.map(face=>{
    const piece=def.tiles.find(t=>t.face===face.id&&def.pieces[t.piece].kind==='center')!.piece;
    let g=0;for(let n=0;n<5;n++){if(g===state.rotations[piece])return n;g=def.group.multiply[moveSpec(def,face.id).rotation][g];}
    throw new Error('solver.invalid');
  });
  const adjacent=(a:number,b:number)=>def.faces[a].normal.reduce((s,v,i)=>s+v*def.faces[b].normal[i],0)>.4;
  let best:string[]|null=null;
  // (A B^-2)^18 fixes every corner and edge and turns only two adjacent centers.
  // A spanning tree transports those marked-center errors to one final pair.
  for(let root=0;root<12;root++) {
    const parent=new Array<number>(12).fill(-1),queue=[root];parent[root]=root;
    for(let i=0;i<queue.length;i++)for(let j=0;j<12;j++)if(parent[j]<0&&adjacent(queue[i],j)){parent[j]=queue[i];queue.push(j);}
    const v=[...values],result:string[]=[];
    function pair(a:number,b:number,power:number,second=false) {
      power=((power%5)+5)%5;if(!power)return;
      const word=Array.from({length:18},()=>second?[def.faces[a].id+"2'",def.faces[b].id]:[def.faces[a].id,def.faces[b].id+"2'"]).flat();
      const turns=power>2?word.reverse().map(m=>inverseMove(def,m)):word;
      for(let n=0;n<Math.min(power,5-power);n++)result.push(...turns);
      v[a]=(v[a]+power*(second?4:3))%5;v[b]=(v[b]+power*(second?3:4))%5;
    }
    for(const a of [...queue].reverse())if(a!==root)pair(a,parent[a],-2*v[a]);
    if(v[root]) {
      const b=queue[1],target=(5-v[root])%5;
      pair(root,b,target, false);pair(root,b,2*target,true);
    }
    if(v.some(Boolean))throw new Error('solver.failed');
    if(!best||result.length<best.length)best=result;
  }
  return best!;
}
export async function solvePuzzle(def:Definition,state:PuzzleState,pictures:boolean,progress:(message:Message)=>void=()=>{}) {
  if(pictures?pictureSolved(def,state):colorSolved(def,state))return {moves:[],stages:[] as Stage[]};
  const short=shortSolution(def,state);if(short)return {moves:short,stages:[] as Stage[]};
  let moves:string[];
  if(def.id==='cube-4'||def.id==='cube-5')return solveReduction(def,state,pictures,progress);
  progress({key:'solver.searching'});
  const frame=def.id==='megaminx'?minxFrame(def,state):[];
  const normalized=apply(def,state,frame);
  moves=[...frame,...await solveSmallOrMinx(def,normalized)];
  if(def.id==='megaminx'&&pictures) {
    progress({key:'solver.centerPictures'});
    moves.push(...minxCenters(def,apply(def,state,moves)));
  }
  moves=simplifyMoves(def,moves);
  const end=apply(def,state,moves);
  if(!(pictures?pictureSolved(def,end):colorSolved(def,end)))throw new Error('solver.failed');
  return {moves,stages:[] as Stage[]};
}
