import { env } from 'cloudflare:workers';
import { handleSimProof, type SimProofEnvironment } from '@/lib/sim-proof-http';

export const POST = (request: Request) =>
  handleSimProof(request, 'revoke', env as SimProofEnvironment);
