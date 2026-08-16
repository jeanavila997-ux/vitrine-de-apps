// Envia o catálogo local para o MySQL da Hostinger.
//   npm run db:sync
import { sincronizar } from '../sync-mysql.js';
import { fecharSqlite, fecharMySql, poolMySql } from '../db.js';
import { config } from '../config.js';

try {
  console.log(`Sincronizando com ${config.mysql.banco}@${config.mysql.host}\n`);

  const resultado = await sincronizar();
  console.log(`${resultado.apps} apps enviados`);
  console.log(`${resultado.status} registros de status enviados`);

  if (resultado.erros.length) {
    console.error(`\n${resultado.erros.length} erro(s):`);
    for (const e of resultado.erros) console.error(`  - ${e}`);
    process.exitCode = 1;
  }

  // Confere o que ficou lá
  const pool = poolMySql();
  const [linhas] = await pool.query(
    `SELECT a.slug, a.nome, a.porta, COALESCE(s.estado,'offline') AS estado
     FROM apps a LEFT JOIN app_status s ON s.app_id = a.id
     ORDER BY a.ordem`
  );
  console.log('\nNo servidor agora:');
  for (const l of linhas) {
    console.log(`  ${l.nome.padEnd(22)} :${String(l.porta ?? '—').padEnd(6)} ${l.estado}`);
  }
} catch (erro) {
  console.error('Falha:', erro.message);
  process.exitCode = 1;
} finally {
  fecharSqlite();
  await fecharMySql();
}
