import { HOME_INTENT_KEY } from './home-intent.ts';
import { SKY_ZEMA_HANDOFF_KEY } from './sky-zema-handoff.ts';

/** End only transient, unsent handoffs on logout/recovery; never erase saved history. */
export function resetAccountHandoffs(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(HOME_INTENT_KEY);
  storage.removeItem(SKY_ZEMA_HANDOFF_KEY);
}
