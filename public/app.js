// Vitrine de Apps — interface.
// Busca dados reais da API em /api e monta dashboard e seções dos apps.

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ESTADOS = {
  online: 'online',
  offline: 'offline',
  iniciando: 'iniciando',
  erro: 'erro',
  indisponivel: 'indisponível',
};

let estado = { apps: [], contagem: {}, rota: 'dashboard', ligacoes: [], busca: '', filtro: 'todos' };
let chat = { mensagens: [], enviando: false, modelos: [], modelo: localStorage.getItem('vd_ollama_modelo') || '', mestreMcp: null };

// ------------------------------------------------------------
// Dados
// ------------------------------------------------------------
async function carregar() {
  // live=1: o servidor checa as portas de verdade (um netstat) antes de
  // responder, em vez de ler o último estado gravado no banco.
  const [resApps, resAtiv, resLig] = await Promise.all([
    fetch('/api/apps?live=1').then((r) => r.json()),
    fetch('/api/atividade?limite=40').then((r) => r.json()),
    fetch('/api/ligacoes').then((r) => r.json()),
  ]);
  estado.apps = resApps.apps;
  estado.contagem = resApps.contagem;
  estado.atividade = resAtiv.itens;
  estado.ligacoes = resLig.ligacoes ?? [];
}

function podeControlar(app) {
  return Boolean(app.comando_start) && app.estado !== 'indisponivel' && app.status_instalado !== 'nao_instalado';
}

function appsFiltrados() {
  const q = estado.busca.trim().toLowerCase();
  return estado.apps.filter((a) => {
    if (estado.filtro === 'online' && a.estado !== 'online') return false;
    if (estado.filtro === 'offline' && a.estado !== 'offline') return false;
    if (estado.filtro === 'atencao' && a.estado !== 'erro' && a.estado !== 'indisponivel') return false;
    if (!q) return true;
    return [a.nome, a.slug, a.stack, a.descricao].join(' ').toLowerCase().includes(q);
  });
}

// ------------------------------------------------------------
// Componentes
// ------------------------------------------------------------
const badge = (est) =>
  `<span class="vd-status vd-status--${est}"><span class="dot"></span>${ESTADOS[est] ?? est}</span>`;

function cardApp(app) {
  const instalado = app.status_instalado !== 'nao_instalado';
  const acao = !podeControlar(app)
    ? `<span class="vd-appcard__port">${app.estado === 'indisponivel' || !instalado ? 'pasta ausente' : 'sem start'}</span>`
    : app.estado === 'online'
      ? `<button class="vd-btn vd-btn--sm vd-btn--stop" data-acao="parar" data-slug="${esc(app.slug)}">■ Parar</button>`
      : `<button class="vd-btn vd-btn--sm vd-btn--start" data-acao="iniciar" data-slug="${esc(app.slug)}">▶ Iniciar</button>`;

  return `
    <article class="vd-appcard vd-appcard--${esc(app.estado)} ${instalado ? '' : 'vd-appcard--indisponivel'}" style="--app-color:${esc(app.cor ?? '#cc785c')}" data-slug="${esc(app.slug)}">
      <div class="vd-appcard__head">
        <div class="vd-appcard__icon">${esc(app.icone ?? '📦')}</div>
        <div class="vd-appcard__titles">
          <h3 class="vd-appcard__name">${esc(app.nome)}</h3>
          <p class="vd-appcard__stack">${esc(app.stack ?? '')}</p>
        </div>
      </div>
      <p class="vd-appcard__desc">${esc(app.descricao ?? '')}</p>
      <div class="vd-appcard__foot">
        ${badge(app.estado)}
        ${acao}
      </div>
    </article>`;
}

// ------------------------------------------------------------
// Telas
// ------------------------------------------------------------
function gradeApps() {
  const lista = appsFiltrados();
  if (!lista.length) return '<div class="vd-vazio">Nenhum app com esse filtro.</div>';
  return lista.map(cardApp).join('');
}

