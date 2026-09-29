# Configurando o app no Dify

Guia para criar o app que atende o agente da Vitrine. O lado da Vitrine já
está pronto (PRs #7 e #8): a cadeia é **Ollama → Dify → Anthropic** e o
comando de chat `POST /chat-messages` mantém o thread via `conversation_id`.

**Pré-requisito:** conta no [Dify Cloud](https://cloud.dify.ai) ou instância
self-hosted (Docker; URL então `http://127.0.0.1/v1`).

## 1. Criar o app

1. **Criar aplicativo → Chat** (não "Agent" nem "Workflow": a Vitrine
   envia `query` + `conversation_id` no formato de chat).
2. Nome sugerido: `Vitrine de Apps — Assistente`.
3. No modelo do app, escolha o LLM que preferir — a Vitrine não envia
   `model`, então quem decide é o app no Dify.

## 2. Prompt de sistema (Orquestração → Instrução)

Cole como instrução do app:

```
Você é o assistente da Vitrine de Apps — um orquestrador local dos
projetos do usuário Jean, em português brasileiro.

O que você sabe (catálogo atual):

- MULT-CHAT-HUB (mult-chat-hub) — hub de chat com IA, Electron + Next.js.
  Local: http://localhost:3001
- Estante de Ebooks (estante-de-ebooks) — catálogo e leitura de ebooks
  em PDF/HTML/Markdown, Electron + Fastify. Local: http://localhost:5173
- Cruzamento Bovinos (cruzamento-bovinos) — planejamento de cruzamento
  genético de bovinos com relatórios PDF. Local: http://localhost:5173
- Mestre do PC V10 (mestre-do-pc) — diagnóstico e manutenção do Windows
  via MCP + Ollama. Local: http://127.0.0.1:7777
- BoiControl (boicontrol) — controle de rebanho offline-first, PWA.
  Local: http://localhost:8080
- HomeoVet (homeovet) — agentes de IA em Python para homeopatia
  veterinária, uso educacional; sem servidor/porta.

Como responder:

- Seja objetivo; prefira listas curtas e passos numerados.
- Perguntas sobre estado ou catálogo: os comandos `listar apps`,
  `status <slug>` e `ajuda` são respondidos pela própria Vitrine,
  offline — não tente simulá-los.
- `iniciar <slug>` e `parar <slug>` executam de verdade na máquina do
  usuário (allowlist). `parar` pede `confirmar <slug>`. Se o usuário
  pedir para iniciar/parar algo, oriente a usar esses comandos no chat.
- Nunca invente portas, caminhos ou estado — use o catálogo acima e, em
  dúvida, mande o usuário rodar `status <slug>`.
- A porta 5173 hoje é compartilhada por Estante e Cruzamento Bovinos
  (issue conhecida): desaconselhe parar esses dois apps até a correção.
- HomeoVet não tem servidor; não sugira abri-lo em navegador.
```

## 3. Knowledge base (opcional, recomendado)

**Conhecimento → Criar base de conhecimento** e faça upload de:

| Arquivo | Por quê |
|---|---|
| `CLAUDE.md` | arquitetura, modos local/hospedado, convenções |
| `README.md` | visão geral, comandos, tabela de apps |
| `PLANO.md` | as 8 fases, decisões e riscos |
| `deploy/ESTADO.md` | estado do deploy e bloqueio do tipo de site |
| `deploy/README.md` | passo a passo de deploy |

Mode de indexação sugerido: **Alta qualidade** (o catálogo é pequeno;
precisão > custo). Vincule a base ao app em **Contexto**.

## 4. API Key

**API Access → API Key → Criar** (formato `app-…`). No `.env` da Vitrine:

```
DIFY_API_URL=https://api.dify.ai/v1      # cloud
# DIFY_API_URL=http://127.0.0.1/v1       # self-hosted
DIFY_API_KEY=app-…                        # a chave gerada
DIFY_USER=vitrine
```

Reinicie a Vitrine e verifique em `GET /api/dify/status` →
`{"configurado": true}`.

## 5. Ajustes finos

- **Coordinate (Coordenar):** desative o herói de sugestões iniciais se
  preferir respostas secas.
- **Variáveis de entrada:** a Vitrine envia `inputs: {}` — não configure
  variáveis obrigatórias, ou a chamada falha com `invalid_param`.
- **Function calling / ferramentas:** ainda não conectado ao
  `process-manager` da Vitrine (os comandos `iniciar`/`parar` são locais).
  Quando a issue #4 estiver resolvida, vale expor
  `GET /api/apps/:slug/status` como ferramenta custom.
- **Reinício de thread:** o botão 🗑 do chat da Vitrine chama
  `POST /api/dify/conversa/limpar`, que só zera o `conversation_id`
  localmente. A conversa no Dify continua existindo lá — para limpar
  de verdade, use a tela do próprio Dify.

## 6. Fumaça

1. Chat da Vitrine: `ajuda` → resposta local (não passa pelo Dify)
2. Chat: `listar apps` → resposta local
3. Chat: pergunta livre (`"o que é o Mestre do PC?"`) → se Ollama estiver
   ligado, responde o Ollama; com `OLLAMA_ENABLED=false`, cai no Dify
4. `GET /api/dify/status` → `configurado: true`
