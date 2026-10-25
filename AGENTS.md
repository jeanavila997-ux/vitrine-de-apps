# Vitrine de Apps — notas para agentes

Leia `CLAUDE.md` antes de mudar servidor, banco ou deploy. Este arquivo só
guarda o que a máquina atual exige.

- Pasta única: `C:\Users\Jean\Projetos\ProjetosPessoais\vitrine-de-apps`.
  Não há cópia em `Projetos\`.
- Servidor: `npm start` → `http://127.0.0.1:4400`. Use `127.0.0.1`, nunca
  `localhost` (no Windows isso cai em IPv6 e o app não responde).
- Catálogo: `server/apps-registry.json`. Depois de editar, rode
  `npm run db:seed` e `npm run pages:build`.
- Apps visíveis moram nesta máquina. Cruzamento:
  `C:\Users\Jean\app-cruzamento-bovinos` (branch `main-`, porta 5173).
  NEXO Lab: `C:\Users\Jean\nexo-lab` (Vite na 3000).
- Não dê `comando_start` à própria vitrine. Parar o PID da porta 4400
  derruba este servidor. `pararApp` recusa app sem comando de start.
- No Windows, `npm`/`pnpm` sobem via `cmd.exe` (`process-manager.js`).
  Spawn direto de `npm` devolve ENOENT.
- Vite resolve `localhost` para `::1` no Windows e passa a escutar SÓ em
  `[::1]` — aí o link `http://127.0.0.1:<porta>` do catálogo não conecta.
  Todo `vite.config.ts` desta máquina precisa de `server.host = '127.0.0.1'`
  (ou `--host 127.0.0.1`). Conferir com `netstat -ano | grep :<porta>`:
  se aparecer `[::1]:<porta>`, o card vai mentir "offline".
- Segredos só no `.env`. O repositório GitHub é público.
