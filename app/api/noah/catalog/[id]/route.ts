import { noahResearchCatalog } from '@/lib/noah-research-catalog';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = noahResearchCatalog.get(id);
  return result ? Response.json(result, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: '調査カタログに見つかりません。' }, { status: 404 });
}
