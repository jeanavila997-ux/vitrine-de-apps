// Servidor da Vitrine de Apps — API + interface.
// http://127.0.0.1:4400 · produção em https://vitrinedeapps.cloud
import path from 'node:path';
import express from 'express';
import { config, ROOT, origensPermitidas, validarConfig } from './config.js';
import {
  aplicarSchemaSqlite,
  listarApps,
  listarAppsPorModo,
  buscarAppPorModo,
  atividadeRecentePorModo,
  testarMySql,
} from './db.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Em modo local o SQLite é a fonte da verdade e precisa existir.
// Em modo hospedado os dados vêm do MariaDB — não há SQLite a criar.
if (config.modo === 'local') {
  aplicarSchemaSqlite();
}

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
    modo: config.modo,
    podeControlarProcessos: config.podeControlarProcessos,
    dominio: config.dominio,
    porta: config.porta,
  });
});

app.get('/api/apps', async (req, res, next) => {
  try {
    const apps = await listarAppsPorModo();
    const contagem = apps.reduce((acc, a) => {
      acc[a.estado] = (acc[a.estado] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      total: apps.length,
      contagem,
      modo: config.modo,
      apps,
    });
  } catch (erro) {
    next(erro);
  }
});

app.get('/api/apps/:slug', async (req, res, next) => {
  try {
    const app_ = await buscarAppPorModo(req.params.slug);
    if (!app_) return res.status(404).json({ erro: 'App não encontrado' });
    res.json(app_);
  } catch (erro) {
    next(erro);
  }
});

app.get('/api/atividade', async (req, res, next) => {
  try {
    const limite = Math.min(Number(req.query.limite) || 20, 100);
    res.json({ itens: await atividadeRecentePorModo(limite) });
  } catch (erro) {
    next(erro);
  }
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

// Erros de API viram JSON, nunca stack trace na resposta.
app.use((erro, req, res, next) => {
  console.error('Erro:', erro.message);
  res.status(500).json({ erro: config.producao ? 'Erro interno' : erro.message });
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

// Local: só 127.0.0.1, porque o app controla processos da máquina e não deve
// ficar exposto na rede. Hospedado: a plataforma faz o proxy, então escuta em
// todas as interfaces e usa a porta que ela definir.
const host = config.modo === 'local' ? '127.0.0.1' : '0.0.0.0';

app.listen(config.porta, host, () => {
  console.log('');
  console.log('  Vitrine de Apps');
  console.log(`  modo ${config.modo} · http://${host}:${config.porta}`);
  if (config.modo === 'local') {
    console.log(`  ${listarApps().length} apps no catálogo · ${config.dominio}`);
  } else {
    console.log(`  ${config.urlPublica}`);
  }
  console.log('');
});
