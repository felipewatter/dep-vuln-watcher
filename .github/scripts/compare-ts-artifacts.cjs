'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const original = path.resolve(process.argv[2] || '');
const candidate = path.resolve(process.argv[3] || '');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stable = (v) => JSON.stringify(v ?? null);
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 16);
const norm = (s) => s.replace(/\r\n/g, '\n');
const failures = [];
const notes = [];
function check(ok, message) { if (!ok) failures.push(message); }
function walk(base, directory, prefix = '') {
  const map = new Map();
  if (!fs.existsSync(directory)) return map;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = path.posix.join(prefix, entry.name);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [k, v] of walk(base, file, rel)) map.set(k, v);
    } else if (entry.isFile() && /\.(?:js|cjs|mjs|d\.ts|d\.cts|d\.mts|map)$/.test(entry.name)) {
      map.set(rel, fs.readFileSync(file, 'utf8'));
    }
  }
  return map;
}
const oldPkg = readJson(path.join(original, 'package.json'));
const newPkg = readJson(path.join(candidate, 'package.json'));
const contract = ['name', 'version', 'private', 'type', 'main', 'types', 'bin', 'exports', 'files', 'engines', 'dependencies', 'peerDependencies', 'optionalDependencies'];
for (const key of contract) check(stable(oldPkg[key]) === stable(newPkg[key]), 'Changed package contract: ' + key);
const outOld = readJson(path.join(original, 'tsconfig.json')).compilerOptions.outDir;
const outNew = readJson(path.join(candidate, 'tsconfig.json')).compilerOptions.outDir;
check(outOld === outNew, 'Compiler output directory changed: ' + outOld + ' -> ' + outNew);
function verifyEntries(pkg, root) {
  const entries = [pkg.main, pkg.types, ...Object.values(typeof pkg.bin === 'string' ? { cli: pkg.bin } : (pkg.bin || {}))].filter(Boolean);
  for (const entry of entries) check(fs.existsSync(path.join(root, entry)), 'Missing declared entry in ' + path.basename(root) + ': ' + entry);
}
verifyEntries(oldPkg, original); verifyEntries(newPkg, candidate);
const oldFiles = walk(original, path.resolve(original, outOld));
const newFiles = walk(candidate, path.resolve(candidate, outNew));
check(oldFiles.size > 0 && newFiles.size > 0, 'No compiled files found.');
const fileNames = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
for (const f of fileNames) {
  if (!oldFiles.has(f)) failures.push('Added compiled artifact: ' + f);
  else if (!newFiles.has(f)) failures.push('Removed compiled artifact: ' + f);
  else if (norm(oldFiles.get(f)) !== norm(newFiles.get(f))) {
    if (f.endsWith('.map')) notes.push('Changed source map: ' + f);
    else failures.push('Changed compiled artifact: ' + f + ' (baseline ' + hash(norm(oldFiles.get(f))) + '; candidate ' + hash(norm(newFiles.get(f))) + ')');
  }
}
const header = '## TypeScript 5 vs 7: compiled package compatibility\n\n';
const details = [
  '- Baseline: ' + oldPkg.name + ' ' + oldPkg.version + ' (current PR base).',
  '- Compared runtime contract, declared entry paths and compiled JS / type declarations.',
  '- Compiled files: baseline ' + oldFiles.size + ', candidate ' + newFiles.size + '.',
  '- Source maps are reported, but not treated as runtime/API changes.',
  '- Result: **' + (failures.length ? 'REVIEW REQUIRED' : 'PASS') + '**.',
  ...notes.map(x => '- NOTE: ' + x),
  ...failures.map(x => '- FAIL: ' + x),
  ''
].join('\n');
const report = header + details + '\n';
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (failures.length) process.exitCode = 1;
