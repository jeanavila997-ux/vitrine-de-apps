import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { config } from './config.js';

const BLOQUEADAS = new Set(['definir_modo_livre', 'executar_comando_livre']);
let client = null;
let transport = null;
let conectando = null;
let toolsCache = [];
let ultimoErro = '';

function timeout(promise, ms, descricao) {
  let timer;
  const limite = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout em ${descricao} (${ms} ms).`)), ms);
  });
  return Promise.race([
    promise,
    limite,
  ]).finally(() => clearTimeout(timer));
}

function ambienteFiltrado() {
  return Object.fromEntries(Object.entries(process.env).filter(([, valor]) => typeof valor === 'string'));
}

async function conectar() {
  if (!config.mestreMcp.habilitado) throw new Error('Integração MCP com o Mestre do PC está desabilitada.');
  if (client) return client;
  if (conectando) return conectando;
  conectando = (async () => {
    if (!fs.existsSync(config.mestreMcp.entry)) {
      throw new Error(`MCP do Mestre não encontrado. Configure MESTRE_MCP_ENTRY (${config.mestreMcp.entry}).`);
    }
    const nextClient = new Client({ name: 'vitrine-de-apps', version: '0.1.0' });
    const nextTransport = new StdioClientTransport({
      command: process.execPath,
      args: [config.mestreMcp.entry],
      cwd: path.dirname(config.mestreMcp.entry),
      env: ambienteFiltrado(),
      stderr: 'pipe',
    });
    nextTransport.stderr?.on('data', (chunk) => {
      const linha = String(chunk).trim();
      if (linha && !linha.includes('iniciado em stdio')) console.error(`[mestre-mcp] ${linha}`);
    });
    try {
      await timeout(nextClient.connect(nextTransport), config.mestreMcp.conexaoTimeoutMs, 'conexão MCP');
      client = nextClient;
      transport = nextTransport;
      ultimoErro = '';
      return client;
    } catch (erro) {
      ultimoErro = erro.message;
      try { await nextTransport.close(); } catch {}
      throw erro;
    }
  })();
  try { return await conectando; }
  finally { conectando = null; }
}

export async function listarFerramentasMestre({ atualizar = false } = {}) {
  if (toolsCache.length && !atualizar) return toolsCache;
  const conectado = await conectar();
  const resposta = await timeout(conectado.listTools(), config.mestreMcp.timeoutMs, 'tools/list');
  toolsCache = (resposta.tools || []).filter((tool) => !BLOQUEADAS.has(tool.name));
  return toolsCache;
}

export async function chamarFerramentaMestre(nome, argumentos = {}) {
  if (BLOQUEADAS.has(nome)) throw new Error(`A ferramenta ${nome} é bloqueada na integração com a Vitrine.`);
  const tools = await listarFerramentasMestre();
  if (!tools.some((tool) => tool.name === nome)) throw new Error(`Ferramenta MCP desconhecida: ${nome}.`);
  const conectado = await conectar();
  return timeout(
    conectado.callTool({ name: nome, arguments: argumentos }),
    config.mestreMcp.timeoutMs,
    `tools/call ${nome}`
  );
}

export function ferramentaExigeConfirmacao(tool) {
  if (!tool) return true;
  if (tool.annotations?.destructiveHint === true) return true;
  if (tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false) return false;
  return true;
}

export function textoResultadoMcp(resultado) {
  const textos = (resultado?.content || []).filter((item) => item.type === 'text').map((item) => item.text);
  return textos.join('\n').trim() || (resultado?.isError ? 'A ferramenta retornou erro sem detalhes.' : 'Ferramenta concluída.');
}

export async function statusMestreMcp() {
  if (!config.mestreMcp.habilitado) return { ok: false, habilitado: false, conectado: false, ferramentas: 0 };
  try {
    const tools = await listarFerramentasMestre();
    return { ok: true, habilitado: true, conectado: true, ferramentas: tools.length, bloqueadas: [...BLOQUEADAS] };
  } catch (erro) {
    ultimoErro = erro.message;
    return { ok: false, habilitado: true, conectado: false, ferramentas: 0, erro: ultimoErro };
  }
}

export async function encerrarMestreMcp() {
  const atual = transport;
  client = null; transport = null; toolsCache = [];
  if (atual) try { await atual.close(); } catch {}
}
