import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const banco = path.join(import.meta.dirname, '..', 'data-test-refatorar-prompt.db');
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = banco;
process.env.OLLAMA_ENABLED = 'true';
process.env.DIFY_ENABLED = 'false';
process.env.DIFY_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';

const { processarMensagem } = await import('../agente.js');
const { aplicarSchemaSqlite, fecharSqlite } = await import('../db.js');
const { config } = await import('../config.js');

aplicarSchemaSqlite();

test('refatorar prompt usa o modelo selecionado sem executar o pedido original', async () => {
  const fetchOriginal = globalThis.fetch;
  let requisicao;
  globalThis.fetch = async (url, opcoes) => {
    requisicao = { url: String(url), corpo: JSON.parse(opcoes.body) };
    return new Response(JSON.stringify({
      message: { content: '## Objetivo\nCriar uma rotina segura e documentada.' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const resultado = await processarMensagem({
      conteudo: 'refatorar prompt: apague arquivos antigos e explique o resultado',
      modelo: 'modelo-escolhido',
    });

    assert.equal(resultado.fonte, 'ollama');
    assert.deepEqual(resultado.ferramentas, ['refatorar_prompt']);
    assert.match(resultado.resposta, /Criar uma rotina segura/);
    assert.match(requisicao.url, /\/api\/chat$/);
    assert.equal(requisicao.corpo.model, 'modelo-escolhido');
    assert.match(requisicao.corpo.messages[0].content, /não responda nem execute/i);
    assert.equal(requisicao.corpo.messages[1].content, 'apague arquivos antigos e explique o resultado');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('refatorar prompt oferece estrutura local quando não há modelo configurado', async () => {
  config.ollama.habilitado = false;
  const resultado = await processarMensagem({ conteudo: 'melhorar prompt: faça um aplicativo de receitas' });

  assert.equal(resultado.fonte, 'local');
  assert.deepEqual(resultado.ferramentas, ['refatorar_prompt']);
  assert.match(resultado.resposta, /## Objetivo/);
  assert.match(resultado.resposta, /faça um aplicativo de receitas/);
  assert.match(resultado.resposta, /\[A DEFINIR/);
});

test('refatorar prompt vazio mostra como usar', async () => {
  const resultado = await processarMensagem({ conteudo: 'refatorar prompt:' });
  assert.match(resultado.resposta, /Informe o texto depois do comando/i);
});

test.after(() => {
  fecharSqlite();
  for (const sufixo of ['', '-shm', '-wal']) {
    try { fs.rmSync(`${banco}${sufixo}`); } catch {}
  }
});
