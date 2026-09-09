'use client';
import { useEffect,useRef,useState } from 'react';
import { Zap,Route,GraduationCap,ArrowUpRight,LoaderCircle,X,CheckCircle2 } from 'lucide-react';
import { useCube,patch,notify,loadPlayer,play,pause } from '@/lib/cube/store';
import { isPictureSolved } from '@/lib/cube/model';
import type { Solution,SolveMode } from '@/lib/cube/solver-core';
import { Toggle } from './Controls';
export default function SolverPanel(){const s=useCube(),[mode,setMode]=useState<SolveMode>('fast'),[pictures,setPictures]=useState(true),[result,setResult]=useState<Solution|null>(null);const worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{worker.current?.terminate();if(timer.current)clearTimeout(timer.current);patch({solving:false});},[]);
  function cancel(){worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);patch({solving:false,solveStatus:''});}
  function solve(){if(s.busy||s.solving)return;if(isPictureSolved(s.cube)){notify('魔方与图片方向均已复原。');return;}pause();patch({solving:true,solveStatus:'启动求解器…'});setResult(null);
    const w=new Worker(new URL('../../lib/cube/solver.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    timer.current=setTimeout(()=>{cancel();notify('这次搜索用时较长，已取消。可以再次尝试快速求解。');},60000);
    w.onmessage=e=>{if(e.data.type==='progress')patch({solveStatus:e.data.message});else if(e.data.type==='error'){cancel();notify(e.data.message);}else {const r=e.data.result as Solution;cancel();setResult(r);loadPlayer(r.moves,mode==='cfop'?'CFOP 分阶段还原':mode==='near'?'Near-optimal 近优求解':'Fast 快速求解',r.stages);void play();}};
    w.onerror=()=>{cancel();notify('求解器启动失败，请刷新后重试。');};w.postMessage({cube:s.cube,mode,pictures});
  }
  const options:[SolveMode,typeof Zap,string,string][]=[['fast',Zap,'Fast / 快速','两阶段搜索，优先速度与稳定性。'],['near',Route,'Near-optimal / 近优','尝试更多搜索起点，保留最短候选。'],['cfop',GraduationCap,'CFOP / 分阶段教学','Cross → F2L → OLL → PLL。']];
  return <><div className="solver-options">{options.map(([id,Icon,title,desc])=><button key={id} disabled={s.solving} className={mode===id?'active':''} aria-pressed={mode===id} onClick={()=>setMode(id)}><Icon size={20}/><span><strong>{title}</strong><small>{desc}</small></span><i/></button>)}</div><Toggle label="同时还原图片方向" value={pictures} onChange={setPictures}/><p className="microcopy">照片中心定向可能增加转层步数。近优模式不保证绝对最短解。</p><button className="primary-button solve-button" disabled={s.busy||s.solving} onClick={solve}><span>{mode==='cfop'?'CFOP 一键还原':'求解当前魔方'}</span>{s.solving?<LoaderCircle className="spin" size={18}/>:<ArrowUpRight size={18}/>}</button>
    {s.solving&&<div role="status" className="solver-progress"><LoaderCircle className="spin" size={16}/><span>{s.solveStatus}</span><button title="取消求解" aria-label="取消求解" onClick={cancel}><X size={17}/></button></div>}
    {result&&<div className="solver-result"><CheckCircle2 size={17}/><div><strong>{result.moves.length} 步 · {(result.elapsed/1000).toFixed(2)} 秒</strong><p>颜色还原 {result.colorMoves} 步{result.centerMoves>0?` + 图片定向 ${result.centerMoves} 步`:''}</p></div></div>}
    <div className="cfop-guide"><span className="eyebrow">THE FOUR STAGES</span>{[['01','Cross','对齐四个十字棱块'],['02','F2L','完成四组角棱配对'],['03','OLL','统一顶层颜色方向'],['04','PLL','排列顶层，还原六面']].map(([n,title,desc])=><div key={n}><span>{n}</span><strong>{title}</strong><p>{desc}</p></div>)}</div></>;
}
