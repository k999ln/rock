/** Isolated test-only Connector endpoint and token; never touches the real device session. */
const fixture = window as Window & { __fixtureConnectorUrl?: string; __fixtureConnectorToken?: string };
export const DEVICE_URL = fixture.__fixtureConnectorUrl ?? '';
export function deviceToken() { return fixture.__fixtureConnectorToken ?? ''; }
