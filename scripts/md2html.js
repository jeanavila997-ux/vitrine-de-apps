// Converte PLANO.md em PLANO.html estilizado para impressão em PDF.
// Uso: node scripts/md2html.js
import fs from 'node:fs';

const md = fs.readFileSync('PLANO.md', 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(?<!["=>])(https?:\/\/[^\s<),]+)/g, '<a href="$1">$1</a>');

const lines = md.split(/\r?\n/);
const out = [];
let inCode = false, inTable = false, inList = false;

const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };

for (const l of lines) {
  if (/^```/.test(l)) {
    closeList(); closeTable();
    out.push(inCode ? '</code></pre>' : '<pre><code>');
    inCode = !inCode;
    continue;
  }
  if (inCode) { out.push(esc(l)); continue; }

  if (/^---\s*$/.test(l)) { closeList(); closeTable(); out.push('<hr>'); continue; }

  const h = l.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    closeList(); closeTable();
    const n = h[1].length;
    out.push(`<h${n}>${inline(h[2])}</h${n}>`);
    continue;
  }

  if (/^\|/.test(l)) {
    closeList();
    if (/^\|[\s|:-]+\|?$/.test(l)) continue; // linha separadora
    const cells = l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (!inTable) {
      out.push('<table><thead><tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      inTable = true;
    } else {
      out.push('<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
    }
    continue;
  }
  closeTable();

  const li = l.match(/^\s*[-*]\s+(.*)$/);
  if (li) {
    if (!inList) { out.push('<ul>'); inList = true; }
    out.push(`<li>${inline(li[1])}</li>`);
    continue;
  }

  if (/^>\s?/.test(l)) {
    closeList();
    out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`);
    continue;
  }

  if (l.trim() === '') { closeList(); continue; }

  closeList();
  out.push(`<p>${inline(l)}</p>`);
}
closeList(); closeTable();

const css = `
body{font-family:'Segoe UI',system-ui,sans-serif;max-width:900px;margin:0 auto;padding:36px 44px;color:#1f2328;line-height:1.65;font-size:14px}
h1{font-size:30px;border-bottom:3px solid #cc785c;padding-bottom:12px;margin-bottom:4px;color:#0f1419}
h2{font-size:21px;margin-top:34px;border-bottom:1px solid #d8dce0;padding-bottom:6px;color:#0f1419;page-break-after:avoid}
h3{font-size:16px;margin-top:22px;color:#3a4148;page-break-after:avoid}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13px;page-break-inside:avoid}
th{background:#f2f4f6;text-align:left;font-weight:600}
th,td{border:1px solid #d8dce0;padding:7px 11px;vertical-align:top}
tr:nth-child(even) td{background:#fafbfc}
code{background:#f2f4f6;padding:2px 5px;border-radius:3px;font-family:Consolas,monospace;font-size:12.5px;color:#b8503a}
pre{background:#f7f8fa;border:1px solid #e1e5e9;border-left:3px solid #cc785c;padding:14px 16px;border-radius:5px;overflow-x:auto;page-break-inside:avoid}
pre code{background:none;padding:0;color:#1f2328;font-size:12px;line-height:1.5}
blockquote{border-left:3px solid #cc785c;background:#fdf6f3;margin:14px 0;padding:10px 16px;color:#4a5158}
hr{border:none;border-top:1px solid #e1e5e9;margin:30px 0}
a{color:#0969da;text-decoration:none}
ul{padding-left:24px}li{margin:4px 0}
strong{color:#0f1419}
@page{margin:1.6cm}
`;

fs.writeFileSync(
  'PLANO.html',
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vitrine de Apps — Plano de Criação</title><style>${css}</style></head><body>${out.join('\n')}</body></html>`
);
console.log('PLANO.html gerado:', fs.statSync('PLANO.html').size, 'bytes');
