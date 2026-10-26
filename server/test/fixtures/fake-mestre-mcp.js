import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'fake-mestre', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'consultar_status_launcher', description: 'Consulta segura', annotations: { readOnlyHint: true, destructiveHint: false }, inputSchema: { type: 'object', properties: {} } },
    { name: 'reiniciar_servico', description: 'Ação destrutiva', annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] } },
    { name: 'executar_comando_livre', description: 'Não deve atravessar a ponte', inputSchema: { type: 'object', properties: {} } },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => ({ content: [{ type: 'text', text: `executado:${params.name}:${JSON.stringify(params.arguments || {})}` }] }));
await server.connect(new StdioServerTransport());
