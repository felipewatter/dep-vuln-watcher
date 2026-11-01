# Segurança e privacidade

Reporte vulnerabilidades de forma privada pelo GitHub Security Advisories, quando habilitado. Não inclua credenciais npm nem URLs privadas de registry em issues.

## Funcionamento

**Não há simulação em produção.** A CLI invoca npm audit e npm outdated reais para o projeto com lockfile. Falhas de execução, parser, timeout, ausência de lockfile, código npm inesperado e limite de saída ultrapassado terminam com exit 2, nunca resultado limpo.

A CLI não executa npm install nem scripts do projeto alvo. Usa --ignore-scripts nas consultas. Não imprime stderr do npm, pois URLs com credenciais podem aparecer em mensagens de erro. Nomes e versões de pacotes são saneados.

Snapshots contêm somente nome do pacote e severidade e são criados com abertura exclusiva, sem sobrescrever arquivos existentes. Baselines inválidos causam erro, não são ignorados.

## Escopo e limites

- npm pode transmitir metadados de dependências ao registro configurado.
- Atualização disponível não comprova uma vulnerabilidade e dependências não publicadas podem escapar aos advisories.
- O snapshot acompanha pares (nome, severidade), não CVEs individuais ou a versão realmente instalada.
- --fail-on-new pode aceitar vulnerabilidades antigas; exija política explícita antes de habilitar em produção.
- A análise é estática, observacional e não substitui SBOM/SCA, revisão do lockfile e hardening do sistema.
- A ferramenta não possui agendamento, watch em background ou envio de alertas externos.
- Em Windows, o runner usa shell somente para localizar npm.cmd; os argumentos do shell são constantes, nunca construídos com entrada do usuário.
