export function simulateNpmCheck(packageName: string): { outdated: boolean; hasVuln: boolean; latestVersion: string } {
  // Simulação: em projeto real, consultar API do NPM ou Snyk
  const simulatedDb = {
    lodash: { outdated: true, hasVuln: false, latestVersion: "4.17.21" },
    moment: { outdated: false, hasVuln: true, latestVersion: "2.29.4" },
    express: { outdated: false, hasVuln: false, latestVersion: "4.18.2" },
  };
  return simulatedDb[packageName] || { outdated: false, hasVuln: false, latestVersion: "" };
}