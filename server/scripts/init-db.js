// Cria as tabelas da Vitrine de Apps.
//
//   npm run db:init          → SQLite local (data/vitrine.db)
//   npm run db:init:mysql    → MariaDB da Hostinger (credenciais em .env)
//
// Ambos são idempotentes: rodar de novo não apaga nada.
import { aplicarSchemaSqlite, aplicarSchemaMySql, testarMySql, fecharSqlite, fecharMySql } from '../db.js';
import { config } from '../config.js';

const usarMysql = process.argv.includes('--mysql');

const TABELAS_ESPERADAS = [
  'usuarios',
  'sessoes',
  'apps',
  'app_status',
  'execucoes',
  'automacoes',
  'integracoes',
  'logs_agente',
];

async function inicializarSqlite() {
  console.log('SQLite —', config.sqlite.caminho);

  const db = aplicarSchemaSqlite();
  const tabelas = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all()
    .map((t) => t.name);

  const faltando = TABELAS_ESPERADAS.filter((t) => !tabelas.includes(t));
  const views = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name`)
    .all()
    .map((v) => v.name);

  console.log(`\n${tabelas.length} tabelas: ${tabelas.join(', ')}`);
  console.log(`${views.length} visões: ${views.join(', ')}`);

  if (faltando.length) {
    console.error(`\nFALTANDO: ${faltando.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nSQLite pronto.');
}

async function inicializarMysql() {
  console.log(`MySQL — ${config.mysql.usuario}@${config.mysql.host}/${config.mysql.banco}`);

  const teste = await testarMySql();
  if (!teste.ok) {
    console.error(`\nNão foi possível conectar: ${teste.mensagem}`);
    console.error('\nVerifique as variáveis DB_* no .env. Se o erro for de acesso negado,');
    console.error('pode ser necessário liberar seu IP em hPanel > Bancos de dados > MySQL remoto.');
    process.exitCode = 1;
    return;
  }
  console.log(teste.mensagem);

  const aplicadas = await aplicarSchemaMySql();
  console.log(`\n${aplicadas.length} objetos aplicados: ${aplicadas.join(', ')}`);

  const faltando = TABELAS_ESPERADAS.filter((t) => !aplicadas.includes(t));
  if (faltando.length) {
    console.error(`\nFALTANDO: ${faltando.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nMySQL pronto — confira em phpMyAdmin.');
}

try {
  if (usarMysql) {
    await inicializarMysql();
  } else {
    await inicializarSqlite();
  }
} catch (erro) {
  console.error('\nErro:', erro.message);
  process.exitCode = 1;
} finally {
  fecharSqlite();
  await fecharMySql();
}
