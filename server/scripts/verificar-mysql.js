// Confere o que existe de fato no MySQL da Hostinger.
//   node server/scripts/verificar-mysql.js
import { poolMySql, fecharMySql } from '../db.js';
import { config } from '../config.js';

const pool = poolMySql();
if (!pool) {
  console.error('MySQL não configurado — preencha DB_* no .env');
  process.exit(1);
}

try {
  const [versao] = await pool.query('SELECT VERSION() AS v, DATABASE() AS db');
  console.log(`${versao[0].db} · ${versao[0].v}\n`);

  const [tabelas] = await pool.query(
    `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_TYPE, TABLE_NAME`,
    [config.mysql.banco]
  );

  console.log('Objetos no banco:');
  for (const t of tabelas) {
    const tipo = t.TABLE_TYPE === 'VIEW' ? 'view ' : 'tabela';
    const linhas = t.TABLE_TYPE === 'VIEW' ? '' : ` · ${t.TABLE_ROWS ?? 0} linhas`;
    console.log(`  ${tipo}  ${t.TABLE_NAME}${linhas}`);
  }

  const [fks] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [config.mysql.banco]
  );
  console.log(`\n${fks[0].total} chaves estrangeiras ativas`);

  const [colunasApps] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'apps'
     ORDER BY ORDINAL_POSITION`,
    [config.mysql.banco]
  );
  console.log(`\nTabela apps — ${colunasApps.length} colunas:`);
  console.log(colunasApps.map((c) => `  ${c.COLUMN_NAME} ${c.COLUMN_TYPE}`).join('\n'));
} finally {
  await fecharMySql();
}
