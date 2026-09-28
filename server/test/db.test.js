// Testes de regressão do banco e do catálogo.
//
//   npm test
//
// Cobre os dois bugs que já quebraram um setup do zero:
// 1. apps-registry.json com valor de `tipo` fora do CHECK do schema
//    (HomeoVet chegou como "cli" e travou o db:seed inteiro).
// 2. db:init rodando migração antes do schema criar a tabela apps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// ============================================================
// 1. Registry vs. constraints do schema
// ============================================================

const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'server', 'apps-registry.json'), 'utf8')
);

const TIPOS_VALIDOS = ['web', 'desktop', 'servico', 'hibrido'];
const ESTADOS_VALIDOS = ['online', 'offline', 'iniciando', 'erro', 'indisponivel'];

test('todo app do registry tem slug único', () => {
  const slugs = registry.apps.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'slugs duplicados no registry');
});

test('todo app do registry tem tipo aceito pelo schema', () => {
  for (const app of registry.apps) {
    assert.ok(
      TIPOS_VALIDOS.includes(app.tipo),
      `"${app.slug}" tem tipo "${app.tipo}", fora do CHECK/ENUM do schema (${TIPOS_VALIDOS.join(', ')})`
    );
  }
});

test('todo comando_start do registry existe na allowlist', () => {
  const allowlist = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'server', 'allowed-commands.json'), 'utf8')
  ).comandos;

  for (const app of registry.apps) {
    if (app.comando_start === null || app.comando_start === undefined) continue;
    assert.ok(
      allowlist[app.comando_start],
      `"${app.slug}" referencia comando_start "${app.comando_start}" que não está na allowlist`
    );
  }
});

// ============================================================
// 2. db:init + db:seed num banco novo, do zero
// ============================================================

test('db:init e db:seed funcionam em banco novo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-test-'));
  const dbPath = path.join(dir, 'vitrine.db');

  try {
    const env = { ...process.env, SQLITE_PATH: dbPath, NODE_ENV: 'test' };

    execFileSync(process.execPath, ['server/scripts/init-db.js'], {
      cwd: ROOT,
      env,
      stdio: 'pipe',
    });

    execFileSync(process.execPath, ['server/scripts/seed-apps.js'], {
      cwd: ROOT,
      env,
      stdio: 'pipe',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('app_status só aceita estados do CHECK do schema', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-test-'));
  const dbPath = path.join(dir, 'vitrine.db');

  try {
    const env = { ...process.env, SQLITE_PATH: dbPath, NODE_ENV: 'test' };
    execFileSync(process.execPath, ['server/scripts/init-db.js'], {
      cwd: ROOT,
      env,
      stdio: 'pipe',
    });
    execFileSync(process.execPath, ['server/scripts/seed-apps.js'], {
      cwd: ROOT,
      env,
      stdio: 'pipe',
    });

    const { execFileSync: run } = { execFileSync };
    const saida = run(
      process.execPath,
      ['-e', `
        process.env.SQLITE_PATH = ${JSON.stringify(dbPath)};
        const { abrirSqlite, fecharSqlite } = await import('${path.join(ROOT, 'server/db.js').replaceAll('\\', '/')}');
        const db = abrirSqlite();
        const apps = db.prepare('SELECT id FROM apps ORDER BY ordem').all();
        let rejeitou = false;
        try {
          db.prepare("INSERT INTO app_status (app_id, estado) VALUES (?, 'impossivel')").run(apps[0].id);
        } catch {
          rejeitou = true;
        }
        fecharSqlite();
        if (!rejeitou) throw new Error('CHECK de estado não está ativo');
      `],
      { cwd: ROOT, env: { ...env }, stdio: 'pipe', }
    );
    void saida;
    void ESTADOS_VALIDOS;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
