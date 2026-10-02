// Agente da Vitrine de Apps — chat + comandos CLI.
// Responde localmente para comandos conhecidos e pode usar Ollama (local ou
// cloud) para conversas livres. Segue o mesmo padrão do Mestre do PC V10.
import { config } from './config.js';
import { listarApps, buscarApp, salvarMensagemChat, listarMensagensChat } from './db.js';

const SYSTEM_PROMPT =
  'Você é o agente da Vitrine de Apps, um orquestrador local de projetos. Responda em português, de forma objetiva. Quando souber, mencione os apps do catálogo. Não execute comandos destrutivos sem confirmação.';

// ============================================================
// Controle de processos via agente
// ============================================================
// Ações destrutivas (parar) exigem confirmação explícita: a intenção fica
// pendente por 2 minutos e "confirmar" a executa. Iniciar dispensa
// confirmação — é o mesmo botão da UI, dentro da allowlist.
const confirmacoes = new Map();
const TTL_CONFIRMACAO_MS = 2 * 60 * 1000;

function registrarConfirmacao(slug, acao) {
  confirmacoes.set(slug, { acao, expiraEm: Date.now() + TTL_CONFIRMACAO_MS });
}

function consumirConfirmacao(slug, acao) {
  const pend = confirmacoes.get(slug);
  confirmacoes.delete(slug);
  if (!pend || pend.acao !== acao || Date.now() > pend.expiraEm) return false;
  return true;
}

async function executarAcaoApp({ app, acao, usuarioId = null }) {
  const { executarAcao } = await import('./process-manager.js');
  const resultado = await executarAcao({
    app,
    acao,
    origem: 'agente',
    usuarioId,
  });
  return resultado.ok
    ? `${resultado.mensagem}\n(Estado: ${resultado.estado}.)`
    : `${resultado.mensagem}`;
}

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
    acao: async (texto, matches) => {
      // matches[1] é o verbo, matches[2] é o alvo; em /^start\s+(.+)/ o
      // alvo vem em matches[1].
      const bruto = matches[2] ?? matches[1];
      const termo = bruto.trim().toLowerCase();
      const app = buscarApp(termo) ?? listarApps().find((a) => a.nome.toLowerCase().includes(termo));
      if (!app) return `Não encontrei um app correspondente a "${termo}".`;
      if (app.estado === 'online') return `${app.nome} já está online.`;
      if (!app.comando_start) {
        return `${app.nome} não tem comando de start na Vitrine (só apps com comando registrado na allowlist podem ser iniciados).`;
      }
      return executarAcaoApp({ app, acao: 'iniciar' });
    },
  },
  {
    id: 'parar_app',
    padroes: [/^(parar?|detener|matar|stop|desligar)\s+(?:o\s+)?(.+)/i],
    acao: async (texto, matches) => {
      // matches[1] é o verbo, matches[2] é o alvo.
      const termo = (matches[2] ?? '').trim().toLowerCase();
      const app = buscarApp(termo) ?? listarApps().find((a) => a.nome.toLowerCase().includes(termo));
      if (!app) return `Não encontrei um app correspondente a "${termo}".`;
      if (app.estado !== 'online') return `${app.nome} não está online.`;
      registrarConfirmacao(app.slug, 'parar');
      return `⚠️ Parar ${app.nome} (${app.slug}) encerra o processo agora.\nResponda "confirmar ${app.slug}" para executar (válido por 2 minutos).`;
    },
  },
  {
    id: 'confirmar_acao',
    padroes: [/^(confirmar?|confirmo|ok)\s+(?:parar\s+)?(.+)/i],
    acao: async (texto, matches) => {
      const termo = matches[2].trim().toLowerCase();
      const app = buscarApp(termo) ?? listarApps().find((a) => a.nome.toLowerCase().includes(termo));
      if (!app) return `Não encontrei um app correspondente a "${termo}".`;
      if (!consumirConfirmacao(app.slug, 'parar')) {
        return `Não há parada de ${app.nome} aguardando confirmação (ou expirou). Peça "parar ${app.slug}" novamente.`;
      }
      return executarAcaoApp({ app, acao: 'parar' });
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
      return `Comandos disponíveis:\n• listar apps — mostra o catálogo e status\n• status <nome ou slug> — estado de um app\n• iniciar <nome ou slug> — sobe o app de verdade (allowlist)\n• parar <nome ou slug> — pede parada; exige "confirmar <slug>"\n• confirmar <nome ou slug> — executa a parada confirmada\n• listar modelos — modelos Ollama disponíveis\n• ajuda — mostra esta mensagem\n\nPara conversas livres, configure Ollama, Dify ou Anthropic no .env.`;
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
// Dify (plataforma de agentes e workflows)
// ============================================================
// A API do Dify mantém o estado da conversa no servidor dele: passamos
// conversation_id para continuar o mesmo thread e guardamos o id retornado.
let conversaDify = null;

async function chamarDify(mensagens, conteudo) {
  if (!config.dify.habilitado || !config.dify.url || !config.dify.apiKey) return null;
  try {
    const res = await fetch(`${config.dify.url}/chat-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.dify.apiKey}`, // chave por app, formato app-…
      },
      body: JSON.stringify({
        inputs: {},
        query: conteudo,
        response_mode: 'blocking',
        conversation_id: conversaDify ?? '',
        user: config.dify.usuario,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const erro = await res.text();
      // Conversa apagada ou inválida no lado do Dify: descarta o id guardado
      // para a próxima mensagem abrir um thread novo em vez de repetir o erro.
      if (res.status === 404) conversaDify = null;
      throw new Error(`Dify respondeu ${res.status}: ${erro}`);
    }
    const dados = await res.json();
    conversaDify = dados.conversation_id ?? conversaDify;
    return dados.answer ?? 'Resposta vazia do Dify.';
  } catch (erro) {
    console.error('Erro ao chamar Dify:', erro.message);
    return null;
  }
}

/** Reinicia a conversa do Dify (usado pelo botão limpar do chat). */
export function limparConversaDify() {
  conversaDify = null;
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
        messages: mensagens.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
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

  salvarMensagemChat({ usuarioId, papel: 'user', conteudo: conteudo.trim(), meta: modelo ? { modelo } : null });

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
      respostaApi = await chamarDify(mensagens, conteudo.trim());
      if (respostaApi) {
        resposta = respostaApi;
        fonte = 'dify';
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
  }

  const meta = { fonte, ferramentas };
  salvarMensagemChat({ usuarioId, papel: 'assistant', conteudo: resposta, meta });

  return { resposta, fonte, ferramentas };
}

export function historicoChat({ usuarioId = null, limite = 100 } = {}) {
  return listarMensagensChat({ usuarioId, limite });
}
