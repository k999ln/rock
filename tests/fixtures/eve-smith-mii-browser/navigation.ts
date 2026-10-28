export function useRouter() { return { push(url: string) { history.pushState({}, '', url); dispatchEvent(new Event('fixture-navigation')); }, replace(url: string) { history.replaceState({}, '', url); dispatchEvent(new Event('fixture-navigation')); } }; }
export function usePathname() { return location.pathname; }
export function useSearchParams() { return new URLSearchParams(location.search); }
