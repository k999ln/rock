import { WorkerEntrypoint } from 'cloudflare:workers';
import { recipientAddress, registerAddress } from './distribution-address.ts';
import {
  recipientAssignments,
  receiveAssignment,
  recipientHasPending,
} from './distribution.ts';
import { OperatorError, exactObject } from './validation.ts';
export { default } from './worker.ts';

type Env = { DB: D1Database };

// Only the private Noah binding can enter this recipient interface. The
// operator UI, supplier references, costs and other recipients have no route here.
export class RecipientDistribution extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    if (request.method !== 'POST') return Response.json({}, { status: 405 });
    const action = new URL(request.url).pathname;
    const account = request.headers.get('X-Noah-Account') ?? '';
    if (!account || account.length > 160)
      return Response.json({}, { status: 403 });
    const db = this.env.DB;
    try {
      if (action === '/notice') {
        const row = await db
          .prepare(
            'SELECT recipient FROM distribution_addresses WHERE account_ref=?',
          )
          .bind(account)
          .first<{ recipient: string }>();
        return Response.json({
          updated: !!row && (await recipientHasPending(db, row.recipient)),
        });
      }
      const owner = request.headers.get('X-Noah-Owner') ?? '';
      if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(owner))
        return Response.json({}, { status: 403 });
      if (action === '/address')
        return Response.json({ address: await recipientAddress(db, owner) });
      if (action === '/inbox')
        return Response.json({
          registered: !!(await recipientAddress(db, owner)),
          assignments: await recipientAssignments(db, owner),
        });
      if (action === '/save-address') {
        await registerAddress(db, owner, await request.json(), account);
        return Response.json({ saved: true });
      }
      if (action === '/receive') {
        const form = exactObject(await request.json(), ['id']);
        return Response.json(
          await receiveAssignment(
            db,
            owner,
            typeof form.id === 'string' ? form.id : '',
          ),
        );
      }
      return Response.json({}, { status: 404 });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof OperatorError
              ? error.message
              : '定期便の情報を読み込めません。再試行してください。',
        },
        { status: error instanceof OperatorError ? error.status : 503 },
      );
    }
  }
}
