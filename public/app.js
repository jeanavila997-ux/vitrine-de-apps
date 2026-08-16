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
      ? `<button class="vd-btn vd-btn--sm vd-btn--stop" disabled>■ Parar</button>`
      : app.estado === 'indisponivel'
        ? `<span class="vd-appcard__port">${esc(app.caminho.slice(0, 22))}…</span>`
        : `<button class="vd-btn vd-btn--sm vd-btn--start" disabled>▶ Iniciar</button>`;

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
        <button class="vd-btn vd-btn--start" disabled>▶ Iniciar</button>
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
  } else {
    const titulos = {
      automacoes: ['Automações', 'Regras "quando X acontecer, faça Y". Chega na Fase 3 do plano.'],
      integracoes: ['Integrações', 'Ligações e redirecionamentos entre os seus apps. Chega depois do MVP.'],
      agente: ['Agente', 'O agente Claude que responde sobre os projetos. Chega nas Fases 5 e 6.'],
      logs: ['Logs', 'Auditoria completa de execuções e ações do agente. Chega na Fase 3.'],
    };
    const [titulo, texto] = titulos[rota] ?? ['—', ''];
    $('#titulo').textContent = titulo;
    $('#subtitulo').textContent = '';
    $('#conteudo').innerHTML = telaEmBreve(titulo, texto);
  }
}

document.addEventListener('click', (ev) => {
  const item = ev.target.closest('.vd-navitem');
  if (item?.dataset.rota) {
    navegar(item.dataset.rota);
    return;
  }
  const card = ev.target.closest('.vd-appcard');
  if (card?.dataset.slug) navegar(`app:${card.dataset.slug}`);
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
  montarMenuApps();
  navegar('dashboard');

  const saude = await fetch('/api/saude').then((r) => r.json());
  $('#rodape-status').textContent = `${saude.dominio} · :${saude.porta}`;
} catch (erro) {
  $('#conteudo').innerHTML = `<div class="vd-alert vd-alert--error"><span class="vd-alert__icon">✕</span><div class="vd-alert__body"><strong>Falha ao carregar</strong>${esc(erro.message)}</div></div>`;
}
