// Gerenciador de processos da Vitrine de Apps.
//
// Inicia e para os apps do catálogo usando SOMENTE comandos registrados em
// allowed-commands.json (allowlist). Nada de comando livre ou gerado por IA.
//
// O estado de um app é inferido pela PORTA, não pelo PID do spawn: vários
// apps (ex.: Mestre do PC) disparam um processo que se auto-eleva e devolve o
// controle, então o PID que o spawn retorna não é o processo que fica de pé.
import { spawn, execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { registrarStatus, registrarExecucao } from './db.js';

// Cache em memória dos processos que a Vitrine lançou, para o caso de um app
// não expor porta (ex.: Electron). Chave = slug.
const processos = new Map();

const allowlist = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'server', 'allowed-commands.json'), 'utf8')
).comandos;

/** Resolve o comando da allowlist, substituindo {caminho} pelo caminho do app. */
function resolverComando(app) {
  const chave = app.comando_start;
  if (!chave) return null;
  const cmd = allowlist[chave];
  if (!cmd) return null;

  const argumentos = cmd.argumentos.map((arg) =>
    arg.replaceAll('{caminho}', app.caminho)
  );
  return { executavel: cmd.executavel, argumentos };
}

/** Retorna o PID do processo que escuta numa porta, ou null se ninguém escuta. */
function pidDaPorta(porta) {
  if (!porta) return null;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-NetTCPConnection -LocalPort ${porta} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
      ],
      { windowsHide: true, timeout: 10000 },
      (erro, stdout) => {
        if (erro) return resolve(null);
        const pid = Number(String(stdout).trim());
        resolve(Number.isInteger(pid) && pid > 0 ? pid : null);
      }
    );
  });
}

/**
 * Lê o PID de um arquivo de PID (ex.: MestreDoPC-Launcher.pid), validando que
 * o processo ainda existe. Retorna null se o arquivo não existir ou o processo
 * já tiver morrido.
 */
function pidDoArquivo(app) {
  if (!app.pid_file) return null;
  const caminho = path.join(app.caminho, app.pid_file);
  if (!fs.existsSync(caminho)) return null;
  try {
    const pid = Number(fs.readFileSync(caminho, 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    // Valida que o processo existe (sem matar nada — só checa).
    const resultado = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id`],
      { windowsHide: true, timeout: 5000 }
    );
    const vivo = Number(String(resultado.stdout).trim()) === pid;
    return vivo ? pid : null;
  } catch {
    return null;
  }
}

/** Verifica se um app está online, olhando a porta (ou o processo lançado). */
export async function verificarStatus(app) {
  if (app.porta) {
    const pid = await pidDaPorta(app.porta);
    // PID 4 (System) é um artefato do HttpListener do PowerShell: a porta fica
    // registrada no driver HTTP.sys do kernel, então o processo real não aparece
    // em Get-NetTCPConnection. Nesse caso, cai no PID file do app.
    if (pid && pid !== 4) return { online: true, pid };
    if (pid === 4) {
      const pidArquivo = pidDoArquivo(app);
      if (pidArquivo) return { online: true, pid: pidArquivo };
    }
  }
  const proc = processos.get(app.slug);
  if (proc && proc.exitCode === null) {
    return { online: true, pid: proc.pid };
  }
  return { online: false, pid: null };
}

/** Inicia um app. Retorna {ok, mensagem, pid}. */
export async function iniciarApp(app) {
  const comando = resolverComando(app);
  if (!comando) {
    return { ok: false, mensagem: `Sem comando de start registrado para "${app.slug}".` };
  }

  // Já está no ar?
  const atual = await verificarStatus(app);
  if (atual.online) {
    return { ok: false, mensagem: `${app.nome} já está online (PID ${atual.pid}).` };
  }

  try {
    const filho = spawn(comando.executavel, comando.argumentos, {
      cwd: app.caminho,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });

    // O evento 'error' é assíncrono e não é capturado pelo try/catch — sem um
    // listener ele derruba o processo Node inteiro (unhandled 'error').
    filho.on('error', (erro) => {
      console.error(`[process-manager] Falha ao spawnar ${app.slug}:`, erro.message);
    });

    filho.unref();
    processos.set(app.slug, filho);

    // Dá um tempo para o processo subir e a porta abrir.
    await new Promise((r) => setTimeout(r, 1500));
    const status = await verificarStatus(app);

    if (status.online) {
      return { ok: true, mensagem: `${app.nome} iniciado (PID ${status.pid}).`, pid: status.pid };
    }

    // O processo pode ter subido mas ainda não abriu a porta (ex.: Mestre do PC
    // que se auto-eleva). Não é erro — apenas avisa que não confirmou a porta.
    return {
      ok: true,
      mensagem: `${app.nome} disparado, mas a porta ${app.porta} ainda não respondeu.`,
      pid: null,
    };
  } catch (erro) {
    return { ok: false, mensagem: `Falha ao iniciar ${app.nome}: ${erro.message}` };
  }
}

/** Para um app, matando a árvore do processo que escuta na porta. */
export async function pararApp(app) {
  const status = await verificarStatus(app);
  if (!status.online) {
    return { ok: false, mensagem: `${app.nome} não está online.` };
  }

  const pid = status.pid;
  return new Promise((resolve) => {
    execFile(
      'taskkill.exe',
      ['/PID', String(pid), '/T', '/F'],
      { windowsHide: true, timeout: 15000 },
      (erro, stdout, stderr) => {
        if (erro) {
          // taskkill retorna código != 0 quando o processo já morreu ou quando
          // falta privilégio (processo elevado). Trata os dois como "não está mais".
          const msg = stderr || stdout || erro.message;
          if (/não foi possível|not found|não existe|Access is denied|Acesso negado/i.test(msg)) {
            return resolve({ ok: false, mensagem: `Não foi possível parar ${app.nome}: ${msg.trim()}` });
          }
          return resolve({ ok: true, mensagem: `${app.nome} parado.` });
        }
        processos.delete(app.slug);
        resolve({ ok: true, mensagem: `${app.nome} parado (PID ${pid}).` });
      }
    );
  });
}

/**
 * Executa uma ação (iniciar/parar) e registra tudo no banco: status + histórico.
 * É o ponto único de entrada usado pelas rotas da API.
 */
export async function executarAcao({ app, acao, origem = 'ui', usuarioId = null }) {
  const inicio = Date.now();
  let resultado;

  if (acao === 'iniciar') {
    resultado = await iniciarApp(app);
  } else if (acao === 'parar') {
    resultado = await pararApp(app);
  } else {
    resultado = { ok: false, mensagem: `Ação desconhecida: ${acao}` };
  }

  const duracaoMs = Date.now() - inicio;
  const status = await verificarStatus(app);

  registrarStatus({
    appId: app.id,
    estado: status.online ? 'online' : 'offline',
    pid: status.pid,
    mensagem: resultado.ok ? null : resultado.mensagem,
  });

  registrarExecucao({
    appId: app.id,
    usuarioId,
    acao,
    origem,
    sucesso: resultado.ok,
    pid: status.pid,
    mensagem: resultado.mensagem,
    duracaoMs,
  });

  return { ...resultado, estado: status.online ? 'online' : 'offline', pid: status.pid };
}
