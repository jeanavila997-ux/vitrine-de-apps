// Servidor da Vitrine de Apps — API + interface.
// http://127.0.0.1:4400 · catálogo público em https://jeanavila997-ux.github.io/vitrine-de-apps/
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import express from 'express';
import { config, ROOT, origensPermitidas, validarConfig } from './config.js';
import {
  aplicarSchemaSqlite,
  abrirSqlite,
  poolMySql,
  listarApps,
  listarAppsPorModo,
  buscarAppPorModo,
  atividadeRecentePorModo,
  testarMySql,
  registrarStatus,
} from './db.js';
import { processarMensagem, historicoChat, listarModelosOllama, limparConversaDify } from './agente.js';
import { executarAcao, verificarStatus, verificarVarios } from './process-manager.js';
import {
  chamarFerramentaMestre,
  encerrarMestreMcp,
  ferramentaExigeConfirmacao,
  listarFerramentasMestre,
  statusMestreMcp,
  textoResultadoMcp,
} from './mestre-mcp-client.js';

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

    // ?live=1 (só modo local): checa a porta de cada app AGORA, com uma
    // única chamada de netstat, e grava o resultado — o dashboard deixa de
    // depender do último estado gravado no banco.
    if (config.podeControlarProcessos && ['1', 'true'].includes(String(req.query.live ?? ''))) {
      const vivos = await verificarVarios(apps);
      for (const v of vivos) {
        const app = apps.find((a) => a.slug === v.slug);
        if (!app) continue;

        let estado;
        if (v.online) estado = 'online';
        // 'indisponivel' = pasta inexistente nesta máquina; nenhuma porta
        // checada transforma isso em offline (o guard do executarAcao e o
        // seed dependem dessa distinção).
        else if (app.estado === 'indisponivel') estado = 'indisponivel';
        else estado = 'offline';

        app.estado = estado;
        app.pid = v.online ? v.pid : null;

        if (estado !== 'indisponivel') {
          registrarStatus({ appId: app.id, estado, pid: app.pid });
        }
      }
    }

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

