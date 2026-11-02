/** Only a bare OS entry opens Eve. Existing fragments and query handoffs stay intact. */
export function osEntryRedirect(pathname: string, search: string, hash: string): string | null {
  return (pathname === '/' || pathname === '/os') && !search && !hash ? '/os/eve' : null;
}
