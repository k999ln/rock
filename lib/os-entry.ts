/** Only a bare OS entry opens Noah. Existing fragments and query handoffs stay intact. */
export function osEntryRedirect(pathname: string, search: string, hash: string): string | null {
  return (pathname === '/' || pathname === '/os') && !search && !hash ? '/noah' : null;
}
