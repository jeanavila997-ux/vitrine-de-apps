// Sincroniza o SQLite local (fonte da verdade) com o MySQL da Hostinger,
// que alimenta o catálogo público.
//
// Direção: SQLite → MySQL, sempre. O MySQL nunca escreve de volta.
// Só sobem dados de catálogo e status; sessões e senhas ficam locais.
import { abrirSqlite, poolMySql } from './db.js';

const COLUNAS_APPS = [
  'slug', 'nome', 'descricao', 'icone', 'cor', 'caminho', 'repositorio',
  'branch', 'stack', 'tipo', 'comando_start', 'porta', 'url_local',
  'url_publica', 'banco', 'tem_auth', 'ordem', 'visivel',
];

/**
 * Envia o catálogo e o status atual para a Hostinger.
 * @returns {Promise<{apps:number, status:number, erros:string[]}>}
 */
export async function sincronizar() {
  const pool = poolMySql();
  if (!pool) throw new Error('MySQL não configurado — preencha DB_* no .env');

  const sqlite = abrirSqlite();
  const apps = sqlite.prepare('SELECT * FROM apps ORDER BY ordem').all();
  const status = sqlite.prepare('SELECT * FROM app_status').all();

  const conn = await pool.getConnection();
  const erros = [];
  let appsEnviados = 0;
  let statusEnviados = 0;

  try {
    await conn.beginTransaction();

    // ---- apps: UPSERT por slug ----
    const marcadores = COLUNAS_APPS.map(() => '?').join(', ');
    const atualizacoes = COLUNAS_APPS.filter((c) => c !== 'slug')
      .map((c) => `${c} = VALUES(${c})`)
      .join(', ');

    for (const app of apps) {
      try {
        await conn.query(
          `INSERT INTO apps (${COLUNAS_APPS.join(', ')}) VALUES (${marcadores})
           ON DUPLICATE KEY UPDATE ${atualizacoes}`,
          COLUNAS_APPS.map((c) => app[c] ?? null)
        );
        appsEnviados++;
      } catch (erro) {
        erros.push(`app ${app.slug}: ${erro.message}`);
      }
    }

    // ---- app_status: precisa do id do MySQL, que pode diferir do local ----
    const [linhasRemotas] = await conn.query('SELECT id, slug FROM apps');
    const idPorSlug = new Map(linhasRemotas.map((l) => [l.slug, l.id]));
    const slugPorIdLocal = new Map(apps.map((a) => [a.id, a.slug]));

    for (const s of status) {
      const slug = slugPorIdLocal.get(s.app_id);
      const idRemoto = slug ? idPorSlug.get(slug) : null;
      if (!idRemoto) continue;

      try {
        await conn.query(
          `INSERT INTO app_status (app_id, estado, pid, porta_efetiva, mensagem, iniciado_em)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             estado = VALUES(estado), pid = VALUES(pid),
             porta_efetiva = VALUES(porta_efetiva), mensagem = VALUES(mensagem),
             iniciado_em = VALUES(iniciado_em)`,
          [idRemoto, s.estado, s.pid, s.porta_efetiva, s.mensagem, s.iniciado_em]
        );
        statusEnviados++;
      } catch (erro) {
        erros.push(`status ${slug}: ${erro.message}`);
      }
    }

    await conn.commit();
  } catch (erro) {
    await conn.rollback();
    throw erro;
  } finally {
    conn.release();
  }

  return { apps: appsEnviados, status: statusEnviados, erros };
}
