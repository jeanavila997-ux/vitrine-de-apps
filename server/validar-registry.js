// Validação do catálogo em apps-registry.json.
//
// O registry é a fonte do catálogo: validar ali pega problemas em qualquer
// edição futura, não só na ocorrência atual. A regra mais importante é a de
// portas — o estado de um app é inferido pela porta (process-manager.js),
// então duas apps visíveis na mesma porta geram status falso e risco de
// matar o processo errado no "Parar" (ver issue #4).

/**
 * Retorna as portas duplicadas entre apps visíveis.
 * @returns {{porta: number, apps: string[]}[]}
 */
export function portasDuplicadas(apps) {
  const porPorta = new Map();
  for (const app of apps) {
    // visivel não presente = visível (default do schema é 1)
    if (app.visivel === 0 || app.visivel === false || !app.porta) continue;
    const lista = porPorta.get(app.porta) ?? [];
    lista.push(app.slug);
    porPorta.set(app.porta, lista);
  }
  return [...porPorta.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([porta, slugs]) => ({ porta, apps: slugs }));
}

/**
 * Valida o registry inteiro. Retorna array de avisos (não lança).
 * @param {{apps: object[]}} registro conteúdo de apps-registry.json
 * @returns {{ok: boolean, avisos: string[]}}
 */
export function validarRegistro(registro) {
  const avisos = [];

  for (const { porta, apps: slugs } of portasDuplicadas(registro.apps)) {
    avisos.push(
      `porta ${porta} usada por ${slugs.length} apps visíveis: ${slugs.join(', ')} — ` +
        `o estado é inferido pela porta, então um reporta o status do outro ` +
        `(ver issue #4)`
    );
  }

  return { ok: avisos.length === 0, avisos };
}

/**
 * Formata os avisos para o console.
 * @returns {string}
 */
export function formatarAvisos(avisos) {
  return avisos.map((a) => `  ! ${a}`).join('\n');
}
