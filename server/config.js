// Configuração central da Vitrine de Apps.
// Tudo que vem do ambiente passa por aqui — nada de process.env espalhado.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const num = (v, padrao) => (v ? Number(v) : padrao);
const bool = (v, padrao = false) => (v === undefined ? padrao : v === 'true' || v === '1');

export const config = {
  ambiente: process.env.NODE_ENV ?? 'development',
  producao: process.env.NODE_ENV === 'production',

  // Local: controla processos de verdade (inicia/para apps na máquina).
  // Hospedado: o servidor não alcança a máquina do usuário, então o
  // controle de processos fica desligado e a Vitrine vira portal.
  get modo() {
    return process.env.VITRINE_MODO ?? (this.producao ? 'hospedado' : 'local');
  },
  get podeControlarProcessos() {
    return this.modo === 'local';
  },

  // ---- Domínio público do projeto ----
  dominio: 'vitrinedeapps.cloud',
  urlPublica: process.env.PUBLIC_URL ?? 'https://vitrinedeapps.cloud',

  // ---- Servidor local ----
  porta: num(process.env.PORT, 4400),
  portaVite: num(process.env.VITE_PORT, 4401),
  // Faixa reservada para os apps que a Vitrine lança
  faixaPortas: { inicio: 4410, fim: 4460 },

  // ---- Sessão ----
  sessao: {
    segredo: process.env.SESSION_SECRET ?? '',
    cookie: 'vitrine_sid',
    duracaoHoras: num(process.env.SESSION_HOURS, 24 * 7),
  },

  // ---- SQLite (fonte da verdade local) ----
  sqlite: {
    caminho: path.resolve(ROOT, process.env.SQLITE_PATH ?? './data/vitrine.db'),
  },

  // ---- MySQL (Hostinger / produção) ----
  mysql: {
    host: process.env.DB_HOST ?? '',
    porta: num(process.env.DB_PORT, 3306),
    banco: process.env.DB_NAME ?? '',
    usuario: process.env.DB_USER ?? '',
    senha: process.env.DB_PASSWORD ?? '',
    configurado() {
      return Boolean(this.host && this.banco && this.usuario && this.senha);
    },
  },

  // ---- Deploy ----
  ssh: {
    host: process.env.SSH_HOST ?? '',
    porta: num(process.env.SSH_PORT, 22),
    usuario: process.env.SSH_USER ?? '',
    caminhoRemoto: process.env.SSH_REMOTE_PATH ?? '',
    chave: process.env.SSH_KEY_PATH ?? '',
  },

  // ---- Agente ----
  agente: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    habilitado: bool(process.env.AGENT_ENABLED, true),
  },

  // ---- Dify (plataforma de agentes e workflows de LLM) ----
  // A URL deve incluir o prefixo da versão (ex.: https://api.dify.ai/v1
  // ou http://127.0.0.1/v1 em self-hosting). A chave é por app (app-…).
  dify: {
    url: (process.env.DIFY_API_URL ?? '').replace(/\/+$/, ''),
    apiKey: process.env.DIFY_API_KEY ?? '',
    usuario: process.env.DIFY_USER ?? 'vitrine',
    habilitado: bool(process.env.DIFY_ENABLED, true),
  },

  // ---- Ollama ----
  ollama: {
    get url() {
      const env = process.env.OLLAMA_API_URL;
      if (env) return env.replace(/\/+$/, '');
      return (process.env.OLLAMA_API_KEY ? 'https://ollama.com' : 'http://127.0.0.1:11434');
    },
    apiKey: process.env.OLLAMA_API_KEY ?? '',
    modelo: process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:3b-instruct',
    numCtx: num(process.env.OLLAMA_NUM_CTX, 8192),
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE ?? '0.7'),
    habilitado: bool(process.env.OLLAMA_ENABLED, true),
  },
};

/** Origens aceitas em requisições POST — nada de CORS `*`. */
export function origensPermitidas() {
  return [
    `http://127.0.0.1:${config.porta}`,
    `http://localhost:${config.porta}`,
    `http://127.0.0.1:${config.portaVite}`,
    `http://localhost:${config.portaVite}`,
    config.urlPublica,
  ];
}

/** Falha cedo se algo essencial estiver faltando em produção. */
export function validarConfig() {
  const erros = [];

  if (!config.sessao.segredo || config.sessao.segredo.length < 32) {
    erros.push('SESSION_SECRET ausente ou com menos de 32 caracteres');
  }
  if (config.producao && !config.mysql.configurado()) {
    erros.push('Credenciais do MySQL incompletas (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)');
  }
  return erros;
}
