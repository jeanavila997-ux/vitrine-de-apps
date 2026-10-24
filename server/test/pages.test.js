// Testes do catálogo público (GitHub Pages).
//
//   npm test
//
// Cobre os defeitos que o build antigo tinha:
// 1. apps com visivel=0 (máquina antiga) apareciam no site público;
// 2. app sem repositório gerava botão "Código-fonte" com href vazio;
// 3. url_publica não virava link — produto no ar sem botão "Abrir".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appsPublicos, gerarHtml } from '../../scripts/build-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'apps-registry.json'), 'utf8'));

const base = { nome: 'X', descricao: 'd', icone: '•', cor: '#000', stack: 's', ordem: 1 };

test('catálogo público ignora apps com visivel=0', () => {
  const slugs = appsPublicos({
    apps: [
      { ...base, slug: 'visivel', visivel: 1 },
      { ...base, slug: 'oculto', visivel: 0 },
      { ...base, slug: 'sem-campo' },
    ],
  }).map((a) => a.slug);
  assert.deepEqual(slugs, ['visivel', 'sem-campo']);
});

test('sem repositório não gera link vazio; url_publica https vira botão Abrir', () => {
  const html = gerarHtml({
    apps: [
      { ...base, slug: 'a', repositorio: null, url_publica: 'https://exemplo.com.br' },
      { ...base, slug: 'b', repositorio: 'https://github.com/x/y', url_publica: null },
    ],
  });
  assert.ok(!html.includes('href=""'), 'nenhum href vazio');
  assert.equal((html.match(/>Abrir</g) || []).length, 1);
  assert.equal((html.match(/>Código-fonte</g) || []).length, 1);
});

test('url_publica que não é https não vira link', () => {
  const html = gerarHtml({
    apps: [
      { ...base, slug: 'a', url_publica: 'javascript:alert(1)' },
      { ...base, slug: 'b', url_publica: 'http://inseguro.com' },
    ],
  });
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('http://inseguro.com'));
  assert.ok(!html.includes('>Abrir<'));
});

test('registry atual: toda url_publica e todo repositório são https', () => {
  for (const app of registry.apps) {
    for (const campo of ['url_publica', 'repositorio']) {
      const v = app[campo];
      if (v == null) continue;
      assert.ok(v.startsWith('https://'), `"${app.slug}".${campo} deveria ser https: ${v}`);
    }
  }
});

test('docs/index.html está em dia com o registry', () => {
  const atual = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');
  assert.equal(atual, gerarHtml(registry), 'rode npm run pages:build e commite docs/index.html');
});
