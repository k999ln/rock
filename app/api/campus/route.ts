import { database } from '@/lib/fund-store';
import { requestUser } from '@/lib/request-auth';
import {
  CampusError,
  campusId,
  campusMode,
  campusTagId,
  itemInput,
  profileInput,
  verifiedByCampusDomain,
} from '@/lib/campus';
import { campusStore } from '@/lib/campus-store';

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
function fail(error: unknown) {
  if (error instanceof CampusError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインするとCampusへ投稿できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: 'Campusを更新できませんでした。再試行してください。' }, 503);
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new CampusError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > 32_000) {
      await reader.cancel();
      throw new CampusError('入力は32 KB以下にしてください。', 413);
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CampusError('入力形式を確認してください。');
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max: number, min = 1) {
  if (typeof value !== 'string') throw new CampusError(`${label}を入力してください。`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max)
    throw new CampusError(`${label}は${min}〜${max}文字にしてください。`);
  return clean;
}
function entityId(value: unknown) {
  const id = string(value, 'ID', 64);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new CampusError('IDを確認してください。');
  return id;
}
function optionalUser(request: Request) {
  return requestUser(request).catch((error) => {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return null;
    throw error;
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campus = campusId(url.searchParams.get('campus') ?? 'nyu');
    const view = url.searchParams.get('view') ?? 'bootstrap';
    const store = campusStore(database());
    if (view === 'analytics') {
      const user = await requestUser(request);
      return json({ campusId: campus, tags: await store.tagAnalytics(user, campus) });
    }
    if (view !== 'bootstrap') throw new CampusError('表示を確認してください.');
    const user = await optionalUser(request);
    return json(await store.bootstrap(user, campus));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const input = object(await body(request));
    const action = string(input.action, '操作', 40);
    const store = campusStore(database());

    if (action === 'saveProfile') {
      const profile = profileInput(input.profile);
      const email = request.headers.get('oai-authenticated-user-email');
      return json(
        {
          profile: await store.upsertProfile(
            user,
            profile,
            verifiedByCampusDomain(profile.campusId, email),
          ),
        },
        201,
      );
    }

    if (action === 'createItem') {
      return json({ item: await store.createItem(user, itemInput(input.item)) }, 201);
    }

    if (action === 'edge') {
      const campus = campusId(input.campusId);
      const edgeType = string(input.edgeType, '接続種別', 40);
      const targetType = string(input.targetType, '対象種別', 20);
      if (!['follow', 'save', 'collaborator_request', 'join', 'block'].includes(edgeType))
        throw new CampusError('接続種別を確認してください。');
      if (!['profile', 'item'].includes(targetType))
        throw new CampusError('対象種別を確認してください。');
      const note = typeof input.note === 'string' ? input.note.trim().slice(0, 400) : '';
      return json(
        {
          edge: await store.setEdge(
            user,
            campus,
            edgeType as 'follow' | 'save' | 'collaborator_request' | 'join' | 'block',
            targetType as 'profile' | 'item',
            entityId(input.targetId),
            note,
          ),
        },
        201,
      );
    }

    if (action === 'respondEdge') {
      const decision = string(input.decision, '回答', 16);
      if (!['accepted', 'declined'].includes(decision))
        throw new CampusError('回答を確認してください。');
      return json({
        edge: await store.respondEdge(
          user,
          entityId(input.id),
          decision as 'accepted' | 'declined',
        ),
      });
    }

    if (action === 'registerTags') {
      const campus = campusId(input.campusId);
      const prefix = string(input.prefix ?? campus, 'prefix', 48).toLowerCase();
      const label = typeof input.label === 'string' ? input.label.trim().slice(0, 80) : '';
      const placement =
        typeof input.placement === 'string' ? input.placement.trim().slice(0, 120) : '';
      return json(
        {
          tags: await store.registerTagBatch(user, campus, {
            prefix,
            start: input.start as number,
            count: input.count as number,
            mode: campusMode(input.mode ?? 'campus'),
            label,
            placement,
          }),
        },
        201,
      );
    }

    if (action === 'report') {
      const campus = campusId(input.campusId);
      const targetType = string(input.targetType, '対象種別', 20);
      if (!['profile', 'item'].includes(targetType))
        throw new CampusError('対象種別を確認してください。');
      const detail = typeof input.detail === 'string' ? input.detail.trim().slice(0, 1000) : '';
      return json(
        {
          report: await store.report(
            user,
            campus,
            targetType as 'profile' | 'item',
            entityId(input.targetId),
            string(input.reason, '報告理由', 32),
            detail,
          ),
        },
        201,
      );
    }

    throw new CampusError('対応していない操作です。');
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requestUser(request);
    const input = object(await body(request));
    const action = string(input.action, '操作', 40);
    const store = campusStore(database());

    if (action === 'updateItem')
      return json({
        item: await store.updateItem(user, entityId(input.id), itemInput(input.item)),
      });
    if (action === 'archiveItem')
      return json({ item: await store.archiveItem(user, entityId(input.id)) });
    if (action === 'removeEdge')
      return json({ edge: await store.removeEdge(user, entityId(input.id)) });
    if (action === 'setTagActive') {
      if (typeof input.active !== 'boolean')
        throw new CampusError('タグ状態を確認してください。');
      return json({
        tag: await store.setTagActive(user, campusTagId(input.tagId), input.active),
      });
    }

    throw new CampusError('対応していない操作です。');
  } catch (error) {
    return fail(error);
  }
}


export async function DELETE(request: Request) {
  try {
    const user = await requestUser(request);
    const input = object(await body(request));
    const action = string(input.action, '操作', 40);
    const store = campusStore(database());

    if (action === 'leaveCampus')
      return json({ result: await store.leaveCampus(user, campusId(input.campusId)) });
    if (action === 'clearTagAnalytics')
      return json({
        result: await store.clearTagAnalytics(user, campusTagId(input.tagId)),
      });

    throw new CampusError('対応していない操作です。');
  } catch (error) {
    return fail(error);
  }
}
