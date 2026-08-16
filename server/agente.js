// Agente da Vitrine de Apps — chat + comandos CLI.
// Responde localmente para comandos conhecidos e pode usar Ollama (local ou
// cloud) para conversas livres. Segue o mesmo padrão do Mestre do PC V10.
import { config } from './config.js';
import { listarApps, buscarApp, salvarMensagemChat, listarMensagensChat } from './db.js';

const SYSTEM_PROMPT =
  'Você é o agente da Vitrine de Apps, um orquestrador local de projetos. Responda em português, de forma objetiva. Quando souber, mencione os apps do catálogo. Não execute comandos destrutivos sem confirmação.';

// ============================================================
// Comandos CLI locais
// ============================================================
const COMANDOS = [
  {
    id: 'listar_apps',
    padroes: [/^(listar?|mostrar?|ver|quais)(?:\s+(?:os|meus))?\s+apps?/i, /^apps\s*(disponiveis)?/i],
    acao: () => {
      const apps = listarApps();
      if (!apps.length) return 'Nenhum app catalogado ainda.';
      const linhas = apps.map((a) => `• ${a.nome} (${a.slug}) — ${a.estado}${a.porta ? ` · porta ${a.porta}` : ''}`);
      return `Apps catalogados:\n${linhas.join('\n')}`;
    },
  },
  {
    id: 'status_app',
    padroes: [/^(status|estado)\s+(?:de\s+)?(.+)/i, /^como\s+(?:esta|tá)\s+(?:o\s+)?(.+)/i],
    acao: (texto, matches) => {
      const termo = (matches[2] ?? matches[1] ?? '').trim().toLowerCase();
      const apps = listarApps();
      const app = apps.find((a) => a.slug === termo || a.nome.toLowerCase().includes(termo));
      if (!app) return `Não encontrei um app correspondente a "${termo}".`;
      const info = [`${app.icone} ${app.nome} (${app.slug})`, `Estado: ${app.estado}`];
      if (app.porta) info.push(`Porta: ${app.porta}`);
      if (app.pid) info.push(`PID: ${app.pid}`);
      if (app.url_local) info.push(`Local: ${app.url_local}`);
      if (app.mensagem) info.push(`Mensagem: ${app.mensagem}`);
      return info.join('\n');
    },
  },
  {
    id: 'iniciar_app',
    padroes: [/^(iniciar?|startar?|subir|ligar)\s+(?:o\s+)?(.+)/i, /^start\s+(.+)/i],
    acao: (texto, matches) => {
      const termo = matches[1].trim().toLowerCase();
      const app = buscarApp(termo) ?? listarApps().find((a) => a.nome.toLowerCase().includes(termo));
      if (!app) return `Não encontrei um app correspondente a "${termo}".`;
      if (app.estado === 'online') return `${app.nome} já está online.`;
      return `Comando recebido: iniciar ${app.nome} (${app.slug}).\nAinda não controlo processos automaticamente — use o botão na tela do app quando liberado.`;
    },
  },
  {
    id: 'parar_app',
    padroes: [/^(parar?|detener|matar|stop|desligar)\s+(?:o\s+)?(.+)/i],
    acao: (texto, matches) => {
      const termo = matches[1].trim().toLowerCase();
      const app = buscarApp(termo) ?? listarApps().find((a) => a.nome.toLowerCase().includes(termo));
      if (!app) return `Não encontrei um app correspondente a "${termo}".`;
      if (app.estado !== 'online') return `${app.nome} não está online.`;
      return `Comando recebido: parar ${app.nome} (${app.slug}).\nAinda não controlo processos automaticamente — use o gerenciador de tarefas ou pare manualmente.`;
    },
  },
  {
    id: 'listar_modelos',
    padroes: [/^(listar?|mostrar?|ver|quais)(?:\s+(?:os|meus))?\s+modelos?/i, /^modelos?\s*(ollama)?/i],
    acao: async () => {
      const modelos = await listarModelosOllama();
      if (!modelos.length) return 'Nenhum modelo Ollama disponível no momento.';
      const linhas = modelos.map((m) => `• ${m.name}${m.size ? ` (${m.size})` : ''}`);
      return `Modelos disponíveis:\n${linhas.join('\n')}`;
    },
  },
  {
    id: 'ajuda',
    padroes: [/^(ajuda|help|comandos|o\s+que\s+(?:voce|vc)\s+(?:faz|faz\?))/i, /^\?$/],
    acao: () => {
      return `Comandos disponíveis:\n• listar apps — mostra o catálogo e status\n• status <nome ou slug> — estado de um app\n• iniciar <nome ou slug> — prepara para subir um app\n• parar <nome ou slug> — prepara para derrubar um app\n• listar modelos — modelos Ollama disponíveis\n• ajuda — mostra esta mensagem\n\nPara conversas livres, configure OLLAMA_API_KEY no .env.`;
    },
  },
];

