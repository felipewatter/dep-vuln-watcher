# Changelog

## 1.1.0 — 2026-10-31

- Removido o banco simulado de vulnerabilities/outdated usado pela versão 1.0.0.
- Implementadas consultas reais de npm audit e npm outdated com JSON estruturado.
- Validação de package.json e package-lock.json, timeout, limite de saída e tratamento fail-closed.
- Relatórios texto/JSON por pacote vulnerável e versão desatualizada.
- Snapshots locais mínimos, comparação de vulnerabilidades novas/resolvidas/inalteradas e modo --fail-on-new.
- Códigos de saída 0/1/2 para automação, sem transmitir stderr potencialmente sensível.
- Testes determinísticos de npm mockado e snapshots, CI Node 22/24 em Ubuntu/Windows/macOS.

## 1.0.0 — 2025-07-07

- Protótipo com dados simulados para lodash, moment e express, não apropriado como auditoria real.
