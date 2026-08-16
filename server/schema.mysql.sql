-- Vitrine de Apps — schema MySQL/MariaDB (Hostinger / produção)
-- https://vitrinedeapps.cloud — credenciais em .env (DB_*)
-- Aplicado por: npm run db:init:mysql
-- Também pode ser colado direto no phpMyAdmin (aba SQL).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  papel         ENUM('admin','leitor') NOT NULL DEFAULT 'admin',
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acesso DATETIME     NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. sessoes
-- ============================================================
CREATE TABLE IF NOT EXISTS sessoes (
  id         CHAR(64)     NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  ip         VARCHAR(45)  NULL,
  user_agent VARCHAR(255) NULL,
  expira_em  DATETIME     NOT NULL,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessoes_usuario (usuario_id),
  KEY idx_sessoes_expira (expira_em),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. apps — o catálogo da vitrine
-- ============================================================
CREATE TABLE IF NOT EXISTS apps (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(80)  NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  descricao     TEXT         NULL,
  icone         VARCHAR(16)  NULL,
  cor           CHAR(7)      NULL,
  caminho       VARCHAR(500) NOT NULL,
  repositorio   VARCHAR(255) NULL,
  branch        VARCHAR(120) NULL,
  stack         VARCHAR(255) NULL,
  tipo          ENUM('web','desktop','servico','hibrido') NOT NULL DEFAULT 'web',
  comando_start VARCHAR(120) NULL,
  pid_file      VARCHAR(120) NULL,
  porta         SMALLINT UNSIGNED NULL,
  url_local     VARCHAR(255) NULL,
  url_publica   VARCHAR(255) NULL,
  banco         VARCHAR(60)  NULL,
  tem_auth      TINYINT(1)   NOT NULL DEFAULT 0,
  ordem         SMALLINT     NOT NULL DEFAULT 0,
  visivel       TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_apps_slug (slug),
  KEY idx_apps_ordem (ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. app_status
-- ============================================================
CREATE TABLE IF NOT EXISTS app_status (
  app_id        INT UNSIGNED NOT NULL,
  estado        ENUM('online','offline','iniciando','erro','indisponivel') NOT NULL DEFAULT 'offline',
  pid           INT UNSIGNED NULL,
  porta_efetiva SMALLINT UNSIGNED NULL,
  mensagem      VARCHAR(500) NULL,
  iniciado_em   DATETIME     NULL,
  verificado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (app_id),
  CONSTRAINT fk_status_app FOREIGN KEY (app_id)
    REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. execucoes
-- ============================================================
CREATE TABLE IF NOT EXISTS execucoes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  app_id     INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NULL,
  acao       ENUM('iniciar','parar','reiniciar') NOT NULL,
  origem     ENUM('ui','agente','automacao','api') NOT NULL DEFAULT 'ui',
  sucesso    TINYINT(1)   NOT NULL DEFAULT 0,
  pid        INT UNSIGNED NULL,
  mensagem   VARCHAR(500) NULL,
  duracao_ms INT UNSIGNED NULL,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_execucoes_app (app_id, criado_em),
  KEY idx_execucoes_data (criado_em),
  CONSTRAINT fk_exec_app FOREIGN KEY (app_id)
    REFERENCES apps (id) ON DELETE CASCADE,
  CONSTRAINT fk_exec_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. automacoes
-- ============================================================
CREATE TABLE IF NOT EXISTS automacoes (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome           VARCHAR(160) NOT NULL,
  descricao      TEXT         NULL,
  gatilho_tipo   ENUM('app_iniciou','app_parou','app_falhou','agendado','manual') NOT NULL,
  gatilho_app_id INT UNSIGNED NULL,
  gatilho_config JSON         NULL,
  acao_tipo      ENUM('iniciar_app','parar_app','notificar','webhook') NOT NULL,
  acao_app_id    INT UNSIGNED NULL,
  acao_config    JSON         NULL,
  ativa          TINYINT(1)   NOT NULL DEFAULT 1,
  ultima_exec    DATETIME     NULL,
  total_execs    INT UNSIGNED NOT NULL DEFAULT 0,
  criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_automacoes_ativa (ativa),
  CONSTRAINT fk_auto_gatilho FOREIGN KEY (gatilho_app_id)
    REFERENCES apps (id) ON DELETE CASCADE,
  CONSTRAINT fk_auto_acao FOREIGN KEY (acao_app_id)
    REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. integracoes
-- ============================================================
CREATE TABLE IF NOT EXISTS integracoes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  app_origem  INT UNSIGNED NOT NULL,
  app_destino INT UNSIGNED NOT NULL,
  nome        VARCHAR(160) NOT NULL,
  descricao   TEXT         NULL,
  tipo        ENUM('redirect','api','recurso_compartilhado','sso') NOT NULL DEFAULT 'redirect',
  config      JSON         NULL,
  ativa       TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_integracoes_origem (app_origem),
  CONSTRAINT fk_integ_origem FOREIGN KEY (app_origem)
    REFERENCES apps (id) ON DELETE CASCADE,
  CONSTRAINT fk_integ_destino FOREIGN KEY (app_destino)
    REFERENCES apps (id) ON DELETE CASCADE,
  CONSTRAINT ck_integ_distintos CHECK (app_origem <> app_destino)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. logs_agente
-- ============================================================
CREATE TABLE IF NOT EXISTS logs_agente (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NULL,
  sdk        ENUM('ts','py') NOT NULL DEFAULT 'ts',
  ferramenta VARCHAR(80)  NOT NULL,
  argumentos JSON         NULL,
  resultado  TEXT         NULL,
  sucesso    TINYINT(1)   NOT NULL DEFAULT 1,
  erro       VARCHAR(500) NULL,
  duracao_ms INT UNSIGNED NULL,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_agente_data (criado_em),
  KEY idx_logs_agente_ferr (ferramenta),
  CONSTRAINT fk_logs_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Visão auxiliar: catálogo com status
-- ============================================================
CREATE OR REPLACE VIEW v_apps_com_status AS
SELECT
  a.id, a.slug, a.nome, a.descricao, a.icone, a.cor, a.stack, a.tipo,
  a.porta, a.url_local, a.url_publica, a.repositorio, a.caminho, a.ordem,
  a.comando_start, a.pid_file,
  COALESCE(s.estado, 'offline') AS estado,
  s.pid, s.porta_efetiva, s.mensagem, s.iniciado_em, s.verificado_em
FROM apps a
LEFT JOIN app_status s ON s.app_id = a.id
WHERE a.visivel = 1;
