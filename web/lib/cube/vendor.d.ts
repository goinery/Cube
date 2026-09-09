declare module 'cubejs' {export default class Cube {static initSolver():void;static fromString(s:string):Cube;static random():Cube;constructor();move(s:string):Cube;solve(maxDepth?:number):string;asString():string;isSolved():boolean;}}
declare module 'rubiks-cube-solver' {const solve:(state:string,options?:{partitioned?:boolean})=>unknown;export default solve;}