function telaDashboard() {
  const online = estado.contagem.online ?? 0;
  const atencao = (estado.contagem.erro ?? 0) + (estado.contagem.indisponivel ?? 0);
  const indisponiveis = estado.apps.filter((a) => a.estado === 'indisponivel');

  const alerta = indisponiveis.length
    ? `<div class="vd-alert vd-alert--warning">
         <span class="vd-alert__icon">⚠</span>
         <div class="vd-alert__body">
           <strong>${indisponiveis.length} app(s) sem pasta nesta máquina</strong>
           ${indisponiveis.map((a) => esc(a.nome)).join(', ')} — o caminho do catálogo não existe no disco.
         </div>
       </div>`
    : '';

  const atividade = htmlAtividade((estado.atividade ?? []).slice(0, 8));

  return `
    ${alerta}
    <div class="vd-metrics">
      <div class="vd-metric">
        <div class="vd-metric__label">Aplicativos</div>
        <div class="vd-metric__value">${estado.apps.length}</div>
        <div class="vd-metric__sub">catalogados</div>
      </div>
      <div class="vd-metric">
        <div class="vd-metric__label">Em execução</div>
        <div class="vd-metric__value ${online ? 'vd-metric__value--online' : ''}">${online}</div>
        <div class="vd-metric__sub">${online ? 'rodando agora' : 'nenhum no ar'}</div>
      </div>
      <div class="vd-metric">
        <div class="vd-metric__label">Precisam de atenção</div>
        <div class="vd-metric__value ${atencao ? 'vd-metric__value--warn' : ''}">${atencao}</div>
        <div class="vd-metric__sub">${estado.contagem.erro ?? 0} erro · ${estado.contagem.indisponivel ?? 0} indisponível</div>
      </div>
      <div class="vd-metric">
        <div class="vd-metric__label">Ligações</div>
        <div class="vd-metric__value">${estado.ligacoes.length}</div>
        <div class="vd-metric__sub">entre os apps daqui</div>
      </div>
    </div>

    <section class="vd-section">
      <div class="vd-section__head">
        <h2 class="vd-section__title">Seus aplicativos</h2>
        <div class="vd-toolbar">
          <input id="busca-apps" class="vd-search" type="search" placeholder="Buscar nome ou stack…" value="${esc(estado.busca)}" autocomplete="off">
          <div class="vd-chips">
            ${['todos', 'online', 'offline', 'atencao']
              .map((f) => {
                const rotulo = { todos: 'Todos', online: 'No ar', offline: 'Parados', atencao: 'Atenção' }[f];
                return `<button type="button" class="vd-chip ${estado.filtro === f ? 'vd-chip--on' : ''}" data-filtro="${f}">${rotulo}</button>`;
              })
              .join('')}
          </div>
        </div>
      </div>
      <div class="vd-appgrid" id="grade-apps">${gradeApps()}</div>
    </section>

    <section class="vd-section">
      <div class="vd-section__head">
        <h2 class="vd-section__title">Atividade recente</h2>
      </div>
      <div class="vd-lista">${atividade}</div>
    </section>`;
}

async function carregarLogs(slug) {
  try {
    const dados = await fetch(`/api/apps/${encodeURIComponent(slug)}/logs`).then((r) => r.json());
    // O usuário pode ter navegado já — só pinta o painel da tela certa.
    if (estado.rota !== `app:${slug}`) return;
    const alvo = document.getElementById('app-logs');
    if (!alvo) return;
    if (dados.mensagem) {
      alvo.innerHTML = `<div class="vd-vazio">${esc(dados.mensagem)}</div>`;
      return;
    }
    const itens = dados.itens ?? [];
    alvo.innerHTML = itens.length
      ? `<pre class="vd-applog__pre">${esc(itens.join('\n'))}</pre>`
      : '<div class="vd-vazio">Log vazio até agora.</div>';
  } catch {
    const alvo = document.getElementById('app-logs');
    if (alvo) alvo.innerHTML = '<div class="vd-vazio">Falha ao carregar o log.</div>';
  }
}

