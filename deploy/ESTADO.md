# Estado do deploy — vitrinedeapps.cloud

Atualizado em 16/08/2026.

## Concluído

- [x] Chave SSH `vitrine-deploy` gerada e cadastrada no hPanel
- [x] Conexão SSH funcionando (`.keys/vitrine_deploy`, ACL corrigida)
- [x] Código enviado para `~/domains/vitrinedeapps.cloud/public_html`
- [x] Dependências instaladas com Node 24.6.0 do servidor
- [x] `.env` de produção criado no servidor com `chmod 600`
- [x] **Servidor validado rodando na Hostinger** — `/api/saude` e `/api/apps`
      respondem com os 5 apps vindos do MariaDB

## Bloqueado — precisa de decisão

O domínio ainda serve `default.php` porque **o site é do tipo PHP/HTML, não
Web App (Node.js)**. Confirmado em Sites → Web Apps: `vitrinedeapps.cloud`
não aparece na lista (aparecem `ebooksaude.store`, `cerebroduplo.shop` e dois
temporários).

O menu de ações do site oferece apenas: favoritos, etiqueta, alterar domínio,
detalhes e Remover. **Não há conversão de tipo.**

### Opções

1. **Remover e recriar como Web App** — resolve, mas é destrutivo: pode afetar
   SSL, e-mails e configurações associadas ao domínio.
2. **Apontar um dos Web Apps existentes** para este projeto, se algum dos dois
   temporários (`darkgrey-penguin`, `hotpink-tiger`) estiver livre, e depois
   trocar o domínio deles para vitrinedeapps.cloud.
3. **Adicionar um subdomínio** como Web App (ex.: `app.vitrinedeapps.cloud`)
   e deixar o domínio raiz como está.

A opção 3 é a menos arriscada.

## Ambiente do servidor (para referência)

- Node: `/opt/alt/alt-nodejs24/root/usr/bin/node` (v24.6.0), npm 11.5.1
- `node` NÃO está no PATH por padrão — exportar antes de cada comando
- Destino: `~/domains/vitrinedeapps.cloud/public_html`
- A conta hospeda 22 domínios — cuidado com comandos destrutivos
- Tráfego passa pelo CDN (`Server: hcdn`), respostas podem ficar cacheadas
