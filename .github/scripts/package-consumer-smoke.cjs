'use strict';
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), cp=require('node:child_process');
const project=process.cwd(), original=JSON.parse(fs.readFileSync('package.json','utf8'));
const summary=[],fail=(message)=>{throw new Error(message)};
const requireInside=(root,rel)=>{if(!rel)return;const target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))fail('Entry escapes installed package: '+rel);if(!fs.statSync(target,{throwIfNoEntry:false})?.isFile())fail('Missing published entry: '+rel);if(/\.(?:cjs|mjs|js)$/.test(rel))cp.execFileSync(process.execPath,['--check',target],{stdio:'pipe'});return target;};
const node=process.version;
if(original.private===true){
  if(original.name!=='secure-api-gateway')fail('Unexpected private package; refusing packaging');
  requireInside(project,'dist/index.js');
  summary.push('Private application: no npm pack/install/publish attempted; built entry syntax verified on '+node);
}else{
  const meta=JSON.parse(cp.execFileSync('npm',['pack','--ignore-scripts','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
  if(!meta.filename || !meta.files?.length)fail('Empty or malformed npm pack result');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ts-consumer-'));
  try{
    fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify({name:'ts-compat-consumer',private:true,version:'0.0.0'}));
    cp.execFileSync('npm',['install','--ignore-scripts','--omit=dev','--no-audit','--no-fund',path.join(project,meta.filename)],{cwd:temp,stdio:'pipe',timeout:120000});
    const root=path.join(temp,'node_modules',original.name);
    const installed=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    for(const prop of ['name','version','main','types','bin','exports','engines','dependencies','peerDependencies']){
      if(JSON.stringify(installed[prop]??null)!==JSON.stringify(original[prop]??null))fail('Packaged metadata changed: '+prop);
    }
    const paths=[installed.main,installed.types,...Object.values(typeof installed.bin==='string'?{cli:installed.bin}:(installed.bin||{}))].filter(Boolean);
    for(const p of paths)requireInside(root,p);
    if(installed.main && /\.(?:js|cjs)$/.test(installed.main)){
      const main=requireInside(root,installed.main);
      if(!require('node:module').createRequire(path.join(temp,'package.json')).resolve(original.name))fail('Cannot resolve installed library');
      // Only resolution and syntax: do not auto-start CLI or network-facing servers.
    }
    summary.push('Consumer install '+node+': npm pack + isolated npm install + declared entries + syntax passed ('+meta.files.length+' packed files)');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
const result='### Consumer compatibility — '+original.name+'\n\n'+summary.join('\n')+'\n';
process.stdout.write(result);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,result);
