const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,rmSync,symlinkSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {checkDependencies,normalizeAudit,normalizeOutdated}=require('../dist/src/checker.js');
const make=()=>mkdtempSync(join(tmpdir(),'dvw-check-'));
function files(dir,packageValue={dependencies:{'demo-package':'^1.0.0'},devDependencies:{'test-package':'^2.0.0'}}){
  writeFileSync(join(dir,'package.json'),JSON.stringify(packageValue));
  writeFileSync(join(dir,'package-lock.json'),JSON.stringify({name:'fixture',lockfileVersion:3,packages:{}}));
  return join(dir,'package.json');
}
const audit=(values={})=>JSON.stringify({auditReportVersion:2,metadata:{vulnerabilities:{}},vulnerabilities:values});
const vuln=(severity='high',direct=true,via=[{name:'CVE-TEST-123'}])=>({name:'demo-package',severity,isDirect:direct,via,
  effects:[],range:'<2.0.0',nodes:['node_modules/demo-package'],fixAvailable:true});
const response=(stdout,exitCode=0,rest={})=>({stdout,exitCode,timedOut:false,overflow:false,spawnError:false,...rest});
test('real audit integration uses npm CLI commands, never simulated package lookup',async()=>{
  const dir=make(),calls=[];
  try{
    const file=files(dir);
    const runner=async call=>{calls.push(call);return calls.length===1
      ?response(audit({'demo-package':vuln()}),1)
      :response(JSON.stringify({'demo-package':{current:'1.0.0',wanted:'1.2.0',latest:'2.0.0'}}),1)};
    const r=await checkDependencies(file,{runner});
    assert.equal(r.scannedDependencies,2);
    assert.deepEqual(r.vulnerabilities[0],{name:'demo-package',severity:'high',isDirect:true,advisories:1,fixAvailable:true});
    assert.deepEqual(r.outdated[0],{name:'demo-package',current:'1.0.0',wanted:'1.2.0',latest:'2.0.0'});
    assert.deepEqual(calls[0].args,['audit','--json','--ignore-scripts','--no-fund','--package-lock-only']);
    assert.deepEqual(calls[1].args,['outdated','--json','--ignore-scripts','--no-fund']);
    assert.ok(calls.every(c=>c.cwd===dir));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('zero findings requires successful npm audit with complete metadata',async()=>{
  const dir=make();
  try{
    const file=files(dir);
    const r=await checkDependencies(file,{runner:async()=>response(audit(),0),skipOutdated:true});
    assert.equal(r.vulnerabilities.length,0);assert.equal(r.outdated.length,0);
    assert.equal(r.warnings.length,1);
    assert.deepEqual(r.auditTotals,{info:0,low:0,moderate:0,high:0,critical:0});
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('invalid npm audit JSON rejects instead of reporting clean',async()=>{
  const dir=make();
  try{
    const file=files(dir);
    for(const payload of ['not-json','{}','{"error":{"message":"registry down"}}','{"metadata":{},"vulnerabilities":{"a":{}}}'])
      await assert.rejects(()=>checkDependencies(file,{runner:async()=>response(payload,1)}));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('npm audit command errors, timeouts, overflow, spawn errors fail closed',async()=>{
  const dir=make();
  try{
    const file=files(dir);
    for(const broken of [response('',2),response('',null,{timedOut:true}),
      response('',null,{overflow:true}),response('',null,{spawnError:true})]){
      await assert.rejects(()=>checkDependencies(file,{runner:async()=>broken}));
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('npm outdated exit 1 is normal when it returns valid package results',async()=>{
  const dir=make();let n=0;
  try{
    const file=files(dir);
    const r=await checkDependencies(file,{runner:async()=>++n===1?response(audit(),0):
      response(JSON.stringify({'demo-package':{current:'1',wanted:'2',latest:'3'}}),1)});
    assert.equal(r.outdated.length,1);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('npm outdated failed or empty nonzero response is not silently ignored',async()=>{
  const dir=make();
  try{
    const file=files(dir);
    for(const invalid of [response('',1),response('not JSON',1),response('',2)]){
      let n=0;
      await assert.rejects(()=>checkDependencies(file,{runner:async()=>++n===1?response(audit(),0):invalid}));
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('audit missing, invalid lockfile or symlink targets are rejected',async()=>{
  const dir=make();
  try{
    const file=join(dir,'package.json');
    writeFileSync(file,'{}');
    await assert.rejects(()=>checkDependencies(file,{runner:async()=>response(audit(),0)}));
    writeFileSync(join(dir,'package-lock.json'),'{}');
    await assert.rejects(()=>checkDependencies(join(dir,'does-not-exist.json'),{runner:async()=>response(audit(),0)}));
    await assert.rejects(()=>checkDependencies(join(dir,'other.json'),{runner:async()=>response(audit(),0)}));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('symlinked package files are refused before invoking npm',{skip:process.platform==='win32'},async()=>{
  const dir=make();
  try{
    const file=files(dir),alias=join(dir,'alias.json');
    symlinkSync(file,alias,'file');
    await assert.rejects(()=>checkDependencies(alias,{runner:async()=>response(audit(),0)}));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('invalid severity or advisory shape is rejected',()=>{
  for(const item of [vuln('urgent'),{...vuln(),isDirect:'yes'},{...vuln(),via:null}])
    assert.throws(()=>normalizeAudit(JSON.parse(audit({'demo-package':item}))));
});
test('empty or malformed outdated payloads are normalized carefully',()=>{
  assert.deepEqual(normalizeOutdated({}),[]);
  for(const v of [null,[],{'demo-package':null},{error:{message:'bad'}}])assert.throws(()=>normalizeOutdated(v));
});
test('untrusted package names and version fields are sanitized',()=>{
  const values=normalizeAudit(JSON.parse(audit({'bad\u001b[31mpkg':vuln()})));
  assert.equal(JSON.stringify(values).includes('\u001b'),false);
  const outdated=normalizeOutdated({'pkg':{current:'1\u001b[0m',wanted:'2',latest:'3'}});
  assert.equal(JSON.stringify(outdated).includes('\u001b'),false);
});
test('timeouts outside bounded range fail before executing npm',async()=>{
  const dir=make();
  try{
    const file=files(dir);
    await assert.rejects(()=>checkDependencies(file,{timeoutMs:20,runner:async()=>response(audit(),0)}));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
