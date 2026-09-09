import { solveState } from './solver-core';
self.onmessage=e=>{const {cube,mode,pictures}=e.data;try{const result=solveState(cube,mode,pictures,message=>self.postMessage({type:'progress',message}));self.postMessage({type:'result',result});}catch(error){self.postMessage({type:'error',message:(error as Error).message});}};
