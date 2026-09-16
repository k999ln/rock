export class OperatorError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function exactObject(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new OperatorError('入力の形式を確認してください。');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key)))
    throw new OperatorError('許可されていない項目が含まれています。');
  return record;
}

export function uuid(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    throw new OperatorError('操作IDの形式を確認してください。');
  return value.toLowerCase();
}