function detectarComando(texto) {
  for (const cmd of COMANDOS) {
    for (const padrao of cmd.padroes) {
      const matches = texto.match(padrao);
      if (matches) return { cmd, matches };
    }
  }
  return null;
}

// ============================================================
// Ollama (local ou cloud)
// ============================================================
function ollamaHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (config.ollama.apiKey) {
    headers.Authorization = `Bearer ${config.ollama.apiKey}`;
  }
  return headers;
}

function buildOllamaOptions() {
  return {
    num_ctx: config.ollama.numCtx,
    temperature: config.ollama.temperature,
  };
}

export async function listarModelosOllama() {
  try {
    const res = await fetch(`${config.ollama.url}/api/tags`, {
      method: 'GET',
      headers: ollamaHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Ollama respondeu ${res.status}`);
    const dados = await res.json();
    return dados.models ?? [];
  } catch (erro) {
    console.error('Erro ao listar modelos Ollama:', erro.message);
    return [];
  }
}

async function chamarOllama(mensagens, modelo = null) {
  if (!config.ollama.habilitado) return null;
  try {
    const res = await fetch(`${config.ollama.url}/api/chat`, {
      method: 'POST',
      headers: ollamaHeaders(),
      body: JSON.stringify({
        model: modelo ?? config.ollama.modelo,
        messages: mensagens,
        stream: false,
        options: buildOllamaOptions(),
        keep_alive: '10m',
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const erro = await res.text();
      throw new Error(`Ollama respondeu ${res.status}: ${erro}`);
    }
    const dados = await res.json();
    return dados.message?.content ?? 'Resposta vazia do Ollama.';
  } catch (erro) {
    console.error('Erro ao chamar Ollama:', erro.message);
    return null;
  }
}

async function chamarAnthropic(mensagens) {
  if (!config.agente.apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.agente.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: mensagens.map((m) => ({ role: m.papel, content: m.conteudo })),
      }),
    });
    if (!res.ok) {
      const erro = await res.text();
      throw new Error(`Anthropic respondeu ${res.status}: ${erro}`);
    }
    const dados = await res.json();
    return dados.content?.[0]?.text ?? 'Resposta vazia da API.';
  } catch (erro) {
    console.error('Erro ao chamar Anthropic:', erro.message);
    return null;
  }
}

// ============================================================
// Processamento de mensagens
// ============================================================
export async function processarMensagem({ conteudo, usuarioId = null, modelo = null }) {
  if (!conteudo?.trim()) throw new Error('Mensagem vazia');

  salvarMensagemChat({ usuarioId, papel: 'user', conteudo: conteudo.trim(), meta: modelo ? JSON.stringify({ modelo }) : null });

  const comando = detectarComando(conteudo.trim());
  let resposta;
  let fonte = 'local';
  let ferramentas = [];

  if (comando) {
    resposta = await comando.cmd.acao(conteudo.trim(), comando.matches);
    ferramentas = [comando.cmd.id];
  } else {
    const historico = listarMensagensChat({ usuarioId, limite: 20 });
    const mensagens = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historico.map((m) => ({ role: m.papel, content: m.conteudo })),
      { role: 'user', content: conteudo.trim() },
    ];

    let respostaApi = await chamarOllama(mensagens, modelo);
    if (respostaApi) {
      resposta = respostaApi;
      fonte = 'ollama';
    } else {
      respostaApi = await chamarAnthropic(mensagens);
      if (respostaApi) {
        resposta = respostaApi;
        fonte = 'anthropic';
      } else {
        resposta = `Não entendi como ajudar com isso.\n\n${COMANDOS.find((c) => c.id === 'ajuda').acao()}`;
      }
    }
  }

  const meta = { fonte, ferramentas };
  salvarMensagemChat({ usuarioId, papel: 'assistant', conteudo: resposta, meta });

  return { resposta, fonte, ferramentas };
}

export function historicoChat({ usuarioId = null, limite = 100 } = {}) {
  return listarMensagensChat({ usuarioId, limite });
}
