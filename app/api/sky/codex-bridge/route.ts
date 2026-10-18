import { skyMcpTools } from '@/lib/sky-codex-bridge';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    bridge: 'sky-codex',
    status: 'published',
    tools: skyMcpTools.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description })),
    limits: {
      paidExecution: false,
      externalPosting: false,
      deviceControl: false,
      codexConnectionVisibleHere: false,
    },
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
