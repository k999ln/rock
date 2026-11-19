/** Cancellation shared by browser and future sensor adapters. No permission is issued. */
export function createSmisInputSession() {
  let revision = 0;
  let release: (() => void) | null = null;
  const cancel = () => { revision++; const previous = release; release = null; previous?.(); };
  return {
    begin() { cancel(); return revision; },
    current(token: number) { return token === revision; },
    adopt(token: number, cleanup: () => void) {
      if (token !== revision) { cleanup(); return false; }
      const previous = release; release = cleanup; previous?.(); return true;
    },
    cancel,
    get revision() { return revision; },
  };
}
