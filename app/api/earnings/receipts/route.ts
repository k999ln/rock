import { env } from 'cloudflare:workers';
import {
  earningBridgeFailure,
  forwardProviderEarningReceipt,
  type EarningBridgeEnvironment,
} from '@/lib/earning-bridge';
import { database } from '@/lib/fund-store';

export async function POST(request: Request) {
  try {
    return await forwardProviderEarningReceipt(
      request,
      database(),
      env as unknown as EarningBridgeEnvironment,
    );
  } catch (error) {
    return earningBridgeFailure(error);
  }
}
