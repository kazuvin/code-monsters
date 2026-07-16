import { spawnSync } from 'node:child_process';

const packageManager=process.env.npm_execpath;
const commands=[
  packageManager
    ? {label:'production build',command:process.execPath,args:[packageManager,'build']}
    : {label:'production build',command:process.platform==='win32'?'pnpm.cmd':'pnpm',args:['build']},
  {label:'core rules',command:process.execPath,args:['scripts/core-test.mjs']},
  {label:'combat math',command:process.execPath,args:['scripts/combat-test.mjs']},
  {label:'power balance',command:process.execPath,args:['scripts/balance-check.mjs']},
];

for(const task of commands){
  console.log(`\n[verify] ${task.label}`);
  const result=spawnSync(task.command,task.args,{stdio:'inherit',env:process.env});
  if(result.error){
    console.error(`[verify] ${task.label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if(result.status!==0){
    console.error(`[verify] ${task.label} failed with exit code ${result.status}`);
    process.exit(result.status??1);
  }
}

console.log('\n[verify] PASS');
