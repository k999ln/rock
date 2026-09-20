export const MATERIAL_INVENTION_CONTRACT =
  'rockstaros-material-invention-sandbox/1' as const;

export const MATERIAL_HAZARDS = [
  'none',
  'unknown',
  'flammable',
  'toxic',
  'corrosive',
  'oxidizer',
  'reactive',
  'explosive',
  'biohazard',
  'radioactive',
  'controlled',
] as const;

export type MaterialHazard = (typeof MATERIAL_HAZARDS)[number];
export type FractionUnit =
  | 'mass_fraction'
  | 'volume_fraction'
  | 'mole_fraction';
export type MaterialState =
  | 'solid'
  | 'liquid'
  | 'gas'
  | 'dispersion'
  | 'unknown';

export type MaterialRecord = {
  id: string;
  name: string;
  composition: string;
  state: MaterialState;
  purityPercent: number;
  source: string;
  lot: string;
  unit: FractionUnit;
  uncertaintyPercent: number;
  sdsRef: string | null;
  hazards: MaterialHazard[];
  regulatoryRefs: string[];
};

export type InventionGoal = {
  id: string;
  title: string;
  targetProperties: string[];
  prohibitedMaterialIds: string[];
  prohibitedHazards: MaterialHazard[];
  maxTemperatureC: number;
  maxPressureKpa: number;
  allowedEquipment: string[];
};

export type ProcessStep = {
  order: number;
  operation: string;
  temperatureC: number;
  pressureKpa: number;
  durationSeconds: number;
  atmosphere: string;
  equipment: string;
};

export type ProcessRecipe = {
  id: string;
  version: number;
  steps: ProcessStep[];
};

export type MaterialInventionRequest = {
  schemaVersion: 1;
  goal: InventionGoal;
  materials: MaterialRecord[];
  ratioPercentSteps: number[];
  process: ProcessRecipe;
};

export type SafetyFinding = {
  code: string;
  subjectId: string;
  message: string;
};

export type SafetyAssessment = {
  status: 'BLOCKED' | 'REVIEW_REQUIRED' | 'SANDBOX_ONLY';
  physicalExecutionAllowed: false;
  blockers: SafetyFinding[];
  reviewRequired: SafetyFinding[];
};

export type CompositionPart = {
  materialId: string;
  percent: number;
  unit: FractionUnit;
  sourceLot: string;
};

export type CompositionCandidate = {
  id: string;
  goalId: string;
  processId: string;
  processVersion: number;
  components: [CompositionPart, CompositionPart];
  safety: SafetyAssessment;
  evidenceState: 'HYPOTHESIS';
  provenance: {
    kind: 'deterministic_sandbox_generation';
    engine: typeof MATERIAL_INVENTION_CONTRACT;
    requestDigest: string;
  };
};

export type MaterialCandidateGraph = {
  contract: typeof MATERIAL_INVENTION_CONTRACT;
  executionMode: 'SANDBOX_ONLY';
  physicalExecutionAllowed: false;
  requestDigest: string;
  nodes: Array<
    | { id: string; kind: 'material'; material: MaterialRecord }
    | { id: string; kind: 'process'; process: ProcessRecipe }
    | { id: string; kind: 'candidate'; candidate: CompositionCandidate }
  >;
  edges: Array<{
    from: string;
    to: string;
    relation: 'uses_material' | 'uses_process';
  }>;
  candidates: CompositionCandidate[];
};

export type CandidateEvidence =
  | {
      kind: 'simulation' | 'literature' | 'supplier';
      sourceId: string;
    }
  | {
      kind: 'experiment_receipt';
      sourceId: string;
      rawDataSha256: string;
      signatureVerified: boolean;
    };

export class MaterialInventionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MaterialInventionError('invalid_object', `${label}が不正です。`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key)))
    throw new MaterialInventionError(
      'unsupported_input',
      `${label}に未対応の項目があります。`,
    );
}

function text(value: unknown, label: string, max = 200) {
  if (typeof value !== 'string')
    throw new MaterialInventionError('invalid_text', `${label}が不正です。`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (!normalized || normalized.length > max)
    throw new MaterialInventionError('invalid_text', `${label}が不正です。`);
  return normalized;
}

function identifier(value: unknown, label: string) {
  const normalized = text(value, label, 80);
  if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(normalized))
    throw new MaterialInventionError(
      'invalid_identifier',
      `${label}が不正です。`,
    );
  return normalized;
}

