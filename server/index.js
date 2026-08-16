// Servidor da Vitrine de Apps — API + interface.
// http://127.0.0.1:4400 · produção em https://vitrinedeapps.cloud
import path from 'node:path';
import express from 'express';
import { config, ROOT, origensPermitidas, validarConfig } from './config.js';
import {
  aplicarSchemaSqlite,
  listarApps,
  buscarApp,
  atividadeRecente,
  testarMySql,
} from './db.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Garante que o banco existe antes de atender qualquer requisição.
aplicarSchemaSqlite();

// ------------------------------------------------------------
// Validação de origem — sem CORS `*`, POST só da própria origem.
// ------------------------------------------------------------
const ORIGENS = new Set(origensPermitidas());

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();

  const origem = req.get('origin');
  if (origem && !ORIGENS.has(origem)) {
    return res.status(403).json({ erro: 'Origem não permitida' });
  }
  next();
});

// ------------------------------------------------------------
// API
// ------------------------------------------------------------

app.get('/api/saude', (req, res) => {
  res.json({
    ok: true,
    ambiente: config.ambiente,
    dominio: config.dominio,
    porta: config.porta,
  });
});

app.get('/api/apps', (req, res) => {
  const apps = listarApps();
  const contagem = apps.reduce((acc, a) => {
    acc[a.estado] = (acc[a.estado] ?? 0) + 1;
    return acc;
  }, {});

  res.json({
    total: apps.length,
    contagem,
    apps,
  });
});

app.get('/api/apps/:slug', (req, res) => {
  const app_ = buscarApp(req.params.slug);
  if (!app_) return res.status(404).json({ erro: 'App não encontrado' });
  res.json(app_);
});

app.get('/api/atividade', (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 20, 100);
  res.json({ itens: atividadeRecente(limite) });
});

app.get('/api/mysql/status', async (req, res) => {
  res.json(await testarMySql());
});

// ------------------------------------------------------------
// Interface
// ------------------------------------------------------------
app.use(express.static(path.join(ROOT, 'public')));

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

// ------------------------------------------------------------
// Sobe
// ------------------------------------------------------------
const problemas = validarConfig();
if (problemas.length && config.producao) {
  console.error('Configuração inválida:');
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}
if (problemas.length) {
  console.warn('Avisos de configuração (não bloqueiam em desenvolvimento):');
  for (const p of problemas) console.warn(`  - ${p}`);
}

app.listen(config.porta, '127.0.0.1', () => {
  const apps = listarApps();
  console.log('');
  console.log('  Vitrine de Apps');
  console.log(`  http://127.0.0.1:${config.porta}`);
  console.log(`  ${apps.length} apps no catálogo · domínio ${config.dominio}`);
  console.log('');
});
