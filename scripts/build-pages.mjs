// Gera o catálogo estático em docs/ para publicação via GitHub Pages.
// Lê server/apps-registry.json — sem status ao vivo, sem banco, sem servidor:
// é só a lista de apps pra quem só tem o link público. Rodar com
// `npm run pages:build` sempre que o registry mudar.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(path.join(ROOT, 'server/apps-registry.json'), 'utf8'));
const DOCS = path.join(ROOT, 'docs');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cardHtml(app) {
  const porta = app.porta ? `<span class="vd-appcard__port">:${app.porta}</span>` : '<span class="vd-appcard__port"></span>';
  return `
  <article class="vd-appcard" style="--app-color:${escapeHtml(app.cor)}">
    <div class="vd-appcard__head">
      <div class="vd-appcard__icon">${escapeHtml(app.icone)}</div>
      <div class="vd-appcard__titles">
        <h3 class="vd-appcard__name">${escapeHtml(app.nome)}</h3>
        <p class="vd-appcard__stack">${escapeHtml(app.stack)}</p>
      </div>
    </div>
    <p class="vd-appcard__desc">${escapeHtml(app.descricao)}</p>
    <div class="vd-appcard__foot">
      <a class="vd-btn vd-btn--secondary vd-btn--sm" href="${escapeHtml(app.repositorio)}" target="_blank" rel="noopener">Código-fonte</a>
      ${porta}
    </div>
  </article>`;
}

const apps = [...registry.apps].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
const cards = apps.map(cardHtml).join('\n');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vitrine de Apps</title>
<meta name="description" content="Catálogo dos apps do Jean Avila.">
<link rel="stylesheet" href="styles.css">
</head>
<body>

<header class="vd-pageheader">
  <div class="vd-pageheader__brand">
    <div class="vd-pageheader__logo">V</div>
    <span>Vitrine de Apps</span>
  </div>
  <a class="vd-btn vd-btn--secondary vd-btn--sm" href="https://github.com/jeanavila997-ux/vitrine-de-apps" target="_blank" rel="noopener">Repositório</a>
</header>

<main class="vd-content">
  <p class="vd-pageheader__sub">Catálogo estático — sem status ao vivo. Gerado a partir de <code>apps-registry.json</code>.</p>
  <div class="vd-appgrid">
${cards}
  </div>
</main>

</body>
</html>
`;

mkdirSync(DOCS, { recursive: true });
writeFileSync(path.join(DOCS, 'index.html'), html);
writeFileSync(path.join(DOCS, '.nojekyll'), '');
console.log(`Gerado docs/index.html com ${apps.length} apps.`);
