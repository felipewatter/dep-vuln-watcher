const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {createSnapshot,compareSnapshots,loadSnapshot,saveSnapshot}=require('../dist/src/snapshot.js');
const snapshot=(packages)=>({schemaVersion:1,createdAt:'2026-10-31T00:00:00Z',packages});
test('snapshot captures only package name and severity, never advisory URLs',()=>{
  const report={scannedAt:new Date().toISOString(),vulnerabilities:[{name:'a',severity:'high',
    isDirect:true,advisories:2,fixAvailable:true,extraSecret:'private'}]};
  const s=createSnapshot(report);
  assert.deepEqual(s.packages,[{name:'a',severity:'high'}]);
  assert.ok(!JSON.stringify(s).includes('private'));
});
test('snapshot diff reports new, resolved, unchanged and severity upgrades',()=>{
  const before=snapshot([{name:'fixed',severity:'high'},{name:'upgraded',severity:'medium'},{name:'same',severity:'low'}]);
  const after=snapshot([{name:'upgraded',severity:'critical'},{name:'same',severity:'low'},{name:'new',severity:'high'}]);
  const change=compareSnapshots(before,after);
  assert.equal(change.newFindings.length,2);
  assert.equal(change.resolvedFindings.length,2);
  assert.equal(change.unchangedFindings,1);
});
test('malformed and forged baselines never accepted',()=>{
  for(const v of [snapshot([{name:'a',severity:'remote'}]),snapshot([{name:'a\nprivate',severity:'high'}]),
    snapshot([{name:'a',severity:'high'},{name:'a',severity:'high'}]),{schemaVersion:99,packages:[]}])
    assert.throws(()=>compareSnapshots(v,snapshot([])));
});
test('snapshot saved with exclusive create and can be loaded back',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'dvw-snapshot-'));
  try{
    const file=join(dir,'report.snapshot.json'),s=snapshot([{name:'pkg',severity:'high'}]);
    await saveSnapshot(file,s);
    assert.deepEqual(await loadSnapshot(file),s);
    await assert.rejects(()=>saveSnapshot(file,s),/EEXIST/);
    assert.ok(!readFileSync(file,'utf8').includes('tokenValue'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('invalid snapshots cannot be used as baseline',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'dvw-snapshot-'));
  try{
    const file=join(dir,'fake.json');
    require('node:fs').writeFileSync(file,'{"schemaVersion":1,"packages":[{"name":"abc","severity":"x"}]}');
    await assert.rejects(()=>loadSnapshot(file),/Invalid baseline/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
