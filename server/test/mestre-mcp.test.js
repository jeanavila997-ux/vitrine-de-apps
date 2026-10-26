import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.env.MESTRE_MCP_ENABLED = 'true';
process.env.MESTRE_MCP_ENTRY = path.join(root, 'server', 'test', 'fixtures', 'fake-mestre-mcp.js');
process.env.MESTRE_MCP_TIMEOUT_MS = '5000';
const client = await import('../mestre-mcp-client.js');

test('Vitrine lista e chama ferramentas do Mestre por MCP stdio', async () => {
  const tools = await client.listarFerramentasMestre();
  assert.deepEqual(tools.map((tool) => tool.name), ['consultar_status_launcher', 'reiniciar_servico']);
  assert.equal(client.ferramentaExigeConfirmacao(tools[0]), false);
  assert.equal(client.ferramentaExigeConfirmacao(tools[1]), true);
  const result = await client.chamarFerramentaMestre('consultar_status_launcher', {});
  assert.match(client.textoResultadoMcp(result), /executado:consultar_status_launcher/);
});

test('ponte bloqueia o modo livre do Mestre', async () => {
  await assert.rejects(client.chamarFerramentaMestre('executar_comando_livre', {}), /bloqueada/);
});

test.after(async () => client.encerrarMestreMcp());
