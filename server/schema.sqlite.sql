-- Vitrine de Apps — schema SQLite (fonte da verdade local)
-- https://vitrinedeapps.cloud
-- Aplicado por: npm run db:init

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. usuarios — login da vitrine
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  senha_hash    TEXT    NOT NULL,
  nome          TEXT    NOT NULL,
  papel         TEXT    NOT NULL DEFAULT 'admin'
                CHECK (papel IN ('admin', 'leitor')),
  ativo         INTEGER NOT NULL DEFAULT 1,
  ultimo_acesso TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);

-- ============================================================
-- 2. sessoes — sessão em cookie httpOnly
-- ============================================================
CREATE TABLE IF NOT EXISTS sessoes (
  id         TEXT    PRIMARY KEY,             -- token aleatório (32 bytes hex)
  usuario_id INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  expira_em  TEXT    NOT NULL,
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira  ON sessoes (expira_em);

-- ============================================================
-- 3. apps — o catálogo da vitrine
-- ============================================================
CREATE TABLE IF NOT EXISTS apps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,    -- mult-chat-hub, boicontrol, ...
  nome            TEXT    NOT NULL,
  descricao       TEXT,
  icone           TEXT,                       -- emoji
  cor             TEXT,                       -- #8b5cf6 — identidade visual
  caminho         TEXT    NOT NULL,           -- pasta local
  repositorio     TEXT,                       -- URL do GitHub
  branch          TEXT,
  stack           TEXT,                       -- "Vite · React · Electron"
  tipo            TEXT    NOT NULL DEFAULT 'web'
                  CHECK (tipo IN ('web', 'desktop', 'servico', 'hibrido')),
  comando_start   TEXT,                       -- chave em allowed-commands.json
  pid_file        TEXT,                       -- nome do arquivo de PID (apps que se auto-elevam)
  porta           INTEGER,
  url_local       TEXT,
  url_publica     TEXT,
  banco           TEXT,                       -- supabase, sqlite, mysql, nenhum
  tem_auth        INTEGER NOT NULL DEFAULT 0,
  ordem           INTEGER NOT NULL DEFAULT 0, -- ordem no menu
  visivel         INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apps_slug  ON apps (slug);
CREATE INDEX IF NOT EXISTS idx_apps_ordem ON apps (ordem);

-- ============================================================
-- 4. app_status — última checagem de cada app
-- ============================================================
CREATE TABLE IF NOT EXISTS app_status (
  app_id         INTEGER PRIMARY KEY,
  estado         TEXT    NOT NULL DEFAULT 'offline'
                 CHECK (estado IN ('online','offline','iniciando','erro','indisponivel')),
  pid            INTEGER,
  porta_efetiva  INTEGER,
  mensagem       TEXT,                        -- motivo do erro, quando houver
  iniciado_em    TEXT,
  verificado_em  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
);

-- ============================================================
-- 5. execucoes — histórico de start/stop
-- ============================================================
CREATE TABLE IF NOT EXISTS execucoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id       INTEGER NOT NULL,
  usuario_id   INTEGER,
  acao         TEXT    NOT NULL CHECK (acao IN ('iniciar','parar','reiniciar')),
  origem       TEXT    NOT NULL DEFAULT 'ui'
               CHECK (origem IN ('ui','agente','automacao','api')),
  sucesso      INTEGER NOT NULL DEFAULT 0,
  pid          INTEGER,
  mensagem     TEXT,
  duracao_ms   INTEGER,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (app_id)     REFERENCES apps (id)     ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_execucoes_app   ON execucoes (app_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_execucoes_data  ON execucoes (criado_em DESC);

-- ============================================================
-- 6. automacoes — regras "quando X, faça Y"
-- ============================================================
CREATE TABLE IF NOT EXISTS automacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL,
  descricao      TEXT,
  gatilho_tipo   TEXT    NOT NULL
                 CHECK (gatilho_tipo IN ('app_iniciou','app_parou','app_falhou','agendado','manual')),
  gatilho_app_id INTEGER,
  gatilho_config TEXT,                        -- JSON: cron, etc.
  acao_tipo      TEXT    NOT NULL
                 CHECK (acao_tipo IN ('iniciar_app','parar_app','notificar','webhook')),
  acao_app_id    INTEGER,
  acao_config    TEXT,                        -- JSON
  ativa          INTEGER NOT NULL DEFAULT 1,
  ultima_exec    TEXT,
  total_execs    INTEGER NOT NULL DEFAULT 0,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (gatilho_app_id) REFERENCES apps (id) ON DELETE CASCADE,
  FOREIGN KEY (acao_app_id)    REFERENCES apps (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_automacoes_ativa ON automacoes (ativa);

-- ============================================================
-- 7. integracoes — ligações entre apps (o objetivo do projeto)
-- ============================================================
CREATE TABLE IF NOT EXISTS integracoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  app_origem    INTEGER NOT NULL,
  app_destino   INTEGER NOT NULL,
  nome          TEXT    NOT NULL,
  descricao     TEXT,
  tipo          TEXT    NOT NULL DEFAULT 'redirect'
                CHECK (tipo IN ('redirect','api','recurso_compartilhado','sso')),
  config        TEXT,                         -- JSON: rota, headers, etc.
  ativa         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (app_origem)  REFERENCES apps (id) ON DELETE CASCADE,
  FOREIGN KEY (app_destino) REFERENCES apps (id) ON DELETE CASCADE,
  CHECK (app_origem <> app_destino)
);

CREATE INDEX IF NOT EXISTS idx_integracoes_origem ON integracoes (app_origem);

-- ============================================================
-- 8. logs_agente — auditoria de tudo que o agente fez
-- ============================================================

-- ============================================================
-- 9. chat_mensagens — histórico de conversas com o agente
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER,
  papel         TEXT    NOT NULL DEFAULT 'user'
                CHECK (papel IN ('user','assistant','system')),
  conteudo      TEXT    NOT NULL,
  meta          TEXT,                         -- JSON: modelo, tokens, ferramentas, etc.
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_data ON chat_mensagens (criado_em DESC);

-- ============================================================
-- 8. logs_agente — auditoria de tudo que o agente fez
-- ============================================================
CREATE TABLE IF NOT EXISTS logs_agente (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER,
  sdk           TEXT    NOT NULL DEFAULT 'ts' CHECK (sdk IN ('ts','py')),
  ferramenta    TEXT    NOT NULL,             -- listar_apps, iniciar_app, ...
  argumentos    TEXT,                         -- JSON já sanitizado
  resultado     TEXT,
  sucesso       INTEGER NOT NULL DEFAULT 1,
  erro          TEXT,
  duracao_ms    INTEGER,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_agente_data ON logs_agente (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_agente_ferr ON logs_agente (ferramenta);

-- ============================================================
-- Triggers de atualizado_em
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_usuarios_updated
AFTER UPDATE ON usuarios
BEGIN
  UPDATE usuarios SET atualizado_em = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_apps_updated
AFTER UPDATE ON apps
BEGIN
  UPDATE apps SET atualizado_em = datetime('now') WHERE id = NEW.id;
END;

-- ============================================================
-- Visão auxiliar: catálogo com status
-- ============================================================
DROP VIEW IF EXISTS v_apps_com_status;
CREATE VIEW v_apps_com_status AS
SELECT
  a.id, a.slug, a.nome, a.descricao, a.icone, a.cor, a.stack, a.tipo,
  a.porta, a.url_local, a.url_publica, a.repositorio, a.caminho, a.ordem,
  a.comando_start, a.pid_file,
  COALESCE(s.estado, 'offline') AS estado,
  s.pid, s.porta_efetiva, s.mensagem, s.iniciado_em, s.verificado_em
FROM apps a
LEFT JOIN app_status s ON s.app_id = a.id
WHERE a.visivel = 1
ORDER BY a.ordem, a.nome;
