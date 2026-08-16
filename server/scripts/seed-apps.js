// Popula a tabela `apps` a partir de apps-registry.json.
//
//   npm run db:seed
//
// Usa UPSERT por slug: rodar de novo atualiza os dados sem duplicar
// e sem perder o histórico de execuções, que referencia o id.
import fs from 'node:fs';
import path from 'node:path';
import { abrirSqlite, aplicarSchemaSqlite, fecharSqlite } from '../db.js';
import { ROOT } from '../config.js';

const registro = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'server', 'apps-registry.json'), 'utf8')
);

aplicarSchemaSqlite();
const db = abrirSqlite();

const upsert = db.prepare(`
  INSERT INTO apps (
    slug, nome, descricao, icone, cor, caminho, repositorio, branch,
    stack, tipo, comando_start, pid_file, porta, url_local, url_publica,
    banco, tem_auth, ordem
  ) VALUES (
    @slug, @nome, @descricao, @icone, @cor, @caminho, @repositorio, @branch,
    @stack, @tipo, @comando_start, @pid_file, @porta, @url_local, @url_publica,
    @banco, @tem_auth, @ordem
  )
  ON CONFLICT (slug) DO UPDATE SET
    nome = excluded.nome,
    descricao = excluded.descricao,
    icone = excluded.icone,
    cor = excluded.cor,
    caminho = excluded.caminho,
    repositorio = excluded.repositorio,
    branch = excluded.branch,
    stack = excluded.stack,
    tipo = excluded.tipo,
    comando_start = excluded.comando_start,
    pid_file = excluded.pid_file,
    porta = excluded.porta,
    url_local = excluded.url_local,
    url_publica = excluded.url_publica,
    banco = excluded.banco,
    tem_auth = excluded.tem_auth,
    ordem = excluded.ordem
`);

const statusInicial = db.prepare(`
  INSERT INTO app_status (app_id, estado, mensagem)
  VALUES (?, ?, ?)
  ON CONFLICT (app_id) DO NOTHING
`);

const gravarTudo = db.transaction((apps) => {
  for (const app of apps) {
    upsert.run({
      slug: app.slug,
      nome: app.nome,
      descricao: app.descricao ?? null,
      icone: app.icone ?? null,
      cor: app.cor ?? null,
      caminho: app.caminho,
      repositorio: app.repositorio ?? null,
      branch: app.branch ?? null,
      stack: app.stack ?? null,
      tipo: app.tipo ?? 'web',
      comando_start: app.comando_start ?? null,
      pid_file: app.pid_file ?? null,
      porta: app.porta ?? null,
      url_local: app.url_local ?? null,
      url_publica: app.url_publica ?? null,
      banco: app.banco ?? null,
      tem_auth: app.tem_auth ?? 0,
      ordem: app.ordem ?? 0,
    });
  }
});

gravarTudo(registro.apps);

// Marca como indisponível o que não existe no disco — a Estante mora no drive F:,
// que nem sempre está montado.
const gravados = db.prepare('SELECT id, slug, nome, caminho FROM apps ORDER BY ordem').all();

console.log(`${gravados.length} apps no catálogo:\n`);
for (const app of gravados) {
  const existe = fs.existsSync(app.caminho);
  statusInicial.run(
    app.id,
    existe ? 'offline' : 'indisponivel',
    existe ? null : `Pasta não encontrada: ${app.caminho}`
  );
  const marca = existe ? 'ok        ' : 'AUSENTE   ';
  console.log(`  ${marca} ${app.nome.padEnd(22)} ${app.caminho}`);
}

const ausentes = gravados.filter((a) => !fs.existsSync(a.caminho));
if (ausentes.length) {
  console.log(`\n${ausentes.length} app(s) com pasta ausente — marcados como 'indisponivel'.`);
}

fecharSqlite();
