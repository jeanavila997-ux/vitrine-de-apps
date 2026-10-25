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

/**
 * Adapta o comando às regras do spawn no Windows:
 * - 'node' → o MESMO binário deste processo (process.execPath): não depende
 *   do PATH herdado, que varia quando o servidor é lançado por shell/launcher.
 * - '*.cmd'/*.bat → spawn sem shell NÃO executa (CreateProcess não interpreta
 *   PATHEXT), entao sobe via cmd.exe /d /s /c. Os argumentos vêm da allowlist
 *   estática e de cams do registro — superfície controlada, sem entrada livre.
 */
function adaptarAoWindows(comando) {
  if (comando.executavel === 'node') {
    return { ...comando, executavel: process.execPath };
  }
  // No Windows, npm/pnpm/npx/yarn são scripts .cmd. O spawn sem shell
  // (CreateProcess) não lê PATHEXT, então "npm" sozinho devolve ENOENT.
  // Os argumentos continuam só os da allowlist — nada digitado na UI entra aqui.
  const viaCmd = new Set(['npm', 'npx', 'pnpm', 'yarn']);
  if (viaCmd.has(comando.executavel) || /\.(cmd|bat)$/i.test(comando.executavel)) {
    return {
      ...comando,
      executavel: 'cmd.exe',
      argumentos: ['/d', '/s', '/c', comando.executavel, ...comando.argumentos],
    };
  }
  return comando;
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
 * Checa várias portas com UMA única chamada ao netstat (em vez de um
 * PowerShell por porta — que custa ~1 s cada). Retorna Map: porta -> pid.
 * Porta sem ouvinte não entra no mapa.
 */
export async function pidsDasPortas(portas) {
  const alvo = new Set(portas.filter(Number.isInteger));
  const mapa = new Map();
  if (!alvo.size) return mapa;

  const saida = await new Promise((resolve) => {
    execFile(
      'netstat.exe',
      ['-ano', '-p', 'tcp'],
      { windowsHide: true, timeout: 10000 },
      (erro, stdout) => resolve(erro ? '' : String(stdout))
    );
  });

  // Linha típica: "  TCP    127.0.0.1:4400    0.0.0.0:0    LISTENING       19756"
  // O endereço local pode vir em IPv6: Vite (v6+) resolve "localhost" para ::1
  // no Windows e escuta SÓ em [::1] — sem aceitar [::1] aqui, um app no ar
  // aparecia como offline no catálogo.
  const re = /(?:0\.0\.0\.0|127\.0\.0\.1|\[::1?\]|\[[0-9a-f:.]+\]|\*):(\d+)\s+\S+\s+LISTENING\s+(\d+)/gi;
  for (const m of saida.matchAll(re)) {
    const porta = Number(m[1]);
    const pid = Number(m[2]);
    if (alvo.has(porta) && !mapa.has(porta) && pid > 0 && pid !== 4) mapa.set(porta, pid);
  }
  return mapa;
}

/**
 * Status de vários apps de uma vez (usado por GET /api/apps?live=1).
 * Porta resolvida em lote; apps sem porta caem no processo lançado pela
 * própria Vitrine, como em verificarStatus.
 */
export async function verificarVarios(apps) {
  const mapa = await pidsDasPortas(apps.map((a) => a.porta).filter(Boolean));
  return apps.map((app) => {
    if (app.porta) {
      const pid = mapa.get(app.porta) ?? null;
      // PID 4 (System) = artefato do HTTP.sys; cai no pid_file quando houver.
      return { slug: app.slug, online: Boolean(pid && pid !== 4), pid: pid === 4 ? null : pid };
    }
    const proc = processos.get(app.slug);
    const vivo = proc && proc.exitCode === null;
    return { slug: app.slug, online: Boolean(vivo), pid: vivo ? proc.pid : null };
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
  const comandoSpawn = resolverComando(app);
  if (!comandoSpawn) {
    return { ok: false, mensagem: `Sem comando de start registrado para "${app.slug}".` };
  }

  // Pasta tem que existir: o cwd do spawn depende dela. Spawn com cwd
  // inexistente falha de forma assíncrona (ENOENT) e sem esta guarda o app
  // receberia "iniciado" falso quando a porta estiver ocupada por outro
  // processo qualquer que escute lá.
  if (!fs.existsSync(app.caminho)) {
    return {
      ok: false,
      mensagem: `${app.nome} está indisponível: a pasta ${app.caminho} não existe nesta máquina.`,
    };
  }

  // Já está no ar?
  const atual = await verificarStatus(app);
  if (atual.online) {
    return { ok: false, mensagem: `${app.nome} já está online (PID ${atual.pid}).` };
  }

  // O 'error' do spawn é assíncrono e não é capturado pelo try/catch — sem
  // listener ele derruba o processo Node inteiro (unhandled 'error').
  // Guardamos o motivo para diferenciar "spawn falhou" de "porta não abriu".
  let erroSpawn = null;

  try {
    const comando = adaptarAoWindows(comandoSpawn);

    // Saída do app vai para data/logs/<slug>.log — painel "Saída do processo"
    // e diagnóstico pós-morte (com stdio 'ignore' um crash fica invisível).
    const dirLog = path.join(ROOT, 'data', 'logs');
    fs.mkdirSync(dirLog, { recursive: true });
    const fdLog = fs.openSync(path.join(dirLog, `${app.slug}.log`), 'a');
    fs.writeSync(fdLog, `\n[${new Date().toISOString()}] iniciar via vitrine: ${comando.executavel} ${comando.argumentos.join(' ')}\n`);

    const filho = spawn(comando.executavel, comando.argumentos, {
      cwd: app.caminho,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', fdLog, fdLog],
      // Ambiente sanitizado: o processo da Vitrine herdou PORT/.env próprios,
      // e apps child (ex.: chat-ia) leem o MESMO nome de variável — herança
      // crua faz o filho tentar a porta da Vitrine e morrer de EADDRINUSE.
      // A porta certa é a declarada no catálogo do app; sem porta, remove-se
      // a variável para o app usar o default dele.
      env: (() => {
        const env = { ...process.env };
        if (app.porta) env.PORT = String(app.porta);
        else delete env.PORT;
        return env;
      })(),
    });

    filho.on('error', (erro) => {
      console.error(`[process-manager] Falha ao spawnar ${app.slug}:`, erro.message);
      erroSpawn = erro;
    });

    filho.on('exit', (codigo, sinal) => {
      fs.appendFile(path.join(dirLog, `${app.slug}.log`), `[${new Date().toISOString()}] processo saiu (code=${codigo}, signal=${sinal ?? 'none'})\n`, () => {});
      processos.delete(app.slug);
    });

    // O fd é duplicado para o filho — fechamos a cópia do pai imediatamente.
    fs.closeSync(fdLog);

    filho.unref();
    processos.set(app.slug, filho);

    // Dá um tempo para o processo subir e a porta abrir. É suficiente para
    // ENOENT (cwd/executável inexistente) chegar no listener acima.
    await new Promise((r) => setTimeout(r, 1500));

    if (erroSpawn) {
      processos.delete(app.slug);
      // Se a porta já é ocupada por outrem, dizer isso evita o "iniciado"
      // falso: a vitrine NÃO é quem colocou o app no ar.
      const outro = app.porta ? await pidDaPorta(app.porta) : null;
      return {
        ok: false,
        mensagem: outro
          ? `${app.nome}: falha ao spawnar o comando (${erroSpawn.code ?? erroSpawn.message}) e a porta ${app.porta} já é ocupada pelo PID ${outro} — o app pode estar no ar por fora da Vitrine.`
          : `Falha ao iniciar ${app.nome}: ${erroSpawn.message}`,
      };
    }

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
  // Sem comando de start a vitrine não é dona do processo. A própria vitrine
  // escuta na 4400: um "Parar" pelo PID da porta mataria este servidor.
  if (!app.comando_start) {
    return {
      ok: false,
      mensagem: `${app.nome} não tem comando de start. A vitrine não para esse processo.`,
    };
  }

  const status = await verificarStatus(app);
  if (!status.online) {
    return { ok: false, mensagem: `${app.nome} não está online.` };
  }

  const pid = status.pid;
  if (pid === process.pid) {
    return { ok: false, mensagem: 'Recusado: esse PID é o próprio servidor da vitrine.' };
  }
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

  // Guarda: pasta inexistente = app indisponível NESTA máquina. Sem ela, um
  // "iniciar" falharia no spawn e ainda sobrescreveria o estado
  // 'indisponivel' por 'offline' (o estado só existe enquanto a pasta existe).
  if (!fs.existsSync(app.caminho)) {
    const mensagem = `${app.nome} está indisponível nesta máquina (pasta não encontrada: ${app.caminho}).`;
    // Auditoria: a tentativa entra no histórico mesmo recusada (o teste
    // agente-controle depende disso), mas o app_status NÃO é tocado —
    // "indisponivel" significa pasta inexistente, não offline.
    registrarExecucao({
      appId: app.id,
      usuarioId,
      acao,
      origem,
      sucesso: false,
      mensagem,
      duracaoMs: Date.now() - inicio,
    });
    return {
      ok: false,
      mensagem,
      estado: app.estado ?? 'indisponivel',
      pid: app.pid ?? null,
    };
  }

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
