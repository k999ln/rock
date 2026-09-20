import { database } from '@/lib/fund-store';
import { analyzeSkyCodeIntake } from '@/lib/sky-code-intake';
import { skyActivationStore } from '@/lib/sky-activation';
import { skyTelegramBridgeAuthorized } from '@/lib/sky-telegram-bridge-auth';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';
import { SkySubmissionError } from '@/lib/sky-submission';

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!skyTelegramBridgeAuthorized(request))
    return json({ error: 'unauthorized' }, 401);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 520_000)
      throw new SkySubmissionError('貼り付けるコードは512 KB以下にしてください。', 413);
    const input = JSON.parse(raw) as Record<string, unknown>;
    const telegramUserId = typeof input.telegramUserId === 'string' ? input.telegramUserId : '';
    if (!/^-?[0-9]{1,32}$/.test(telegramUserId))
      throw new SkySubmissionError('Telegram利用者IDを確認してください。');
    const code = typeof input.code === 'string' ? input.code : '';
    const intake = await analyzeSkyCodeIntake({
      code,
      fileName: typeof input.fileName === 'string' ? input.fileName : 'telegram-paste.js',
    });
    const db = database();
    const ownerId = `telegram:${telegramUserId}`;
    const saved = await skyToolPackageStore(db).create(ownerId, intake.manifest);
    if (!saved)
      throw new SkySubmissionError('同じTool IDと版はすでに登録されています。コードを少し変えるか版を上げてください。', 409);
    const published = await skyToolPackageStore(db).publishDeclared(
      ownerId,
      saved.packageKey,
      saved.manifestSha256,
    );
    if (!published) throw new SkySubmissionError('Tool Packageを公開できませんでした。', 503);
    const activation = await skyActivationStore(db).issue(ownerId, {
      packageKey: saved.packageKey,
      label: 'Telegram build',
      maxUses: 1,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    return json({
      built: true,
      package: {
        packageKey: saved.packageKey,
        name: intake.manifest.name,
        version: intake.manifest.version,
        language: intake.language,
        entrypoint: intake.entrypoint,
        findings: intake.findings,
      },
      activationCode: activation.code,
      warning: 'ソース本文は保存・実行していません。生成された連携コードを開発環境へ追加し、外部・金融作用は実行前に確認してください。',
    }, 201);
  } catch (error) {
    if (error instanceof SkySubmissionError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
    return json({ error: 'Sky Toolをビルドできませんでした。' }, 503);
  }
}
