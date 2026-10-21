import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { requestSkyReviewer } from '@/lib/sky-review-auth';
import {
  linuxServiceStore,
  type LinuxServiceConfig,
} from '@/lib/sky-linux-service-store';
import { linuxRequestText, LinuxServiceError } from '@/lib/sky-linux-service';
export async function POST(request: Request) {
  try {
    const reviewer = await requestSkyReviewer(request),
      value = JSON.parse(await linuxRequestText(request, 10000));
    return Response.json(
      await linuxServiceStore(
        database(),
        env as unknown as LinuxServiceConfig,
      ).review(reviewer, value),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof LinuxServiceError
            ? error.message
            : '登録の審査資格または内容を確認できません。',
      },
      { status: error instanceof LinuxServiceError ? error.status : 403 },
    );
  }
}