app.get('/api/ligacoes', (req, res, next) => {
  try {
    const arquivo = path.join(ROOT, 'server', 'ligacoes.json');
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const ligacoes = Array.isArray(dados.ligacoes) ? dados.ligacoes : [];
    res.json({ total: ligacoes.length, ligacoes });
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

// ------------------------------------------------------------
// Controle de processos (só no modo local)
// ------------------------------------------------------------
// Iniciar/parar apps só faz sentido quando a Vitrine roda na própria máquina.
// No modo hospedado o servidor não alcança os processos do usuário.
function exigirModoLocal(req, res, next) {
  if (!config.podeControlarProcessos) {
    return res.status(403).json({ erro: 'Controle de processos indisponível no modo hospedado.' });
  }
  next();
}

app.post('/api/apps/:slug/iniciar', exigirModoLocal, async (req, res, next) => {
  try {
    const app_ = await buscarAppPorModo(req.params.slug);
    if (!app_) return res.status(404).json({ erro: 'App não encontrado' });

    const resultado = await executarAcao({ app: app_, acao: 'iniciar', origem: 'ui' });
    res.status(resultado.ok ? 200 : 409).json(resultado);
  } catch (erro) {
    next(erro);
  }
});

app.post('/api/apps/:slug/pasta', exigirModoLocal, async (req, res, next) => {
  try {
    const app_ = await buscarAppPorModo(req.params.slug);
    if (!app_) return res.status(404).json({ erro: 'App não encontrado' });
    if (!fs.existsSync(app_.caminho)) {
      return res.status(409).json({ erro: 'Pasta não encontrada nesta máquina.', caminho: app_.caminho });
    }
    // explorer.exe abre a pasta. O caminho vem do catálogo, não do corpo do pedido.
    const proc = spawn('explorer.exe', [app_.caminho], { detached: true, stdio: 'ignore' });
    proc.unref();
    res.json({ ok: true, caminho: app_.caminho });
  } catch (erro) {
    next(erro);
  }
});

app.post('/api/apps/:slug/parar', exigirModoLocal, async (req, res, next) => {
  try {
    const app_ = await buscarAppPorModo(req.params.slug);
    if (!app_) return res.status(404).json({ erro: 'App não encontrado' });

    const resultado = await executarAcao({ app: app_, acao: 'parar', origem: 'ui' });
    res.status(resultado.ok ? 200 : 409).json(resultado);
  } catch (erro) {
    next(erro);
  }
});

app.get('/api/apps/:slug/status', async (req, res, next) => {
  try {
    const app_ = await buscarAppPorModo(req.params.slug);
    if (!app_) return res.status(404).json({ erro: 'App não encontrado' });

    if (!config.podeControlarProcessos) {
      return res.json({ slug: app_.slug, estado: app_.estado, pid: app_.pid });
    }

    const status = await verificarStatus(app_);
    res.json({ slug: app_.slug, estado: status.online ? 'online' : 'offline', pid: status.pid });
  } catch (erro) {
    next(erro);
  }
});

// Últimas linhas do log do app (data/logs/<slug>.log, alimentado quando a
// Vitrine lança o processo). Só slug simples — sem path traversal.
app.get('/api/apps/:slug/logs', async (req, res) => {
  if (!/^\w[\w-]*$/.test(req.params.slug) || !config.podeControlarProcessos) {
    return res.status(400).json({ erro: 'Disponível só no modo local.' });
  }
  const caminho = path.join(ROOT, 'data', 'logs', `${req.params.slug}.log`);
  if (!fs.existsSync(caminho)) {
    return res.json({ itens: [], mensagem: 'O app nunca foi lançado pela Vitrine — sem log.' });
  }
  try {
    const linhas = fs.readFileSync(caminho, 'utf8').split(/\r?\n/);
    const itens = linhas.slice(-100);
    res.json({ itens, arquivo: caminho });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ------------------------------------------------------------
// Chat com o agente
// ------------------------------------------------------------
app.get('/api/chat/historico', async (req, res, next) => {
  try {
    const limite = Math.min(Number(req.query.limite) || 100, 200);
    const mensagens = historicoChat({ limite });
    res.json({ mensagens });
  } catch (erro) {
    next(erro);
  }
});

app.post('/api/chat', async (req, res, next) => {
  try {
    const { mensagem, modelo } = req.body || {};
    if (!mensagem || typeof mensagem !== 'string') {
      return res.status(400).json({ erro: 'Campo "mensagem" é obrigatório e deve ser texto.' });
    }
    const resultado = await processarMensagem({ conteudo: mensagem, modelo });
    res.json({ ok: true, ...resultado });
  } catch (erro) {
    next(erro);
  }
});

// ------------------------------------------------------------
// Ponte MCP com o Mestre do PC
// ------------------------------------------------------------
app.get('/api/mestre-mcp/status', async (req, res) => {
  const status = await statusMestreMcp();
  res.status(status.ok ? 200 : 503).json(status);
});

app.get('/api/mestre-mcp/tools', async (req, res, next) => {
  try {
    const tools = await listarFerramentasMestre({ atualizar: req.query.atualizar === '1' });
    res.json({
      ok: true,
      total: tools.length,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        annotations: tool.annotations || {},
        exigeConfirmacao: ferramentaExigeConfirmacao(tool),
      })),
    });
  } catch (erro) {
    next(erro);
  }
});

app.post('/api/mestre-mcp/tools/:name', async (req, res, next) => {
  try {
    const nome = req.params.name;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(nome)) return res.status(400).json({ erro: 'Nome de ferramenta inválido.' });
    const tools = await listarFerramentasMestre();
    const tool = tools.find((item) => item.name === nome);
    if (!tool) return res.status(404).json({ erro: 'Ferramenta MCP não encontrada.' });
    if (ferramentaExigeConfirmacao(tool) && req.body?.confirmado !== true) {
      return res.status(409).json({ erro: 'Esta ferramenta exige confirmação explícita.', exigeConfirmacao: true });
    }
    const argumentos = req.body?.argumentos ?? {};
    if (!argumentos || Array.isArray(argumentos) || typeof argumentos !== 'object') {
      return res.status(400).json({ erro: 'argumentos deve ser um objeto JSON.' });
    }
    const resultado = await chamarFerramentaMestre(nome, argumentos);
    res.status(resultado.isError ? 502 : 200).json({
      ok: !resultado.isError,
      ferramenta: nome,
      resposta: textoResultadoMcp(resultado),
      resultado,
    });
  } catch (erro) {
    next(erro);
  }
});

app.get('/api/mysql/status', async (req, res) => {
  res.json(await testarMySql());
});

/**
 * Estado do backend Dify do agente, para o painel da UI.
 * A cadeia completa é: Ollama -> Dify -> Anthropic.
 */
/** Reinicia o thread da conversa mantida no servidor do Dify. */
app.post('/api/dify/conversa/limpar', (req, res) => {
  limparConversaDify();
  res.json({ ok: true });
});

app.get('/api/dify/status', (req, res) => {
  res.json({
    ok: true,
    habilitado: config.dify.habilitado,
    configurado: Boolean(config.dify.url && config.dify.apiKey),
    usuario: config.dify.usuario,
  });
});

app.get('/api/ollama/modelos', async (req, res, next) => {
  try {
    const modelos = await listarModelosOllama();
    res.json({ ok: true, url: config.ollama.url, modeloPadrao: config.ollama.modelo, modelos });
  } catch (erro) {
    next(erro);
  }
});

/**
 * Estado das duas conexões de banco, para o painel de conexões.
 * O teste do MariaDB atravessa a internet, então é o que pode demorar.
 */
app.get('/api/conexoes', async (req, res) => {
  const inicio = Date.now();

  // SQLite — local, responde em microssegundos
  let sqlite;
  try {
    const db = abrirSqlite();
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM apps').get();
    const tabelas = db
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .get().n;
    sqlite = {
      ok: true,
      tipo: 'SQLite',
      papel: 'fonte da verdade local',
      caminho: config.sqlite.caminho,
      tabelas,
      apps: total,
      latenciaMs: Date.now() - inicio,
    };
  } catch (erro) {
    sqlite = { ok: false, tipo: 'SQLite', erro: erro.message };
  }

  // MariaDB — remoto
  const t0 = Date.now();
  const teste = await testarMySql();
  // Host e nome do banco nunca saem na resposta — CLAUDE.md proíbe expor isso
  // em qualquer lugar acessível, e esta rota não tem autenticação própria.
  let mysql = {
    ok: teste.ok,
    tipo: 'MariaDB',
    papel: 'produção / site público',
    configurado: config.mysql.configurado(),
    mensagem: teste.mensagem,
    latenciaMs: Date.now() - t0,
  };

  if (teste.ok) {
    try {
      const pool = poolMySql();
      const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM apps');
      mysql.apps = total;
    } catch {
      // contagem é acessório; a conexão já foi validada acima
    }
  }

  // Os dois catálogos batem?
  const sincronizado =
    sqlite.ok && mysql.ok && mysql.apps !== undefined ? sqlite.apps === mysql.apps : null;

  res.json({ modo: config.modo, sqlite, mysql, sincronizado });
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

const httpServer = app.listen(config.porta, host, () => {
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

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.once(sinal, async () => {
    await encerrarMestreMcp();
    httpServer.close(() => process.exit(0));
  });
}
