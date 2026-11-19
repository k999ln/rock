const checks = {
  javascriptModules: true,
  fetch: typeof globalThis.fetch === 'function',
  webCrypto: typeof globalThis.crypto?.subtle?.digest === 'function',
  utf8: typeof globalThis.TextEncoder === 'function' && typeof globalThis.TextDecoder === 'function',
  abortController: typeof globalThis.AbortController === 'function',
  responseStreams: typeof globalThis.ReadableStream === 'function',
};
console.log(JSON.stringify({ schema: 'rockstaros.runtime-doctor/1', checks,
  jsHostCompatible: Object.values(checks).every(Boolean),
  eveAuthenticated: false, serviceReachabilityTested: false,
  hardwareDriversTested: false, nativeOsAccepted: false }, null, 2));
if (Object.values(checks).some(v => !v)) process.exitCode = 2;