function telaApp(slug) {
  const app = estado.apps.find((a) => a.slug === slug);
  if (!app) return '<div class="vd-placeholder">App não encontrado.</div>';

  return `
    <div class="vd-apphero" style="--app-color:${esc(app.cor ?? '#cc785c')}">
      <div class="vd-apphero__icon">${esc(app.icone ?? '📦')}</div>
      <div class="vd-apphero__info">
        <h1 class="vd-apphero__name">${esc(app.nome)} ${badge(app.estado)}</h1>
        <p class="vd-apphero__desc">${esc(app.descricao ?? '')}</p>
        <div class="vd-apphero__meta">
          <span>${esc(app.stack ?? '')}</span>
          ${app.porta ? `<span>porta ${app.porta}</span>` : ''}
          ${app.pid ? `<span>PID ${app.pid}</span>` : ''}
        </div>
      </div>
      <div class="vd-apphero__actions">
        ${app.url_local ? `<a class="vd-btn vd-btn--secondary" href="${esc(app.url_local)}" target="_blank" rel="noopener">Abrir app</a>` : ''}
        ${
          !podeControlar(app)
            ? ''
            : app.estado === 'online'
              ? `<button class="vd-btn vd-btn--stop" data-acao="parar" data-slug="${esc(app.slug)}">■ Parar</button>`
              : `<button class="vd-btn vd-btn--start" data-acao="iniciar" data-slug="${esc(app.slug)}">▶ Iniciar</button>`
        }
        ${app.estado !== 'indisponivel' && app.status_instalado !== 'nao_instalado' ? `<button class="vd-btn vd-btn--secondary" data-acao="pasta" data-slug="${esc(app.slug)}">Abrir pasta</button>` : ''}
      </div>
    </div>

    ${
      app.mensagem
        ? `<div class="vd-alert vd-alert--error"><span class="vd-alert__icon">✕</span><div class="vd-alert__body"><strong>${ESTADOS[app.estado]}</strong>${esc(app.mensagem)}</div></div>`
        : ''
    }

    <div class="vd-cols">
      <div>
        <div class="vd-panel">
          <div class="vd-panel__head"><h3 class="vd-panel__title">Saída do processo</h3></div>
          <div class="vd-panel__body">
            <div class="vd-applog" id="app-logs"><div class="vd-vazio">Consultando log…</div></div>
          </div>
        </div>
        <div class="vd-panel">
          <div class="vd-panel__head"><h3 class="vd-panel__title">Integrações com outros apps</h3></div>
          <div class="vd-panel__body">${htmlLigacoes(ligacoesDo(app.slug))}</div>
        </div>
      </div>

      <div>
        <div class="vd-panel">
          <div class="vd-panel__head"><h3 class="vd-panel__title">Informações</h3></div>
          <div class="vd-panel__body">
            <dl class="vd-kv">
              <dt>Pasta</dt><dd>${esc(app.caminho)}</dd>
              <dt>Repositório</dt><dd>${app.repositorio ? `<a href="${esc(app.repositorio)}" target="_blank" rel="noopener">${esc(app.repositorio.replace('https://github.com/', ''))}</a>` : '—'}</dd>
              <dt>Tipo</dt><dd>${esc(app.tipo)}</dd>
              <dt>Porta</dt><dd>${app.porta ?? '—'}</dd>
              <dt>Estado</dt><dd>${ESTADOS[app.estado] ?? app.estado}</dd>
              <dt>Instalação</dt><dd>${esc(app.status_instalado_nome ?? '—')}</dd>
              <dt>Verificado</dt><dd>${esc(app.verificado_em ?? '—')}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>`;
}

function ligacoesDo(slug) {
  return estado.ligacoes.filter((l) => l.origem === slug || l.destino === slug);
}

function htmlLigacoes(lista) {
  if (!lista.length) return '<div class="vd-vazio">Nenhuma ligação cadastrada para este app.</div>';
  return `<div class="vd-lista">${lista
    .map(
      (l) => `
      <div class="vd-lista__item">
        <div class="vd-lista__ico">🔗</div>
        <div class="vd-lista__txt"><strong>${esc(l.nome)}</strong> ${esc(l.origem)} → ${esc(l.destino)}<br><span class="vd-lista__sub">${esc(l.descricao)}</span></div>
        <div class="vd-lista__hora">${esc(l.tipo)}</div>
      </div>`
    )
    .join('')}</div>`;
}

function htmlAtividade(itens) {
  if (!itens?.length) {
    return '<div class="vd-vazio">Nenhuma execução ainda. O histórico aparece aqui quando você iniciar ou parar um app.</div>';
  }
  return itens
    .map(
      (i) => `
        <div class="vd-lista__item">
          <div class="vd-lista__ico">${esc(i.app_icone ?? '•')}</div>
          <div class="vd-lista__txt"><strong>${esc(i.app_nome)}</strong> ${esc(i.acao)} · ${i.sucesso ? 'ok' : 'falhou'}${i.mensagem ? `<br><span class="vd-lista__sub">${esc(i.mensagem)}</span>` : ''}</div>
          <div class="vd-lista__hora">${esc((i.criado_em ?? '').replace('T', ' ').slice(0, 16))}</div>
        </div>`
    )
    .join('');
}

