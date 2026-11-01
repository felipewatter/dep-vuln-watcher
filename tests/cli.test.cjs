const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {parseArgs}=require('../dist/bin/index.js');
const cli=join(__dirname,'..','dist','bin','index.js');
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:5000});
test('CLI supports documented flags and change-only policy',()=>{
  const p=parseArgs(['target/package.json','--baseline=before.json','--fail-on-new','--fail-on=critical',
    '--snapshot-out','after.json','--skip-outdated','--format=json','--timeout','6000']);
  assert.equal(p.failOn,'critical');assert.equal(p.failOnNew,true);assert.equal(p.skipOutdated,true);
  assert.equal(p.timeoutMs,6000);assert.equal(p.format,'json');
});
test('invalid CLI options fail before network or file access',()=>{
  for(const args of [[],['--bad','x'],['foo','bar'],['foo','--fail-on','severe'],
    ['foo','--fail-on-new'],['foo','--timeout','1'],['foo','--format','xml'],
    ['foo','--baseline','same','--snapshot-out','same']])
    assert.throws(()=>parseArgs(args));
});
test('CLI --help and --version succeed without installing dependencies',()=>{
  assert.equal(run(['--help']).status,0);
  assert.match(run(['--version']).stdout,/1.1.0/);
});
test('missing lockfile fails with exit 2, does not claim clean',()=>{
  const dir=mkdtempSync(join(tmpdir(),'dvw-cli-'));
  try{
    const file=join(dir,'package.json');
    writeFileSync(file,JSON.stringify({name:'fake',dependencies:{}}));
    const r=run([file,'--format=json']);
    assert.equal(r.status,2);assert.equal(r.stdout.trim(),'');
    assert.doesNotMatch(r.stderr,/safe|clean|no vulnerabilit/i);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('malformed baseline fails before invoking npm',()=>{
  const dir=mkdtempSync(join(tmpdir(),'dvw-cli-'));
  try{
    const file=join(dir,'baseline.json');
    writeFileSync(file,'{bad-json');
    const r=run(['package.json','--baseline',file]);
    assert.equal(r.status,2);assert.equal(r.stdout.trim(),'');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
