import {spawn} from 'node:child_process';
export type NpmCall={args:readonly string[];cwd:string;timeoutMs:number};
export type NpmResult={exitCode:number|null;stdout:string;timedOut:boolean;overflow:boolean;spawnError:boolean};
export type NpmRunner=(call:NpmCall)=>Promise<NpmResult>;
export const MAX_OUTPUT_BYTES=8*1024*1024;
export function safeLabel(value:unknown):string{
  if(typeof value!=='string')return 'unknown';
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'?').replace(/\x1b\[[0-9;]*m/g,'?').slice(0,180);
}
/**
 * No shell interpolation of user input. On Windows, shell mode is used only to
 * resolve npm.cmd; arguments are constants, never project-controlled strings.
 */
export const npmRunner:NpmRunner=({args,cwd,timeoutMs})=>new Promise(resolve=>{
  const windows=process.platform==='win32';
  let stdout='',size=0,settled=false,timedOut=false,overflow=false,spawnError=false;
  let exitCode:number|null=null;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const finish=()=>{
    if(settled)return;settled=true;if(timer)clearTimeout(timer);
    resolve({exitCode,stdout,timedOut,overflow,spawnError});
  };
  const child=spawn(windows?'npm.cmd':'npm',[...args],{
    cwd,windowsHide:true,shell:windows,env:{...process.env,NO_COLOR:'1',npm_config_progress:'false'},
    stdio:['ignore','pipe','pipe']
  });
  timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
  child.stdout?.on('data',(chunk:Buffer)=>{
    size+=chunk.length;
    if(size>MAX_OUTPUT_BYTES){overflow=true;child.kill('SIGKILL');return;}
    stdout+=chunk.toString('utf8');
  });
  // Stderr is deliberately discarded: npm/provider logs may include URLs with credentials.
  child.stderr?.resume();
  child.once('error',()=>{spawnError=true;finish();});
  child.once('close',code=>{exitCode=code;finish();});
});
