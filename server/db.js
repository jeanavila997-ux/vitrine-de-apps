// Camada de banco da Vitrine de Apps.
//
// SQLite é a fonte da verdade local — o app precisa funcionar sem internet,
// já que controla processos na própria máquina. O MySQL da Hostinger recebe
// a cópia sincronizada que alimenta o catálogo público.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { config, ROOT } from './config.js';

let sqlite = null;
let poolMysql = null;

// ============================================================
// SQLite
// ============================================================

/** Abre (criando se preciso) o banco local. Idempotente. */
export function abrirSqlite() {
  if (sqlite) return sqlite;

  const dir = path.dirname(config.sqlite.caminho);
  fs.mkdirSync(dir, { recursive: true });

  sqlite = new Database(config.sqlite.caminho);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

/** Aplica schema.sqlite.sql. Só usa CREATE ... IF NOT EXISTS, então repetir é seguro. */
export function aplicarSchemaSqlite() {
  const db = abrirSqlite();
  const sql = fs.readFileSync(path.join(ROOT, 'server', 'schema.sqlite.sql'), 'utf8');
  db.exec(sql);
  return db;
}

export function fecharSqlite() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
}

// ============================================================
// MySQL (Hostinger)
// ============================================================

/** Pool do MySQL. Retorna null se as credenciais não estiverem completas. */
export function poolMySql() {
  if (poolMysql) return poolMysql;
  if (!config.mysql.configurado()) return null;

  poolMysql = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.porta,
    database: config.mysql.banco,
    user: config.mysql.usuario,
    password: config.mysql.senha,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
  });
  return poolMysql;
}

/** Testa a conexão com a Hostinger. Retorna {ok, mensagem}. */
export async function testarMySql() {
  const pool = poolMySql();
  if (!pool) {
    return { ok: false, mensagem: 'Credenciais do MySQL não configuradas no .env' };
  }
  try {
    const conn = await pool.getConnection();
    const [linhas] = await conn.query('SELECT VERSION() AS versao, DATABASE() AS banco');
    conn.release();
    return {
      ok: true,
      mensagem: `Conectado em ${linhas[0].banco} (MySQL ${linhas[0].versao})`,
    };
  } catch (erro) {
    return { ok: false, mensagem: erro.message };
  }
}

/**
 * Aplica schema.mysql.sql. O driver não aceita várias instruções numa query,
 * então dividimos por `;` — respeitando que os blocos não contêm procedures.
 */
export async function aplicarSchemaMySql() {
  const pool = poolMySql();
  if (!pool) throw new Error('MySQL não configurado — preencha DB_* no .env');

  const sql = fs.readFileSync(path.join(ROOT, 'server', 'schema.mysql.sql'), 'utf8');
  const instrucoes = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

  const conn = await pool.getConnection();
  const aplicadas = [];
  try {
    for (const instrucao of instrucoes) {
      await conn.query(instrucao);
      const nome = instrucao.match(/(?:TABLE|VIEW)\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?/i);
      if (nome) aplicadas.push(nome[1]);
    }
  } finally {
    conn.release();
  }
  return aplicadas;
}

export async function fecharMySql() {
  if (poolMysql) {
    await poolMysql.end();
    poolMysql = null;
  }
}

// ============================================================
// Consultas usadas pela UI e pelo agente
// ============================================================

export function listarApps() {
  return abrirSqlite().prepare('SELECT * FROM v_apps_com_status').all();
}

export function buscarApp(slug) {
  return abrirSqlite().prepare('SELECT * FROM v_apps_com_status WHERE slug = ?').get(slug);
}

// ---- Versões que respeitam o modo ----
// Local lê do SQLite; hospedado lê do MariaDB, que é para onde o catálogo
// é sincronizado. Mesma forma de resultado nos dois casos.

export async function listarAppsPorModo() {
  if (config.modo === 'local') return listarApps();

  const pool = poolMySql();
  if (!pool) throw new Error('MySQL não configurado em modo hospedado');
  const [linhas] = await pool.query('SELECT * FROM v_apps_com_status ORDER BY ordem');
  return linhas;
}

export async function buscarAppPorModo(slug) {
  if (config.modo === 'local') return buscarApp(slug);

  const pool = poolMySql();
  if (!pool) throw new Error('MySQL não configurado em modo hospedado');
  const [linhas] = await pool.query('SELECT * FROM v_apps_com_status WHERE slug = ?', [slug]);
  return linhas[0] ?? null;
}

export async function atividadeRecentePorModo(limite = 20) {
  if (config.modo === 'local') return atividadeRecente(limite);

  const pool = poolMySql();
  if (!pool) return [];
  const [linhas] = await pool.query(
    `SELECT e.*, a.nome AS app_nome, a.icone AS app_icone, a.slug AS app_slug
     FROM execucoes e JOIN apps a ON a.id = e.app_id
     ORDER BY e.criado_em DESC LIMIT ?`,
    [limite]
  );
  return linhas;
}

export function registrarStatus({ appId, estado, pid = null, portaEfetiva = null, mensagem = null }) {
  return abrirSqlite()
    .prepare(
      `INSERT INTO app_status (app_id, estado, pid, porta_efetiva, mensagem, verificado_em)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (app_id) DO UPDATE SET
         estado = excluded.estado,
         pid = excluded.pid,
         porta_efetiva = excluded.porta_efetiva,
         mensagem = excluded.mensagem,
         verificado_em = datetime('now')`
    )
    .run(appId, estado, pid, portaEfetiva, mensagem);
}

export function registrarExecucao({
  appId,
  usuarioId = null,
  acao,
  origem = 'ui',
  sucesso = false,
  pid = null,
  mensagem = null,
  duracaoMs = null,
}) {
  return abrirSqlite()
    .prepare(
      `INSERT INTO execucoes (app_id, usuario_id, acao, origem, sucesso, pid, mensagem, duracao_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(appId, usuarioId, acao, origem, sucesso ? 1 : 0, pid, mensagem, duracaoMs);
}

export function atividadeRecente(limite = 20) {
  return abrirSqlite()
    .prepare(
      `SELECT e.*, a.nome AS app_nome, a.icone AS app_icone, a.slug AS app_slug
       FROM execucoes e
       JOIN apps a ON a.id = e.app_id
       ORDER BY e.criado_em DESC
       LIMIT ?`
    )
    .all(limite);
}

// ============================================================
// Chat com o agente
// ============================================================

export function salvarMensagemChat({ usuarioId = null, papel, conteudo, meta = null }) {
  return abrirSqlite()
    .prepare(
      `INSERT INTO chat_mensagens (usuario_id, papel, conteudo, meta, criado_em)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .run(usuarioId, papel, conteudo, meta ? JSON.stringify(meta) : null);
}

export function listarMensagensChat({ usuarioId = null, limite = 100, antesDe = null } = {}) {
  const db = abrirSqlite();
  let sql = `SELECT id, usuario_id, papel, conteudo, meta, criado_em
             FROM chat_mensagens`;
  const where = [];
  const params = [];

  if (usuarioId !== null) {
    where.push('usuario_id = ?');
    params.push(usuarioId);
  }
  if (antesDe) {
    where.push('criado_em < ?');
    params.push(antesDe);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY criado_em DESC LIMIT ?';
  params.push(limite);

  return db.prepare(sql).all(...params).reverse();
}
