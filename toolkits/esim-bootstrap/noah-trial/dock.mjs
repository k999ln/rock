import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import {
  assignDistribution,
  operatorAssignments,
} from '../../../services/operator-dock/src/distribution.ts';
import { OperatorError } from '../../../services/operator-dock/src/validation.ts';

const files = new Map([
  ['/', ['distributions.html', 'text/html; charset=utf-8']],
  ['/distributions.html', ['distributions.html', 'text/html; charset=utf-8']],
  ['/distributions.js', ['distributions.js', 'application/javascript']],
  ['/styles.css', ['styles.css', 'text/css']],
]);
export function trialDock(trial, password) {
  const expected = Buffer.from(
    'Basic ' + Buffer.from('operator:' + password).toString('base64'),
  );
  return async (req, res) => {
    const origin = 'http://127.0.0.1:' + req.socket.localPort;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
    );
    try {
      if (req.headers.host !== new URL(origin).host)
        throw new OperatorError('入口を確認してください。', 403);
      const actual = Buffer.from(req.headers.authorization ?? '');
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Local Operator Dock"');
        throw new OperatorError('運営用の認証が必要です。', 401);
      }
      if (req.method === 'GET' && files.has(req.url)) {
        const [file, type] = files.get(req.url);
        res.setHeader('Content-Type', type);
        return res.end(
          readFileSync(
            new URL(
              '../../../services/operator-dock/public/' + file,
              import.meta.url,
            ),
          ),
        );
      }
      if (req.url !== '/api/distributions')
        throw new OperatorError('ページが見つかりません。', 404);
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET')
        return res.end(
          JSON.stringify(
            await operatorAssignments(await trial.runtime.distributionDb()),
          ),
        );
      if (req.method !== 'POST')
        throw new OperatorError('操作を確認してください。', 405);
      if (req.headers.origin !== origin)
        throw new OperatorError('同じ運営画面から操作してください。', 403);
      if (req.headers['content-type']?.split(';')[0] !== 'application/json')
        throw new OperatorError('JSONで指定してください。', 415);
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) throw new OperatorError('入力が長すぎます。', 413);
        chunks.push(chunk);
      }
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new OperatorError('入力を確認してください。');
      }
      if (
        typeof input?.recipient !== 'string' ||
        !trial.db
          .prepare('SELECT 1 FROM trial_owners WHERE owner=? AND expires>?')
          .get(input.recipient, trial.now())
      )
        throw new OperatorError('有効な試験アカウントを指定してください。');
      res.end(
        JSON.stringify(
          await assignDistribution(await trial.runtime.distributionDb(), input),
        ),
      );
    } catch (error) {
      res.statusCode = error instanceof OperatorError ? error.status : 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            error instanceof OperatorError
              ? error.message
              : '配給記録を確認できません。',
        }),
      );
    }
  };
}
