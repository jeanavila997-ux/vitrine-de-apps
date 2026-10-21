# Estado do deploy

Atualizado em 20/10/2026. Detalhes de infraestrutura (caminhos, domínios da
conta, ambiente do servidor) ficam em `deploy/PRIVADO.md`, local e
git-ignorado.

## Concluído na hospedagem compartilhada (16/08/2026)

- [x] Chave SSH de deploy gerada e cadastrada no painel da hospedagem
- [x] Conexão SSH funcionando (chave em `.keys/`, ACL corrigida no Windows)
- [x] Código enviado ao servidor e dependências instaladas com Node 24
- [x] `.env` de produção criado no servidor com `chmod 600`
- [x] Servidor validado rodando — `/api/saude` e `/api/apps` respondem com
      os apps vindos do MariaDB

## Bloqueado

O domínio continua servindo a página padrão porque o site foi criado como
**PHP/HTML, não Web App (Node.js)**, e o painel não converte o tipo. As saídas
avaliadas foram recriar o site como Web App (destrutivo), reaproveitar um Web
App existente ou criar um subdomínio como Web App (a menos arriscada).

Desde então o domínio foi perdido e o plano passou a ser levar a Vitrine para
a VPS (ver `PLANO.md`). Este bloqueio só importa se a hospedagem compartilhada
voltar a ser o alvo.
