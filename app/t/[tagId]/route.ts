import { database } from '@/lib/fund-store';
import { CampusError, campusTagId, safeRelativeCampusDestination } from '@/lib/campus';
import { campusStore } from '@/lib/campus-store';

type Context = { params: Promise<{ tagId: string }> };

export async function GET(request: Request, context: Context) {
  let tagId: string;
  try {
    tagId = campusTagId((await context.params).tagId);
  } catch (error) {
    if (error instanceof CampusError)
      return new Response('Not found', { status: 404 });
    throw error;
  }
  const url = new URL(request.url);
  const rawSource = url.searchParams.get('source');
  const source = rawSource === 'qr' ? 'qr' : rawSource === 'link' ? 'link' : 'nfc';
  const store = campusStore(database());
  const tag = await store.resolveTag(tagId);
  if (!tag)
    return Response.redirect(new URL('/campus?unknownTag=1', url.origin), 302);

  await store.recordTagEvent(tagId, source);
  let destinationPath: string;
  try {
    destinationPath = safeRelativeCampusDestination(tag.destination);
  } catch {
    return Response.redirect(new URL('/campus?unknownTag=1', url.origin), 302);
  }
  const destination = new URL(destinationPath, url.origin);
  destination.searchParams.set('source', source);
  return Response.redirect(destination, 302);
}
