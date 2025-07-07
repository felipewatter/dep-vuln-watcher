#!/usr/bin/env node
import { checkDependencies } from '../src/checker';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Please provide a path to package.json');
  process.exit(1);
}

console.log('🔎 Dependency Vulnerability Watcher\n---------------------------------------');

const issues = checkDependencies(args[0]);
if (issues.length === 0) {
  console.log('✔️ All dependencies are up to date and safe');
} else {
  for (const issue of issues) {
    console.log(issue);
  }
  console.log(`---------------------------------------\nSummary: ${issues.length} issues found`);
}