function finiteNumber(value: unknown, min: number, max: number, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new MaterialInventionError(
      'invalid_number',
      `${label}が範囲外です。`,
    );
  return value;
}

function integer(value: unknown, min: number, max: number, label: string) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new MaterialInventionError(
      'invalid_integer',
      `${label}が範囲外です。`,
    );
  return Number(value);
}

function array(value: unknown, min: number, max: number, label: string) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new MaterialInventionError(
      'invalid_array',
      `${label}の件数が不正です。`,
    );
  return value;
}

function unique<T>(values: T[], label: string) {
  if (new Set(values).size !== values.length)
    throw new MaterialInventionError(
      'duplicate_value',
      `${label}が重複しています。`,
    );
  return values;
}

function stringList(value: unknown, min: number, max: number, label: string) {
  return unique(
    array(value, min, max, label).map((item) => text(item, label)),
    label,
  );
}

function identifierList(
  value: unknown,
  min: number,
  max: number,
  label: string,
) {
  return unique(
    array(value, min, max, label).map((item) => identifier(item, label)),
    label,
  );
}

function hazardList(value: unknown, min: number, label: string) {
  const hazards = unique(
    array(value, min, MATERIAL_HAZARDS.length, label).map((item) => {
      if (!MATERIAL_HAZARDS.includes(item as MaterialHazard))
        throw new MaterialInventionError(
          'invalid_hazard',
          `${label}が不正です。`,
        );
      return item as MaterialHazard;
    }),
    label,
  );
  if (hazards.includes('none') && hazards.length > 1)
    throw new MaterialInventionError(
      'contradictory_hazard',
      `${label}でnoneと危険分類を併記できません。`,
    );
  return hazards;
}

function validateGoal(value: unknown): InventionGoal {
  const input = object(value, '目的');
  exactKeys(
    input,
    [
      'id',
      'title',
      'targetProperties',
      'prohibitedMaterialIds',
      'prohibitedHazards',
      'maxTemperatureC',
      'maxPressureKpa',
      'allowedEquipment',
    ],
    '目的',
  );
  return {
    id: identifier(input.id, '目的ID'),
    title: text(input.title, '目的名'),
    targetProperties: stringList(input.targetProperties, 1, 20, '目的特性'),
    prohibitedMaterialIds: identifierList(
      input.prohibitedMaterialIds,
      0,
      100,
      '禁止物質',
    ),
    prohibitedHazards: hazardList(input.prohibitedHazards, 0, '禁止危険分類'),
    maxTemperatureC: finiteNumber(
      input.maxTemperatureC,
      -273.15,
      3000,
      '最高温度',
    ),
    maxPressureKpa: finiteNumber(
      input.maxPressureKpa,
      0,
      1_000_000,
      '最高圧力',
    ),
    allowedEquipment: identifierList(input.allowedEquipment, 1, 50, '許可設備'),
  };
}

function validateMaterial(value: unknown): MaterialRecord {
  const input = object(value, '物質');
  exactKeys(
    input,
    [
      'id',
      'name',
      'composition',
      'state',
      'purityPercent',
      'source',
      'lot',
      'unit',
      'uncertaintyPercent',
      'sdsRef',
      'hazards',
      'regulatoryRefs',
    ],
    '物質',
  );
  if (
    !['solid', 'liquid', 'gas', 'dispersion', 'unknown'].includes(
      String(input.state),
    )
  )
    throw new MaterialInventionError('invalid_state', '物質状態が不正です。');
  if (
    !['mass_fraction', 'volume_fraction', 'mole_fraction'].includes(
      String(input.unit),
    )
  )
    throw new MaterialInventionError('invalid_unit', '配合単位が不正です。');
  if (input.sdsRef !== null && typeof input.sdsRef !== 'string')
    throw new MaterialInventionError('invalid_sds', 'SDS参照が不正です。');
  return {
    id: identifier(input.id, '物質ID'),
    name: text(input.name, '物質名'),
    composition: text(input.composition, '組成'),
    state: input.state as MaterialState,
    purityPercent: finiteNumber(
      input.purityPercent,
      Number.MIN_VALUE,
      100,
      '純度',
    ),
    source: text(input.source, '由来'),
    lot: text(input.lot, 'lot'),
    unit: input.unit as FractionUnit,
    uncertaintyPercent: finiteNumber(
      input.uncertaintyPercent,
      0,
      100,
      '不確かさ',
    ),
    sdsRef: input.sdsRef === null ? null : text(input.sdsRef, 'SDS参照', 500),
    hazards: hazardList(input.hazards, 1, '危険分類'),
    regulatoryRefs: stringList(input.regulatoryRefs, 0, 50, '規制参照'),
  };
}

