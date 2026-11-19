export const TERMINAL_MODELS = Object.freeze(['none', 'qwen2.5:1.5b', 'qwen3:4b']);
export const TERMINAL_SURFACE = Object.freeze({
  schema: 'noah-isolation/1', mode: 'headless', hostDesktop: false,
  hostFiles: false, hostBrowser: false, network: 'none',
});
export function terminalTextSchema(name) {
  return { type: 'object', additionalProperties: false, properties: { [name]: { type: 'string' } }, required: [name] };
}
export function validTerminalTextSchema(schema, name) {
  return schema?.type === 'object' && schema.additionalProperties === false &&
    Object.keys(schema).every(k => ['type','additionalProperties','properties','required'].includes(k)) &&
    schema.properties && Object.keys(schema.properties).length === 1 && schema.properties[name]?.type === 'string' &&
    Object.keys(schema.properties[name]).every(k => ['type','description'].includes(k)) &&
    Array.isArray(schema.required) && schema.required.length === 1 && schema.required[0] === name;
}
export function parseTerminalRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== 4 || Object.keys(value).some(k => !['schema', 'language', 'entrypoint', 'model'].includes(k)) ||
    value.schema !== 'noah-terminal/1' || !['node', 'python'].includes(value.language) || !TERMINAL_MODELS.includes(value.model) ||
    typeof value.entrypoint !== 'string' || value.entrypoint.length > 160 || value.entrypoint.split('/').some(p => p.startsWith('-')) ||
    !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/.test(value.entrypoint) ||
    !(value.language === 'python' ? /\.py$/ : /\.(?:[cm]?js|ts)$/).test(value.entrypoint)) {
    throw new Error('実行定義はnoah-terminal/1、node/python、相対ファイル名、対応ローカルモデルで指定してください。');
  }
  return { schema: 'noah-terminal/1', language: value.language, entrypoint: value.entrypoint, model: value.model };
}