function telaEmBreve(titulo, texto) {
  return `<div class="vd-placeholder"><strong>${esc(titulo)}</strong><br><br>${esc(texto)}</div>`;
}

// ------------------------------------------------------------
// Agente / Chat
// ------------------------------------------------------------
function renderizarMensagens() {
  if (!chat.mensagens.length) {
    return `<div class="vd-chat__empty">
      <div class="vd-chat__empty-icon">🤖</div>
      <strong>Agente da Vitrine</strong>
      <p>Use <code>refatorar prompt: &lt;texto&gt;</code> para reorganizar e detalhar uma ideia, ou acesse as ferramentas do Mestre.</p>
    </div>`;
  }
  let html = chat.mensagens
    .map(
      (m) => `
    <div class="vd-chat__msg vd-chat__msg--${m.papel}">
      <div class="vd-chat__bubble">
        <div class="vd-chat__meta">${m.papel === 'user' ? 'Você' : 'Agente'} · ${esc((m.criado_em ?? '').slice(11, 16))}</div>
        <div class="vd-chat__text">${esc(m.conteudo).replace(/\n/g, '<br>')}</div>
      </div>
    </div>`
    )
    .join('');

  if (chat.enviando) {
    html += `
    <div class="vd-chat__msg vd-chat__msg--assistant">
      <div class="vd-chat__bubble vd-chat__bubble--typing">
        <div class="vd-chat__meta">Agente</div>
        <div class="vd-chat__typing"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  }
  return html;
}

function limparChat() {
  chat.mensagens = [];
  // Reinicia também a conversa mantida no servidor do Dify, se houver.
  fetch('/api/dify/conversa/limpar', { method: 'POST' }).catch(() => {});
  renderizarTelaAgente();
}

function telaAgente() {
  const opcoesModelos = chat.modelos.length
    ? chat.modelos.map((m) => `<option value="${esc(m.name)}" ${chat.modelo === m.name ? 'selected' : ''}>${esc(m.name)}</option>`).join('')
    : `<option value="">Carregando modelos…</option>`;

  return `
    <div class="vd-chat">
      <div class="vd-chat__header">
        <div>
          <h2 class="vd-chat__title">Agente da Vitrine</h2>
          <span class="vd-chat__subtitle">Chat e comandos CLI</span>
        </div>
        <div class="vd-chat__controls">
          <select id="chat-modelo" class="vd-chat__select" title="Modelo Ollama">
            ${opcoesModelos}
          </select>
          <button type="button" id="chat-limpar" class="vd-btn vd-btn--sm vd-btn--secondary" title="Limpar conversa">🗑</button>
          <span class="vd-chat__badge">Ollama</span>
          <button type="button" id="chat-refatorar-prompt" class="vd-chat__badge" title="Reorganizar e detalhar um prompt">
            ✨ Refatorar prompt
          </button>
          <button type="button" id="chat-mestre-tools" class="vd-chat__badge ${chat.mestreMcp?.ok ? 'vd-chat__badge--online' : 'vd-chat__badge--offline'}" title="Listar ferramentas MCP do Mestre">
            Mestre MCP · ${chat.mestreMcp?.ok ? chat.mestreMcp.ferramentas : 'offline'}
          </button>
        </div>
      </div>
      <div class="vd-chat__messages" id="chat-messages">${renderizarMensagens()}</div>
      <form class="vd-chat__input" id="chat-form">
        <textarea id="chat-texto" class="vd-chat__field" rows="2" maxlength="16000" placeholder="Digite ou cole um prompt… (Shift+Enter cria uma linha)" ${chat.enviando ? 'disabled' : ''}></textarea>
        <button type="submit" class="vd-btn vd-btn--primary" ${chat.enviando ? 'disabled' : ''}>${chat.enviando ? '…' : 'Enviar'}</button>
      </form>
    </div>`;
}

async function carregarChat() {
  try {
    const [resHist, resModelos] = await Promise.all([
      fetch('/api/chat/historico?limite=100'),
      fetch('/api/ollama/modelos'),
    ]);
    const dadosHist = await resHist.json();
    const dadosModelos = await resModelos.json();
    chat.mensagens = dadosHist.mensagens || [];
    chat.modelos = dadosModelos.modelos || [];
    if (!chat.modelo && dadosModelos.modeloPadrao) {
      chat.modelo = dadosModelos.modeloPadrao;
    }

    // O Mestre pode demorar alguns segundos para iniciar seus bridges. O
    // status atualiza o selo depois, sem bloquear a abertura da Vitrine.
    void fetch('/api/mestre-mcp/status')
      .then((res) => res.json())
      .then((status) => {
        chat.mestreMcp = status;
        if (estado.rota === 'agente') renderizarTelaAgente();
      })
      .catch(() => {
        chat.mestreMcp = { ok: false };
        if (estado.rota === 'agente') renderizarTelaAgente();
      });
  } catch (erro) {
    console.error('Falha ao carregar chat:', erro);
  }
}

async function enviarMensagem(texto) {
  if (!texto.trim() || chat.enviando) return;
  chat.enviando = true;
  const modelo = chat.modelo || '';

  // Otimisticamente adiciona a mensagem do usuário.
  chat.mensagens.push({ papel: 'user', conteudo: texto.trim(), criado_em: new Date().toISOString() });
  renderizarTelaAgente();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: texto.trim(), modelo }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.erro || 'Erro no servidor');
    chat.mensagens.push({ papel: 'assistant', conteudo: dados.resposta, criado_em: new Date().toISOString() });
  } catch (erro) {
    clearTimeout(timeoutId);
    const msg = erro.name === 'AbortError' ? 'Tempo limite esgotado (2 min). Tente outro modelo ou verifique a conexão com o Ollama.' : erro.message;
    chat.mensagens.push({ papel: 'assistant', conteudo: `Erro: ${msg}`, criado_em: new Date().toISOString() });
  } finally {
    chat.enviando = false;
    renderizarTelaAgente();
  }
}

function renderizarTelaAgente() {
  const rascunho = $('#chat-texto')?.value ?? '';
  $('#conteudo').innerHTML = telaAgente();
  const msgs = $('#chat-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  const input = $('#chat-texto');
  if (input && !chat.enviando) {
    input.focus();
    input.value = rascunho;
  }
}

// ------------------------------------------------------------
// Navegação
// ------------------------------------------------------------
function montarMenuApps() {
  $('#nav-apps').innerHTML = estado.apps
    .map(
      (a) => `
      <a class="vd-navitem ${a.estado === 'indisponivel' || a.status_instalado === 'nao_instalado' ? 'vd-navitem--muted' : ''}" data-rota="app:${esc(a.slug)}">
        <span class="vd-navitem__icon">${esc(a.icone ?? '📦')}</span>
        <span class="vd-navitem__label">${esc(a.nome)}</span>
        <span class="vd-navitem__dot vd-navitem__dot--${a.estado}"></span>
      </a>`
    )
    .join('');
}

function navegar(rota) {
  estado.rota = rota;

  document.querySelectorAll('.vd-navitem').forEach((el) => {
    el.classList.toggle('vd-navitem--active', el.dataset.rota === rota);
  });

  if (rota === 'dashboard') {
    $('#titulo').textContent = 'Dashboard';
    const online = estado.contagem.online ?? 0;
    $('#subtitulo').textContent = `· ${estado.apps.length} aplicativos · ${online} em execução`;
    $('#conteudo').innerHTML = telaDashboard();
  } else if (rota.startsWith('app:')) {
    const slug = rota.slice(4);
    const app = estado.apps.find((a) => a.slug === slug);
    $('#titulo').textContent = app?.nome ?? 'Aplicativo';
    $('#subtitulo').textContent = '· Aplicativos';
    $('#conteudo').innerHTML = telaApp(slug);
    carregarLogs(slug);
  } else if (rota === 'agente') {
    $('#titulo').textContent = 'Agente';
    $('#subtitulo').textContent = '· Chat e comandos CLI';
    renderizarTelaAgente();
  } else if (rota === 'integracoes') {
    $('#titulo').textContent = 'Integrações';
    $('#subtitulo').textContent = `· ${estado.ligacoes.length} ligações`;
    $('#conteudo').innerHTML = `
      <p class="vd-lead">Quem inicia quem, nesta máquina. O arquivo é <code>server/ligacoes.json</code>.</p>
      ${htmlLigacoes(estado.ligacoes)}`;
  } else if (rota === 'logs') {
    $('#titulo').textContent = 'Logs';
    $('#subtitulo').textContent = '· execuções registradas';
    $('#conteudo').innerHTML = `<div class="vd-lista">${htmlAtividade(estado.atividade)}</div>`;
  } else if (rota === 'automacoes') {
    $('#titulo').textContent = 'Automações';
    $('#subtitulo').textContent = '';
    $('#conteudo').innerHTML = telaEmBreve(
      'Automações',
      'Regras "quando X acontecer, faça Y" ainda não rodam. As ligações atuais estão em Integrações.'
    );
  } else {
    $('#titulo').textContent = '—';
    $('#subtitulo').textContent = '';
    $('#conteudo').innerHTML = telaEmBreve('—', '');
  }
}

async function executarAcaoApp(acao, slug) {
  const app = estado.apps.find((a) => a.slug === slug);
  if (!app) return;

  const botao = document.querySelector(`[data-acao="${acao}"][data-slug="${slug}"]`);
  if (botao) {
    botao.disabled = true;
    botao.textContent = '…';
  }

  try {
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/${acao}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const dados = await res.json();

    if (!res.ok) {
      alert(dados.erro || dados.mensagem || `Falha ao ${acao} ${app.nome}.`);
    }
  } catch (erro) {
    alert(`Erro ao ${acao} ${app.nome}: ${erro.message}`);
  } finally {
    // Recarrega o catálogo para refletir o novo estado.
    await carregar();
    montarMenuApps();
    navegar(estado.rota);
  }
}

document.addEventListener('click', (ev) => {
  // Botões de iniciar/parar têm prioridade sobre a navegação do card.
  const botao = ev.target.closest('[data-acao]');
  if (botao) {
    ev.preventDefault();
    ev.stopPropagation();
    executarAcaoApp(botao.dataset.acao, botao.dataset.slug);
    return;
  }

  const chip = ev.target.closest('[data-filtro]');
  if (chip) {
    estado.filtro = chip.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((el) => el.classList.toggle('vd-chip--on', el.dataset.filtro === estado.filtro));
    const grade = document.getElementById('grade-apps');
    if (grade) grade.innerHTML = gradeApps();
    return;
  }

  const item = ev.target.closest('.vd-navitem');
  if (item?.dataset.rota) {
    navegar(item.dataset.rota);
    return;
  }
  const card = ev.target.closest('.vd-appcard');
  if (card?.dataset.slug) navegar(`app:${card.dataset.slug}`);
});

document.addEventListener('submit', (ev) => {
  if (ev.target?.id === 'chat-form') {
    ev.preventDefault();
    const input = $('#chat-texto');
    if (input) enviarMensagem(input.value);
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.target?.id === 'chat-texto' && ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    ev.target.form?.requestSubmit();
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target?.id !== 'busca-apps') return;
  estado.busca = ev.target.value;
  const grade = document.getElementById('grade-apps');
  if (grade) grade.innerHTML = gradeApps();
});

document.addEventListener('change', (ev) => {
  if (ev.target?.id === 'chat-modelo') {
    chat.modelo = ev.target.value;
    localStorage.setItem('vd_ollama_modelo', chat.modelo);
  }
});

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('#chat-limpar');
  if (btn) {
    ev.preventDefault();
    limparChat();
  }
  const mestre = ev.target.closest('#chat-mestre-tools');
  if (mestre) {
    ev.preventDefault();
    const input = $('#chat-texto');
    if (input) { input.value = 'mestre ferramentas'; input.focus(); }
  }
  const refatorar = ev.target.closest('#chat-refatorar-prompt');
  if (refatorar) {
    ev.preventDefault();
    const input = $('#chat-texto');
    if (input) { input.value = 'refatorar prompt: '; input.focus(); }
  }
});

$('#btn-atualizar').addEventListener('click', async () => {
  await carregar();
  montarMenuApps();
  navegar(estado.rota);
});

// ------------------------------------------------------------
// Início
// ------------------------------------------------------------
try {
  await carregar();
  await carregarChat();
  montarMenuApps();
  navegar('dashboard');

  const saude = await fetch('/api/saude').then((r) => r.json());
  $('#rodape-status').textContent = `${saude.dominio} · :${saude.porta}`;
} catch (erro) {
  $('#conteudo').innerHTML = `<div class="vd-alert vd-alert--error"><span class="vd-alert__icon">✕</span><div class="vd-alert__body"><strong>Falha ao carregar</strong>${esc(erro.message)}</div></div>`;
}
