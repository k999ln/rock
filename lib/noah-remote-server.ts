import { waitUntil } from 'cloudflare:workers';
import { noahIntakeDependencies } from './noah-intake-server';
export function noahRemoteDependencies() {
  return { ...noahIntakeDependencies(), defer: waitUntil };
}
