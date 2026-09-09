import React from 'react';
import { createRoot } from 'react-dom/client';
import CubeApp from './components/cube/CubeApp';
import './app/globals.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}>{
  state={error:false};static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?<div className="fatal-error"><h1>工作室遇到一个问题</h1><p>已保存的方案仍在此浏览器中。重新加载后继续。</p><button onClick={()=>location.reload()}>重新加载</button></div>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><CubeApp/></ErrorBoundary>);
