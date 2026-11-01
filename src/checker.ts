import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {npmRunner, type NpmRunner, type NpmResult, safeLabel} from './utils';
export type Severity='info'|'low'|'moderate'|'high'|'critical';
export type Vulnerability={name:string;severity:Severity;isDirect:boolean;advisories:number;fixAvailable:boolean};
export type Outdated={name:string;current:string;wanted:string;latest:string};
export type DependencyReport={
  schemaVersion:1;scannedAt:string;project:string;scannedDependencies:number;
  vulnerabilities:Vulnerability[];outdated:Outdated[];warnings:string[];
  auditTotals:{info:number;low:number;moderate:number;high:number;critical:number};
};
export type ScanOptions={timeoutMs?:number;skipOutdated?:boolean;runner?:NpmRunner};
const ranking:Record<Severity,number>={info:0,low:1,moderate:2,high:3,critical:4};
export {ranking};
const allowed=(v:unknown):v is Severity=>typeof v==='string'&&Object.hasOwn(ranking,v);
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const parseJson=(s:string):unknown=>{try{return JSON.parse(s) as unknown}catch{throw Error('npm produced invalid JSON; scan incomplete')}};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function checkResult(r:NpmResult,context:string):void{
  if(r.spawnError||r.timedOut||r.overflow||r.exitCode===null)throw Error(context+' failed or exceeded limits');
}
export function normalizeAudit(payload:unknown):{vulnerabilities:Vulnerability[];totals:DependencyReport['auditTotals']}{
  if(!object(payload)||own(payload,'error')||!object(payload.metadata)||!object(payload.vulnerabilities))
    throw Error('Malformed npm audit output; scan incomplete');
  const totals={info:0,low:0,moderate:0,high:0,critical:0};
  const list:Vulnerability[]=[];
  for(const [name,raw] of Object.entries(payload.vulnerabilities)){
    if(!object(raw)||!allowed(raw.severity)||typeof raw.isDirect!=='boolean'||!Array.isArray(raw.via))
      throw Error('Malformed npm vulnerability entry');
    if(list.length>=10000)throw Error('Too many vulnerability entries');
    const via=raw.via.filter(x=>object(x)&&typeof x.name==='string');
    list.push({name:safeLabel(name),severity:raw.severity,isDirect:raw.isDirect,
      advisories:via.length,fixAvailable:raw.fixAvailable === true || object(raw.fixAvailable)});
    totals[raw.severity]++;
  }
  return {vulnerabilities:list.sort((a,b)=>a.name.localeCompare(b.name)),totals};
}
export function normalizeOutdated(payload:unknown):Outdated[]{
  if(!object(payload)||own(payload,'error'))throw Error('Invalid npm outdated JSON');
  const output:Outdated[]=[];
  for(const [name,raw] of Object.entries(payload)){
    if(!object(raw))throw Error('Malformed outdated package entry');
    if(output.length>=10000)throw Error('Too many outdated entries');
    output.push({name:safeLabel(name),current:safeLabel(raw.current??'unknown'),
      wanted:safeLabel(raw.wanted??'unknown'),latest:safeLabel(raw.latest??'unknown')});
  }
  return output.sort((a,b)=>a.name.localeCompare(b.name));
}
async function safePackage(file:string):Promise<{directory:string;dependencies:number}>{
  const full=path.resolve(file),st=await lstat(full);
  if(!st.isFile()||st.isSymbolicLink()||st.size>1024*1024)throw Error('Expected regular package.json under 1 MiB');
  if(path.basename(full)!=='package.json')throw Error('Expected a package.json file');
  const project=path.dirname(full);
  const lock=path.join(project,'package-lock.json');
  const lockSt=await lstat(lock);
  if(!lockSt.isFile()||lockSt.isSymbolicLink()||lockSt.size>32*1024*1024)throw Error('Valid package-lock.json required');
  const payload=parseJson((await readFile(full)).toString('utf8'));
  if(!object(payload))throw Error('Malformed package.json');
  const direct=object(payload.dependencies)?Object.keys(payload.dependencies).length:0;
  const dev=object(payload.devDependencies)?Object.keys(payload.devDependencies).length:0;
  return {directory:project,dependencies:direct+dev};
}
export async function checkDependencies(input:string,options:ScanOptions={}):Promise<DependencyReport>{
  const timeoutMs=options.timeoutMs??30000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('Invalid npm timeout');
  const pkg=await safePackage(input);
  const run=options.runner??npmRunner;
  const audit=await run({cwd:pkg.directory,timeoutMs,args:['audit','--json','--ignore-scripts','--no-fund','--package-lock-only']});
  checkResult(audit,'npm audit');
  // Exit 1 is the documented npm audit result for known vulnerabilities.
  if(audit.exitCode!==0&&audit.exitCode!==1)throw Error('npm audit command failed');
  const result=normalizeAudit(parseJson(audit.stdout));
  if(audit.exitCode===0&&result.vulnerabilities.length>0)
    throw Error('npm audit returned inconsistent exit status');
  const outdated:Outdated[]=[];
  const warnings:string[]=[];
  if(!options.skipOutdated){
    const response=await run({cwd:pkg.directory,timeoutMs,args:['outdated','--json','--ignore-scripts','--no-fund']});
    checkResult(response,'npm outdated');
    // npm outdated returns 1 when it finds outdated dependencies.
    if(response.exitCode!==0&&response.exitCode!==1)throw Error('npm outdated command failed');
    if(response.stdout.trim()){
      outdated.push(...normalizeOutdated(parseJson(response.stdout)));
    }
    if(response.exitCode===1&&outdated.length===0)throw Error('npm outdated returned no verifiable results');
  }else warnings.push('Outdated check deliberately skipped by operator');
  return {schemaVersion:1,scannedAt:new Date().toISOString(),project:'.',
    scannedDependencies:pkg.dependencies,vulnerabilities:result.vulnerabilities,
    outdated,warnings,auditTotals:result.totals};
}
/** v1.0 helper, now uses real npm audit and requires a lockfile. */
export async function checkDependencyIssues(input:string):Promise<string[]>{
  const result=await checkDependencies(input);
  return [...result.vulnerabilities.map(v=>v.name+': '+v.severity),
    ...result.outdated.map(v=>v.name+': outdated')];
}
