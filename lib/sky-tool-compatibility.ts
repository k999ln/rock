export type SkyHostEnvironment =
  | 'macos'
  | 'windows'
  | 'linux'
  | 'android'
  | 'ios'
  | 'unknown';

type CatalogHostRequirement = 'desktop' | 'macos';

// Only classify entries whose catalog requirements explicitly name a host OS or PC.
// An absent entry means the browser cannot establish a host incompatibility.
const catalogHostRequirements: Readonly<Record<string, CatalogHostRequirement>> = {
  'rockstar-ip-studio': 'desktop',
  'mr-delivery': 'desktop',
  'rockstar-ledger': 'desktop',
  'faster-whisper': 'desktop',
  playwright: 'desktop',
  'jev-ultrafast': 'desktop',
  'jev-trader': 'desktop',
  'typesafe-computer-use': 'macos',
  'jev-review': 'desktop',
  'jev-router': 'desktop',
  'jev-browser': 'desktop',
  'mobile-jev': 'desktop',
};

export function detectSkyHost(userAgent: string, maxTouchPoints = 0): SkyHostEnvironment {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  // iPadOS desktop-class Safari can identify itself as Macintosh.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/cros/i.test(userAgent)) return 'unknown';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
  if (/windows nt/i.test(userAgent)) return 'windows';
  if (/x11.*linux|linux.*x86_64|linux.*aarch64/i.test(userAgent)) return 'linux';
  return 'unknown';
}

export function isMobileSkyHost(host: SkyHostEnvironment): boolean {
  return host === 'android' || host === 'ios';
}

export function skyHostLabel(host: SkyHostEnvironment): string {
  const labels: Record<SkyHostEnvironment, string> = {
    macos: 'macOSのブラウザ',
    windows: 'Windowsのブラウザ',
    linux: 'Linuxのブラウザ',
    android: 'Androidのブラウザ',
    ios: 'iPhone / iPadのブラウザ',
    unknown: '端末を判定できません',
  };
  return labels[host];
}

export function catalogHostMismatch(
  tool: { id: string },
  host: SkyHostEnvironment,
): string | null {
  const requirement = catalogHostRequirements[tool.id];
  if (requirement === 'macos' && host !== 'macos' && host !== 'unknown') {
    return '隔離したmacOS環境が必要';
  }
  if (requirement === 'desktop' && isMobileSkyHost(host)) {
    return tool.id === 'mobile-jev'
      ? 'PCと別の隔離Android試験端末が必要'
      : 'PC環境が必要';
  }
  return null;
}

export function registryHostMismatch(
  executionTargets: readonly string[],
  host: SkyHostEnvironment,
): string | null {
  // device_local does not encode a specific OS. Cloud is potentially accessible
  // from either form factor. Neither establishes installation or runtime readiness.
  if (
    isMobileSkyHost(host) &&
    executionTargets.length === 1 &&
    executionTargets[0] === 'pc'
  ) {
    return 'PC実行のみ対応';
  }
  return null;
}