function validateProcess(value: unknown): ProcessRecipe {
  const input = object(value, '工程');
  exactKeys(input, ['id', 'version', 'steps'], '工程');
  const steps = array(input.steps, 1, 100, '工程手順').map((value) => {
    const step = object(value, '工程手順');
    exactKeys(
      step,
      [
        'order',
        'operation',
        'temperatureC',
        'pressureKpa',
        'durationSeconds',
        'atmosphere',
        'equipment',
      ],
      '工程手順',
    );
    return {
      order: integer(step.order, 1, 100, '工程順'),
      operation: identifier(step.operation, '工程操作'),
      temperatureC: finiteNumber(step.temperatureC, -273.15, 3000, '工程温度'),
      pressureKpa: finiteNumber(step.pressureKpa, 0, 1_000_000, '工程圧力'),
      durationSeconds: integer(step.durationSeconds, 0, 31_536_000, '工程時間'),
      atmosphere: identifier(step.atmosphere, '雰囲気'),
      equipment: identifier(step.equipment, '設備'),
    };
  });
  const orders = steps.map((step) => step.order);
  unique(orders, '工程順');
  if (orders.some((order, index) => order !== index + 1))
    throw new MaterialInventionError(
      'non_contiguous_process',
      '工程順は1から連続させてください。',
    );
  return {
    id: identifier(input.id, '工程ID'),
    version: integer(input.version, 1, 1_000_000, '工程版'),
    steps,
  };
}

export function validateMaterialInventionRequest(
  value: unknown,
): MaterialInventionRequest {
  const input = object(value, '発明sandbox入力');
  exactKeys(
    input,
    ['schemaVersion', 'goal', 'materials', 'ratioPercentSteps', 'process'],
    '発明sandbox入力',
  );
  if (input.schemaVersion !== 1)
    throw new MaterialInventionError(
      'unsupported_schema',
      'schemaVersionは1だけに対応します。',
    );
  const materials = array(input.materials, 2, 16, '物質').map(validateMaterial);
  unique(
    materials.map((material) => material.id),
    '物質ID',
  );
  const ratioPercentSteps = unique(
    array(input.ratioPercentSteps, 1, 19, '比率').map((value) =>
      integer(value, 1, 99, '比率'),
    ),
    '比率',
  ).sort((a, b) => a - b);
  return {
    schemaVersion: 1,
    goal: validateGoal(input.goal),
    materials,
    ratioPercentSteps,
    process: validateProcess(input.process),
  };
}

