import { createSkyToolPackageDraft, parseSkyToolPackage, type SkyToolSourceKind } from './sky-tool-package.ts';
import { SkySubmissionError, type SkyConnectionType, type SkyPermission, type SkyPricing, type SkyExecutionTarget } from './sky-submission.ts';

export type PublicationField = { name: string; label: string; type: 'string' | 'number' | 'integer' | 'boolean'; required: boolean };
export type PublicationForm = {
  id: string; version: string; name: string; summary: string; developerName: string; developerId: string;
  license: string; sourceKind: SkyToolSourceKind; sourceUrl: string; fileName?: string;
  connectionType: SkyConnectionType; endpointUrl: string; connectivity: 'online' | 'offline' | 'hybrid';
  targets: SkyExecutionTarget[]; permissions: SkyPermission[]; sideEffects: ('local_write' | 'external_write' | 'financial')[];
  pricing: SkyPricing; priceNote: string; timeoutSeconds: number;
  input: PublicationField[]; output: PublicationField[]; successCondition: string; validTest: string; invalidTest: string;
};
export function publicationFieldsSchema(fields: PublicationField[]) {
  if (!Array.isArray(fields) || fields.length > 24) throw new SkySubmissionError('入出力の項目はそれぞれ24個以内にしてください。');
  const names = new Set<string>();
  const properties = Object.create(null) as Record<string, unknown>;
  const required: string[] = [];
  for (const field of fields) {
    if (!field || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field.name) || ['constructor','prototype','__proto__'].includes(field.name) || names.has(field.name) ||
      !['string','number','integer','boolean'].includes(field.type) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 120 || typeof field.required !== 'boolean')
      throw new SkySubmissionError('入出力の識別名・説明・型を確認してください。同じ識別名は使用できません。');
    names.add(field.name); properties[field.name] = { type: field.type, description: field.label.trim() };
    if (field.required) required.push(field.name);
  }
  return { type: 'object', additionalProperties: false, properties, required };
}
/** Form controls declare a contract. They do not claim that code passed its tests. */
export function packageFromPublicationForm(input: PublicationForm) {
  const draft = createSkyToolPackageDraft({ sourceKind: input.sourceKind, sourceUrl: input.sourceUrl,
    fileName: input.fileName, name: input.name, summary: input.summary, developerName: input.developerName,
    developerId: input.developerId, version: input.version, license: input.license });
  return parseSkyToolPackage({ ...draft, id: input.id, version: input.version,
    source: { ...draft.source, license: input.license },
    io: { inputSchema: publicationFieldsSchema(input.input), outputSchema: publicationFieldsSchema(input.output) },
    adapter: { connectionType: input.connectionType, endpointUrl: input.endpointUrl.trim() || null },
    capabilities: { connectivity: input.connectivity, executionTargets: input.targets, permissions: input.permissions, sideEffects: input.sideEffects.length ? input.sideEffects : ['none'] },
    pricing: { ...draft.pricing, model: input.pricing, note: input.priceNote },
    execution: { ...draft.execution, timeoutSeconds: input.timeoutSeconds, confirmation: 'per_run', maxAttempts: 1, idempotency: 'required' },
    verification: { method: 'response_schema', successCondition: input.successCondition },
    tests: [{ name: input.validTest, kind: 'valid_input' }, { name: input.invalidTest, kind: 'invalid_input' }],
  });
}
