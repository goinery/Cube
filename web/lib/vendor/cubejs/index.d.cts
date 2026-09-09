declare class Cube {static initSolver():void;static fromString(s:string):Cube;static random():Cube;constructor();move(s:string):Cube;solve(maxDepth?:number):string;asString():string;isSolved():boolean;}
export = Cube;
