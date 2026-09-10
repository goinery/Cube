import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import os from 'node:os';
const root=dirname(dirname(fileURLToPath(import.meta.url))),web=join(root,'web');
let runtime=process.execPath;
if(Number(process.versions.node.split('.')[0])<22){
  const bundled=join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','bin',process.platform==='win32'?'node.exe':'node');
  if(existsSync(bundled))runtime=bundled;else{console.error('AXIS 需要 Node.js 22.13 或更高版本。请更新 Node.js 后重试。');process.exit(1);}
}
if(!existsSync(join(web,'node_modules','vite','bin','vite.js'))){console.error('请先运行 npm install --prefix web 安装依赖。');process.exit(1);}
const task=process.argv[2]||'dev';
function run(relative,args=[],flags=[]){const r=spawnSync(runtime,[...flags,join(web,relative),...args],{cwd:web,stdio:'inherit',env:process.env});if(r.error){console.error(r.error.message);process.exit(1);}if(r.status!==0)process.exit(r.status||1);}
if(task==='build'){run('node_modules/typescript/bin/tsc',['--noEmit']);run('node_modules/vite/bin/vite.js',['build']);}
else if(task==='verify'){run('node_modules/tsx/dist/cli.mjs',['scripts/verify-core.ts']);run('node_modules/tsx/dist/cli.mjs',['scripts/verify-workflows.ts']);run('node_modules/tsx/dist/cli.mjs',['scripts/verify-interaction.ts']);run('node_modules/tsx/dist/cli.mjs',['scripts/verify-motion.ts']);run('node_modules/tsx/dist/cli.mjs',['scripts/verify-visual.ts']);run('scripts/verify-dev-worker.ts',[],['--experimental-vm-modules','--import','tsx']);}
else if(task==='start'){if(!existsSync(join(web,'dist','index.html'))){console.error('请先运行 npm run build。');process.exit(1);}run('node_modules/vite/bin/vite.js',['preview','--host','0.0.0.0','--port','3000']);}
else run('node_modules/vite/bin/vite.js',['--host','0.0.0.0','--port','3000']);
