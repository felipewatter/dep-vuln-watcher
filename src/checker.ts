import fs from 'fs';
import { simulateNpmCheck } from './utils';

export function checkDependencies(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);
  const deps = json.dependencies || {};
  const issues: string[] = [];

  for (const pkg in deps) {
    const result = simulateNpmCheck(pkg);
    if (result.outdated) {
      issues.push(`⚠️ ${pkg} is outdated — Current: ${deps[pkg]}, Latest: ${result.latestVersion}`);
    }
    if (result.hasVuln) {
      issues.push(`⚠️ ${pkg} has known vulnerabilities — consider updating`);
    }
  }
  return issues;
}