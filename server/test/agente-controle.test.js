// Testes do controle de processos via agente.
//
//   npm test
//
// Os comandos iniciar/parar do chat agora executam de fato via
// process-manager.js (allowlist). Parar é destrutivo e exige confirmação
// explícita com TTL. Estes testes cobrem a mecânica de confirmação sem
// depender do Windows (powershell/taskkill) — o process-manager real é
// exercitado em modo local na máquina do usuário.
import test from 'node:test';
import assert from 'node:assert/strict';

// A mecânica de confirmação é interna ao agente; testamos via os comandos
// exportados, que são as entradas públicas do fluxo.
import { processarMensagem, historicoChat } from '../agente.js';
import { abrirSqlite, aplicarSchemaSqlite, fecharSqlite } from '../db.js';

process.env.NODE_ENV = 'test';

const TMP = `${import.meta.dirname}/../data-test-agente.db`;

test('parar exige confirmação e confirmar executa a ação', async () => {
  process.env.SQLITE_PATH = TMP;
  aplicarSchemaSqlite();
  const db = abrirSqlite();

  // App fake online com comando registrado — suficiente para a mecânica
  // de comando (o spawn real não roda aqui; sem Windows ele falha em
  // runtime, o que o agente reporta como mensagem de erro — aceitável).
  db.prepare(`DELETE FROM apps WHERE slug = 'app-teste-agente'`).run();
  db.prepare(
    `INSERT INTO apps (slug, nome, caminho, tipo, comando_start, porta, ordem)
     VALUES ('app-teste-agente', 'App Teste Agente', 'C:\\nao-existe', 'web', null, null, 99)`
  ).run();
  const id = db.prepare(`SELECT id FROM apps WHERE slug = 'app-teste-agente'`).get().id;
  db.prepare(
    `INSERT INTO app_status (app_id, estado) VALUES (?, 'online')
     ON CONFLICT (app_id) DO UPDATE SET estado = 'online'`
  ).run(id);

  try {
    // 1) parar sem confirmar → pede confirmação
    const r1 = await processarMensagem({ conteudo: 'parar app-teste-agente' });
    assert.match(r1.resposta, /confirmar app-teste-agente/i);
    assert.ok(r1.resposta.includes('2 minutos'));

    // 2) confirmar consome a confirmação e dispara a ação — o app não tem
    //    processo real, então pararApp reporta "não está online", provando
    //    que a execução aconteceu (e não o pedido de confirmação de novo)
    const r2 = await processarMensagem({ conteudo: 'confirmar app-teste-agente' });
    assert.ok(!/confirmar app-teste-agente/i.test(r2.resposta), `confirmação deveria ter sido consumida: ${r2.resposta}`);

    // 3) confirmar de novo, sem pendente → recusa
    const r3 = await processarMensagem({ conteudo: 'confirmar app-teste-agente' });
    assert.match(r3.resposta, /aguardando confirma|expirou/i);
  } finally {
    db.prepare(`DELETE FROM apps WHERE slug = 'app-teste-agente'`).run();
    fecharSqlite();
  }
});

test('iniciar de app sem comando_start avisa e não tenta executar', async () => {
  process.env.SQLITE_PATH = TMP;
  aplicarSchemaSqlite();
  const db = abrirSqlite();
  db.prepare(
    `INSERT INTO apps (slug, nome, caminho, tipo, comando_start, ordem)
     VALUES ('app-sem-start', 'App Sem Start', 'C:\\nao-existe', 'web', null, 98)
     ON CONFLICT (slug) DO UPDATE SET comando_start = NULL`
  ).run();
  try {
    const r = await processarMensagem({ conteudo: 'iniciar app-sem-start' });
    assert.match(r.resposta, /não tem comando de start/i);
  } finally {
    db.prepare(`DELETE FROM apps WHERE slug = 'app-sem-start'`).run();
    fecharSqlite();
  }
});

test('execuções do agente ficam registradas com origem agente', async () => {
  process.env.SQLITE_PATH = TMP;
  aplicarSchemaSqlite();
  const db = abrirSqlite();
  // App com comando_start registrado na allowlist: o spawn falha (caminho
  // inexistente), mas executarAcao registra a tentativa com origem 'agente'.
  db.prepare(
    `INSERT INTO apps (slug, nome, caminho, tipo, comando_start, ordem)
     VALUES ('app-start-fantasma', 'App Start Fantasma', 'C:\\nao-existe', 'web', 'estante_dev', 97)
     ON CONFLICT (slug) DO UPDATE SET comando_start = 'estante_dev'`
  ).run();
  try {
    await processarMensagem({ conteudo: 'iniciar app-start-fantasma' });
    const execucao = db
      .prepare(`SELECT origem FROM execucoes WHERE origem = 'agente' ORDER BY id DESC LIMIT 1`)
      .get();
    assert.ok(execucao, 'deveria existir execução com origem agente');
  } finally {
    db.prepare(`DELETE FROM apps WHERE slug = 'app-start-fantasma'`).run();
    fecharSqlite();
  }
});
