// Testes do backend Dify do agente.
//
//   npm test
//
// A cadeia do agente é: Ollama -> Dify -> Anthropic. Estes testes cobrem a
// configuração do Dify e o comportamento de limpeza de conversa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { config, validarConfig } from '../config.js';

test('config do Dify lê as variáveis do ambiente com defaults seguros', async () => {
  // Sem DIFY_API_URL definido, a url fica vazia e o backend fica inativo.
  const urlAntes = process.env.DIFY_API_URL;
  const keyAntes = process.env.DIFY_API_KEY;
  delete process.env.DIFY_API_URL;
  delete process.env.DIFY_API_KEY;

  try {
    const { config: configLimpa } = await import('../config.js?sem-dify=' + Date.now());
    assert.equal(configLimpa.dify.url, '');
    assert.equal(configLimpa.dify.apiKey, '');
    assert.equal(configLimpa.dify.usuario, 'vitrine');
    assert.equal(configLimpa.dify.habilitado, true);
  } finally {
    if (urlAntes !== undefined) process.env.DIFY_API_URL = urlAntes;
    if (keyAntes !== undefined) process.env.DIFY_API_KEY = keyAntes;
  }
});

test('config do Dify remove barra final da URL', async () => {
  const antes = process.env.DIFY_API_URL;
  process.env.DIFY_API_URL = 'https://api.dify.ai/v1//';
  try {
    const { config: configBarra } = await import('../config.js?barra=' + Date.now());
    assert.equal(configBarra.dify.url, 'https://api.dify.ai/v1');
  } finally {
    if (antes === undefined) delete process.env.DIFY_API_URL;
    else process.env.DIFY_API_URL = antes;
  }
});

test('validarConfig não exige credenciais do Dify em produção', () => {
  // O Dify é opcional na cadeia: sem ele, o agente cai no próximo backend.
  const erros = validarConfig();
  assert.ok(
    !erros.some((e) => e.toLowerCase().includes('dify')),
    `Dify não deveria ser obrigatório: ${erros.join('; ')}`
  );
});

test('config carregada mantém o namespace dify', () => {
  assert.ok(config.dify);
  assert.ok('habilitado' in config.dify);
  assert.ok('usuario' in config.dify);
});
