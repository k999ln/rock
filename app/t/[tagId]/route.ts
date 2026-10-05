import { database } from '@/lib/fund-store';
import { campusTagId } from '@/lib/campus';
import { campusStore } from '@/lib/campus-store';

type Context = { params: Promise<{ tagId: string }> };

export async function GET(request: Request, context: Context) {
  const tagId = campusTagId((await context.params).tagId);
  const url = new URL(request.url);
  const rawSource = url.searchParams.get('source');
  const source = rawSource === 'qr' ? 'qr' : rawSource === 'link' ? 'link' : 'nfc';
  const store = campusStore(database());
  const tag = await store.resolveTag(tagId);
  if (!tag)
    return Response.redirect(new URL('/campus?unknownTag=1', url.origin), 302);

  await store.recordTagEvent(tagId, source);
  const destination = new URL(tag.destination, url.origin);
  destination.searchParams.set('source', source);
  return Response.redirect(destination, 302);
}
