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

let estado = { apps: [], contagem: {}, rota: 'dashboard' };
let chat = { mensagens: [], enviando: false, modelos: [], modelo: localStorage.getItem('vd_ollama_modelo') || '' };

// ------------------------------------------------------------
// Dados
// ------------------------------------------------------------
async function carregar() {
  const [resApps, resAtiv] = await Promise.all([
    fetch('/api/apps').then((r) => r.json()),
    fetch('/api/atividade?limite=10').then((r) => r.json()),
  ]);
  estado.apps = resApps.apps;
  estado.contagem = resApps.contagem;
  estado.atividade = resAtiv.itens;
}

// ------------------------------------------------------------
// Componentes
// ------------------------------------------------------------
const badge = (est) =>
  `<span class="vd-status vd-status--${est}"><span class="dot"></span>${ESTADOS[est] ?? est}</span>`;

function cardApp(app) {
  const acao =
    app.estado === 'online'
      ? `<button class="vd-btn vd-btn--sm vd-btn--stop" data-acao="parar" data-slug="${esc(app.slug)}">■ Parar</button>`
      : app.estado === 'indisponivel'
        ? `<span class="vd-appcard__port">${esc(app.caminho.slice(0, 22))}…</span>`
        : `<button class="vd-btn vd-btn--sm vd-btn--start" data-acao="iniciar" data-slug="${esc(app.slug)}">▶ Iniciar</button>`;

  return `
    <article class="vd-appcard vd-appcard--${app.estado}" style="--app-color:${esc(app.cor ?? '#cc785c')}" data-slug="${esc(app.slug)}">
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
function telaDashboard() {
  const online = estado.contagem.online ?? 0;
  const atencao = (estado.contagem.erro ?? 0) + (estado.contagem.indisponivel ?? 0);
  const indisponiveis = estado.apps.filter((a) => a.estado === 'indisponivel');

  const alerta = indisponiveis.length
    ? `<div class="vd-alert vd-alert--warning">
         <span class="vd-alert__icon">⚠</span>
         <div class="vd-alert__body">
           <strong>${indisponiveis.length} app(s) com pasta não encontrada</strong>
           ${indisponiveis.map((a) => esc(a.nome)).join(', ')} — verifique se o drive está conectado.
         </div>
       </div>`
    : '';

  const atividade = estado.atividade?.length
    ? estado.atividade
        .map(
          (i) => `
        <div class="vd-lista__item">
          <div class="vd-lista__ico">${esc(i.app_icone ?? '•')}</div>
          <div class="vd-lista__txt"><strong>${esc(i.app_nome)}</strong> ${esc(i.acao)} · ${i.sucesso ? 'ok' : 'falhou'}</div>
          <div class="vd-lista__hora">${esc((i.criado_em ?? '').slice(11, 16))}</div>
        </div>`
        )
        .join('')
    : '<div class="vd-vazio">Nenhuma execução ainda. O histórico aparece aqui quando você iniciar ou parar um app.</div>';

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
        <div class="vd-metric__label">Automações</div>
        <div class="vd-metric__value">0</div>
        <div class="vd-metric__sub">nenhuma criada</div>
      </div>
    </div>

    <section class="vd-section">
      <div class="vd-section__head">
        <h2 class="vd-section__title">Seus aplicativos</h2>
      </div>
      <div class="vd-appgrid">${estado.apps.map(cardApp).join('')}</div>
    </section>

    <section class="vd-section">
      <div class="vd-section__head">
        <h2 class="vd-section__title">Atividade recente</h2>
      </div>
      <div class="vd-lista">${atividade}</div>
    </section>`;
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
          app.estado === 'online'
            ? `<button class="vd-btn vd-btn--stop" data-acao="parar" data-slug="${esc(app.slug)}">■ Parar</button>`
            : app.estado === 'indisponivel'
              ? ''
              : `<button class="vd-btn vd-btn--start" data-acao="iniciar" data-slug="${esc(app.slug)}">▶ Iniciar</button>`
        }
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
            <div class="vd-vazio">O app não está em execução. Os logs aparecem aqui quando ele sobe.</div>
          </div>
        </div>
        <div class="vd-panel">
          <div class="vd-panel__head"><h3 class="vd-panel__title">Integrações com outros apps</h3></div>
          <div class="vd-panel__body"><div class="vd-vazio">Nenhuma integração configurada ainda.</div></div>
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
              <dt>Verificado</dt><dd>${esc(app.verificado_em ?? '—')}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>`;
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
      <p>Pergunte sobre seus apps ou use comandos como <code>listar apps</code>, <code>status mestre-do-pc</code> ou <code>ajuda</code>.</p>
    </div>`;
  }
  return chat.mensagens
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
          <span class="vd-chat__badge">Ollama</span>
        </div>
      </div>
      <div class="vd-chat__messages" id="chat-messages">${renderizarMensagens()}</div>
      <form class="vd-chat__input" id="chat-form">
        <input type="text" id="chat-texto" class="vd-chat__field" placeholder="Digite uma mensagem ou comando…" autocomplete="off" ${chat.enviando ? 'disabled' : ''}>
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

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: texto.trim(), modelo }),
    });
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.erro || 'Erro no servidor');
    chat.mensagens.push({ papel: 'assistant', conteudo: dados.resposta, criado_em: new Date().toISOString() });
  } catch (erro) {
    chat.mensagens.push({ papel: 'assistant', conteudo: `Erro: ${erro.message}`, criado_em: new Date().toISOString() });
  } finally {
    chat.enviando = false;
    renderizarTelaAgente();
  }
}

function renderizarTelaAgente() {
  $('#conteudo').innerHTML = telaAgente();
  const msgs = $('#chat-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  const input = $('#chat-texto');
  if (input && !chat.enviando) {
    input.focus();
    input.value = '';
  }
}

// ------------------------------------------------------------
// Navegação
// ------------------------------------------------------------
function montarMenuApps() {
  $('#nav-apps').innerHTML = estado.apps
    .map(
      (a) => `
      <a class="vd-navitem ${a.estado === 'indisponivel' ? 'vd-navitem--muted' : ''}" data-rota="app:${esc(a.slug)}">
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
  } else if (rota === 'agente') {
    $('#titulo').textContent = 'Agente';
    $('#subtitulo').textContent = '· Chat e comandos CLI';
    renderizarTelaAgente();
  } else {
    const titulos = {
      automacoes: ['Automações', 'Regras "quando X acontecer, faça Y". Chega na Fase 3 do plano.'],
      integracoes: ['Integrações', 'Ligações e redirecionamentos entre os seus apps. Chega depois do MVP.'],
      logs: ['Logs', 'Auditoria completa de execuções e ações do agente. Chega na Fase 3.'],
    };
    const [titulo, texto] = titulos[rota] ?? ['—', ''];
    $('#titulo').textContent = titulo;
    $('#subtitulo').textContent = '';
    $('#conteudo').innerHTML = telaEmBreve(titulo, texto);
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

document.addEventListener('change', (ev) => {
  if (ev.target?.id === 'chat-modelo') {
    chat.modelo = ev.target.value;
    localStorage.setItem('vd_ollama_modelo', chat.modelo);
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
