import {readFile,lstat,writeFile} from 'node:fs/promises';
import type {DependencyReport,Severity} from './checker';
import {ranking} from './checker';
export type Snapshot={schemaVersion:1;createdAt:string;packages:{name:string;severity:Severity}[]};
export type ChangeReport={newFindings:Snapshot['packages'];resolvedFindings:Snapshot['packages'];unchangedFindings:number};
const label=(v:unknown):v is string=>typeof v==='string' && v.length>0&&v.length<=180&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
function validateSnapshot(data:unknown):Snapshot{
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid baseline snapshot');
  const d=data as Record<string,unknown>;
  if(d.schemaVersion!==1||typeof d.createdAt!=='string'||!Array.isArray(d.packages)||d.packages.length>10000)
    throw Error('Unsupported or invalid baseline schema');
  const keys=new Set<string>();
  const packages:Snapshot['packages']=[];
  for(const item of d.packages){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Invalid snapshot entry');
    const x=item as Record<string,unknown>;
    if(!label(x.name)||typeof x.severity!=='string'||!Object.hasOwn(ranking,x.severity))
      throw Error('Invalid snapshot package');
    const id=x.name+'|'+x.severity;
    if(keys.has(id))throw Error('Duplicate snapshot entry');
    keys.add(id);
    packages.push({name:x.name,severity:x.severity as Severity});
  }
  return {schemaVersion:1,createdAt:d.createdAt,packages};
}
export function createSnapshot(report:DependencyReport):Snapshot{
  return {schemaVersion:1,createdAt:report.scannedAt,
    packages:report.vulnerabilities.map(x=>({name:x.name,severity:x.severity}))};
}
export function compareSnapshots(previous:Snapshot,current:Snapshot):ChangeReport{
  const before=validateSnapshot(previous),after=validateSnapshot(current);
  const id=(x:{name:string;severity:Severity})=>x.name+'|'+x.severity;
  const prior=new Set(before.packages.map(id)),now=new Set(after.packages.map(id));
  return{newFindings:after.packages.filter(p=>!prior.has(id(p))),
    resolvedFindings:before.packages.filter(p=>!now.has(id(p))),
    unchangedFindings:after.packages.filter(p=>prior.has(id(p))).length};
}
export async function loadSnapshot(filename:string):Promise<Snapshot>{
  const stat=await lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)
    throw Error('Invalid baseline file');
  const data=await readFile(filename,'utf8');
  if(data.length>1024*1024)throw Error('Baseline file too large');
  try{return validateSnapshot(JSON.parse(data) as unknown)}
  catch{throw Error('Invalid baseline snapshot content')}
}
export async function saveSnapshot(filename:string,value:Snapshot):Promise<void>{
  const clean=validateSnapshot(value);
  // Exclusive create: never overwrite existing baseline, config or symlink.
  await writeFile(filename,JSON.stringify(clean,null,2)+'\n',{flag:'wx',mode:0o600});
}
