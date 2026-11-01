# Dependency Vulnerability Watcher

[![CI](https://github.com/felipewatter/dep-vuln-watcher/actions/workflows/ci.yml/badge.svg)](https://github.com/felipewatter/dep-vuln-watcher/actions/workflows/ci.yml)

Ferramenta TypeScript/Node.js de **auditoria real de vulnerabilidades em dependências npm** e comparação de vulnerabilidades entre execuções por snapshots.

## Novidades v1.1.0

A versão original utilizava um banco SIMULADO de três dependências. Esta versão usa comandos reais **npm audit --json** e **npm outdated --json** contra um projeto npm com package.json e package-lock.json. O comando não instala dependências no projeto alvo e desativa scripts npm.

- Auditoria real de advisories e classificação info, low, moderate, high, critical.
- Número de pacotes com vulnerabilidades, contagem de advisories e dependências diretas/indiretas.
- Versões desatualizadas current, wanted e latest.
- Snapshots em JSON contendo somente nome do pacote e severidade; compara novos, resolvidos e inalterados.
- Opção --fail-on-new para bloquear somente achados novos com baseline validado.
- Timeout, limite de 8 MiB da saída npm e status de erro explícito quando falham rede, registro ou parsing.

O monitoramento por snapshots ocorre **sob demanda** entre execuções. Não existe serviço ou agendador em background.

## Requisitos e instalação

Node.js 22/24, npm e conectividade ao registro npm configurado.

    git clone https://github.com/felipewatter/dep-vuln-watcher.git
    cd dep-vuln-watcher
    npm install
    npm run build
    node dist/bin/index.js --help

Instalação global opcional a partir do checkout compilado: npm install -g .

**A versão atualizada não foi publicada no registro npm.** Use o binário local; não assuma a disponibilidade de npx.

## Exemplos de uso

Auditar um projeto autorizado:

    node dist/bin/index.js ../meu-projeto/package.json --format json

Criar snapshot inicial (somente arquivo novo):

    node dist/bin/index.js ../meu-projeto/package.json --snapshot-out ./inicial.snapshot.json --fail-on none

Comparar as vulnerabilidades com um snapshot anterior:

    node dist/bin/index.js ../meu-projeto/package.json --baseline ./inicial.snapshot.json --snapshot-out ./atual.snapshot.json --fail-on-new --fail-on high --format json

Auditar sem consultar versões desatualizadas:

    node dist/bin/index.js ../meu-projeto/package.json --skip-outdated

## Opções e código de saída

| Opção | Padrão | Descrição |
|---|---|---|
| package.json ou --path FILE | obrigatório | Arquivo de manifesto npm |
| --format text/json | text | Formato |
| --fail-on none/info/low/moderate/high/critical | high | Limiar de severidade |
| --baseline FILE | nenhum | Ler snapshot anterior |
| --snapshot-out FILE | nenhum | Criar snapshot, sem sobrescrever |
| --fail-on-new | desativado | Testar somente findings novos |
| --skip-outdated | desativado | Pular apenas a consulta de desatualizados |
| --timeout MS | 30000 | Tempo por comando npm, 1000..120000 |
| --help / --version | — | Ajuda e versão |

Exit **0** = auditoria concluída sem achados no limiar configurado. Exit **1** = achados no limiar. Exit **2** = erro/resultado incompleto; não conclua que o projeto está seguro. Resultados com severidade abaixo do limiar continuam no relatório.

O comando --fail-on-new é opcional e pode permitir vulnerabilidades conhecidas históricas. O padrão é considerar **todas** as vulnerabilidades.

## Limites e privacidade

- Compatível com npm e package-lock.json. Não verifica Yarn, pnpm ou outras linguagens.
- Os advisories dependem do registro configurado e de suas atualizações; ausência de CVEs conhecidos não comprova segurança.
- Vulnerabilidades são agregadas por pacote. Os snapshots **não** mantêm IDs de CVE e comparam somente nome e severidade.
- Versões desatualizadas não provam abandono nem são necessariamente vulnerabilidades.
- Consultas npm podem transmitir metadados da árvore de dependências ao registro; examine políticas de privacidade e credenciais npm.
- Erros do npm podem conter URLs com segredos, por isso stderr e mensagens operacionais detalhadas são ocultados.
- Testes CI usam mocks determinísticos de npm; o código de produção invoca npm audit e npm outdated reais.
- Para verificações recorrentes, configure agendamento externo na sua pipeline e guarde os snapshots em local controlado.

Consulte SECURITY.md e CHANGELOG.md. Licença MIT.