export function canonicalMaterialJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonicalMaterialJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalMaterialJson(record[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function materialDigest(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalMaterialJson(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

const REVIEW_HAZARDS = new Set<MaterialHazard>([
  'flammable',
  'toxic',
  'corrosive',
  'oxidizer',
  'reactive',
  'explosive',
  'biohazard',
  'radioactive',
  'controlled',
]);

function assessSafety(
  goal: InventionGoal,
  materials: [MaterialRecord, MaterialRecord],
  process: ProcessRecipe,
): SafetyAssessment {
  const blockers: SafetyFinding[] = [];
  const reviewRequired: SafetyFinding[] = [];
  const block = (code: string, subjectId: string, message: string) =>
    blockers.push({ code, subjectId, message });
  const review = (code: string, subjectId: string, message: string) =>
    reviewRequired.push({ code, subjectId, message });

  for (const material of materials) {
    if (goal.prohibitedMaterialIds.includes(material.id))
      block('PROHIBITED_MATERIAL', material.id, '目的で禁止された物質です。');
    if (!material.sdsRef)
      block(
        'MISSING_SDS',
        material.id,
        'SDS参照がないため物理実行できません。',
      );
    if (material.state === 'unknown')
      block('UNKNOWN_STATE', material.id, '物質状態が不明です。');
    for (const hazard of material.hazards) {
      if (hazard === 'unknown')
        block('UNKNOWN_HAZARD', material.id, '危険性が不明です。');
      if (goal.prohibitedHazards.includes(hazard))
        block(
          'PROHIBITED_HAZARD',
          material.id,
          `禁止危険分類${hazard}に該当します。`,
        );
      else if (REVIEW_HAZARDS.has(hazard))
        review(
          'QUALIFIED_REVIEW_REQUIRED',
          material.id,
          `${hazard}は資格者審査が必要です。`,
        );
    }
  }
  if (materials[0].unit !== materials[1].unit)
    block('UNIT_MISMATCH', goal.id, '二物質の配合基準単位が一致しません。');
  for (const step of process.steps) {
    const subject = `${process.id}:step:${step.order}`;
    if (step.temperatureC > goal.maxTemperatureC)
      block(
        'TEMPERATURE_LIMIT',
        subject,
        '工程温度が目的の上限を超えています。',
      );
    if (step.pressureKpa > goal.maxPressureKpa)
      block('PRESSURE_LIMIT', subject, '工程圧力が目的の上限を超えています。');
    if (!goal.allowedEquipment.includes(step.equipment))
      block('EQUIPMENT_NOT_ALLOWED', subject, '許可されていない設備です。');
  }
  return {
    status: blockers.length
      ? 'BLOCKED'
      : reviewRequired.length
        ? 'REVIEW_REQUIRED'
        : 'SANDBOX_ONLY',
    physicalExecutionAllowed: false,
    blockers,
    reviewRequired,
  };
}

export async function generateMaterialCandidateGraph(
  value: unknown,
): Promise<MaterialCandidateGraph> {
  const request = validateMaterialInventionRequest(value);
  const requestDigest = await materialDigest(request);
  const candidates: CompositionCandidate[] = [];
  for (
    let leftIndex = 0;
    leftIndex < request.materials.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < request.materials.length;
      rightIndex += 1
    ) {
      const left = request.materials[leftIndex];
      const right = request.materials[rightIndex];
      for (const leftPercent of request.ratioPercentSteps) {
        const components: [CompositionPart, CompositionPart] = [
          {
            materialId: left.id,
            percent: leftPercent,
            unit: left.unit,
            sourceLot: left.lot,
          },
          {
            materialId: right.id,
            percent: 100 - leftPercent,
            unit: right.unit,
            sourceLot: right.lot,
          },
        ];
        const candidateDigest = await materialDigest({
          requestDigest,
          components,
          processId: request.process.id,
          processVersion: request.process.version,
        });
        candidates.push({
          id: `candidate:${candidateDigest}`,
          goalId: request.goal.id,
          processId: request.process.id,
          processVersion: request.process.version,
          components,
          safety: assessSafety(request.goal, [left, right], request.process),
          evidenceState: 'HYPOTHESIS',
          provenance: {
            kind: 'deterministic_sandbox_generation',
            engine: MATERIAL_INVENTION_CONTRACT,
            requestDigest,
          },
        });
      }
    }
  }
  const nodes: MaterialCandidateGraph['nodes'] = [
    ...request.materials.map((material) => ({
      id: material.id,
      kind: 'material' as const,
      material,
    })),
    { id: request.process.id, kind: 'process', process: request.process },
    ...candidates.map((candidate) => ({
      id: candidate.id,
      kind: 'candidate' as const,
      candidate,
    })),
  ];
  const edges: MaterialCandidateGraph['edges'] = candidates.flatMap(
    (candidate) => [
      ...candidate.components.map((component) => ({
        from: candidate.id,
        to: component.materialId,
        relation: 'uses_material' as const,
      })),
      {
        from: candidate.id,
        to: candidate.processId,
        relation: 'uses_process' as const,
      },
    ],
  );
  return {
    contract: MATERIAL_INVENTION_CONTRACT,
    executionMode: 'SANDBOX_ONLY',
    physicalExecutionAllowed: false,
    requestDigest,
    nodes,
    edges,
    candidates,
  };
}

export function deriveCandidateEvidenceState(
  evidence: CandidateEvidence[],
): 'HYPOTHESIS' | 'SCREENED' | 'SIMULATED' | 'EXPERIMENT_VERIFIED' {
  if (
    evidence.some(
      (item) =>
        item.kind === 'experiment_receipt' &&
        item.signatureVerified &&
        /^[a-f0-9]{64}$/u.test(item.rawDataSha256),
    )
  )
    return 'EXPERIMENT_VERIFIED';
  if (evidence.some((item) => item.kind === 'simulation')) return 'SIMULATED';
  if (evidence.length) return 'SCREENED';
  return 'HYPOTHESIS';
}
