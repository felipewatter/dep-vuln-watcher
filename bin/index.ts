#!/usr/bin/env node
import {checkDependencies,ranking,type Severity,type DependencyReport} from '../src/checker';
import {createSnapshot,compareSnapshots,loadSnapshot,saveSnapshot,type ChangeReport} from '../src/snapshot';
import {safeLabel} from '../src/utils';
type Options={file:string;format:'text'|'json';failOn:'none'|Severity;failOnNew:boolean;
  timeoutMs:number;skipOutdated:boolean;baselineFile?:string;snapshotOut?:string};
const HELP=[
'Dependency Vulnerability Watcher v1.1.0 — real npm audit and change tracking',
'Usage: dep-vuln-watcher <path/to/package.json> [options]',
'  --path FILE             Alternative to positional package.json',
'  --format text|json      Defaults to text',
'  --fail-on none|info|low|moderate|high|critical    Default: high',
'  --baseline FILE         Read a prior JSON snapshot to compare changes',
'  --snapshot-out FILE     Create a new snapshot (never overwrites existing file)',
'  --fail-on-new           Apply --fail-on only to NEW findings vs --baseline',
'  --skip-outdated         Skip npm outdated, but still require successful npm audit',
'  --timeout MS            npm subprocess timeout: 1000..120000 (default 30000)',
'  --help / --version      Show help and version',
'Exit: 0=no findings at threshold, 1=findings, 2=operational/incomplete audit.',
'Requires package-lock.json. Network to npm registry may be used.',
'No installed package is executed, and script hooks are disabled.'
].join('\n');
export function parseArgs(args:readonly string[]):Options|'help'|'version'{
  const options:Options={file:'',format:'text',failOn:'high',failOnNew:false,timeoutMs:30000,skipOutdated:false};
  for(let i=0;i<args.length;i++){
    const arg=args[i]!,eq=arg.indexOf('='),key=eq<0?arg:arg.slice(0,eq);
    if(key==='--help'||key==='-h')return 'help';
    if(key==='--version'||key==='-v')return 'version';
    if(['--skip-outdated','--fail-on-new'].includes(key)){
      if(eq>=0)throw Error('Unexpected flag value');
      if(key==='--skip-outdated')options.skipOutdated=true;else options.failOnNew=true;
      continue;
    }
    if(!key.startsWith('--')){
      if(options.file)throw Error('Specify only one package file');
      options.file=arg;continue;
    }
    if(!['--path','--format','--fail-on','--baseline','--snapshot-out','--timeout'].includes(key))
      throw Error('Unknown option');
    const val=eq<0?args[++i]:arg.slice(eq+1);
    if(!val||(eq<0&&val.startsWith('--')))throw Error('Missing option argument');
    switch(key){
      case '--path':if(options.file)throw Error('Package file already selected');options.file=val;break;
      case '--format':if(val!=='json'&&val!=='text')throw Error('Invalid output format');options.format=val;break;
      case '--fail-on':
        if(!['none','info','low','moderate','high','critical'].includes(val))throw Error('Invalid severity');
        options.failOn=val as Options['failOn'];break;
      case '--baseline':options.baselineFile=val;break;
      case '--snapshot-out':options.snapshotOut=val;break;
      case '--timeout':{
        if(!/^[1-9][0-9]*$/.test(val))throw Error('Invalid timeout');
        const n=Number(val);if(!Number.isSafeInteger(n)||n<1000||n>120000)throw Error('Invalid timeout');
        options.timeoutMs=n;break;
      }
    }
  }
  if(!options.file)throw Error('Path to package.json required');
  if(options.failOnNew&&!options.baselineFile)throw Error('--fail-on-new requires --baseline');
  if(options.snapshotOut&&options.snapshotOut===options.baselineFile)throw Error('Snapshot and baseline files must be distinct');
  return options;
}
function draw(report:DependencyReport,change:ChangeReport|null,format:Options['format'],passed:boolean):string{
  if(format==='json')return JSON.stringify({...report,changes:change,passed},null,2);
  const lines=['Dependency Vulnerability Watcher v1.1.0',
    'Audit: complete | Dependencies declared: '+report.scannedDependencies,
    'Vulnerable packages: '+report.vulnerabilities.length,
    'Outdated packages: '+report.outdated.length];
  for(const v of report.vulnerabilities)
    lines.push('['+v.severity.toUpperCase()+'] '+safeLabel(v.name)+' (advisories: '+v.advisories+', direct: '+v.isDirect+')');
  for(const p of report.outdated)
    lines.push('[OUTDATED] '+safeLabel(p.name)+' ('+safeLabel(p.current)+' -> '+safeLabel(p.latest)+')');
  for(const w of report.warnings)lines.push('[NOTE] '+safeLabel(w));
  if(change)lines.push('Changes vs baseline: +'+change.newFindings.length+
    ' new, -'+change.resolvedFindings.length+' resolved, '+change.unchangedFindings+' unchanged');
  lines.push('Threshold passed: '+passed);
  return lines.join('\n');
}
export async function main(args:readonly string[]=process.argv.slice(2)):Promise<number>{
  let options:ReturnType<typeof parseArgs>;
  try{options=parseArgs(args)}catch{console.error('Dependency Vulnerability Watcher: invalid options. Use --help.');return 2}
  if(options==='help'){console.log(HELP);return 0}
  if(options==='version'){console.log('1.1.0');return 0}
  try{
    // Baseline is read BEFORE network I/O, so malformed input never silently falls back.
    const baseline=options.baselineFile?await loadSnapshot(options.baselineFile):null;
    const report=await checkDependencies(options.file,{timeoutMs:options.timeoutMs,skipOutdated:options.skipOutdated});
    const current=createSnapshot(report);
    const change=baseline?compareSnapshots(baseline,current):null;
    const findings=options.failOnNew?change!.newFindings:report.vulnerabilities;
    const rank=options.failOn==='none'?100:ranking[options.failOn];
    const failed=findings.some(x=>ranking[x.severity]>=rank);
    // Never write snapshots for incomplete audits.
    if(options.snapshotOut)await saveSnapshot(options.snapshotOut,current);
    console.log(draw(report,change,options.format,!failed));
    return failed?1:0;
  }catch{
    // Never disclose npm stderr, credential-bearing registry URLs or file contents.
    console.error('Dependency Vulnerability Watcher: npm audit failed or scan incomplete. No clean result produced.');
    return 2;
  }
}
if(require.main===module)void main().then(code=>{process.exitCode=code;});
