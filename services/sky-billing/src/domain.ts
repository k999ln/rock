export type StripeObject = Record<string, unknown>;

function record(value: unknown): StripeObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as StripeObject)
    : null;
}

export function stringValue(value: unknown) {
  if (typeof value === 'string') return value;
  const item = record(value);
  return typeof item?.id === 'string' ? item.id : null;
}

function nested(object: StripeObject, ...keys: string[]) {
  let value: unknown = object;
  for (const key of keys) {
    if (Array.isArray(value) && /^\d+$/u.test(key)) value = value[Number(key)];
    else value = record(value)?.[key];
  }
  return value;
}

export function assertMonthlyPrice(value: unknown, expectedId: string) {
  const price = record(value);
  const recurring = record(price?.recurring);
  if (
    price?.id !== expectedId ||
    price.active !== true ||
    price.currency !== 'usd' ||
    price.unit_amount !== 888 ||
    price.type !== 'recurring' ||
    recurring?.interval !== 'month' ||
    (recurring.interval_count ?? 1) !== 1
  )
    throw new Error('STRIPE_PRICE_MUST_BE_USD_888_MONTHLY');
  return price;
}

export function stripeCustomerId(object: StripeObject) {
  return stringValue(object.customer);
}

export function stripeSubscriptionId(object: StripeObject) {
  return (
    stringValue(object.subscription) ??
    stringValue(
      nested(object, 'parent', 'subscription_details', 'subscription'),
    )
  );
}

export function stripeUserId(object: StripeObject) {
  const candidates = [
    object.client_reference_id,
    nested(object, 'metadata', 'sky_user_id'),
    nested(object, 'subscription_details', 'metadata', 'sky_user_id'),
    nested(object, 'parent', 'subscription_details', 'metadata', 'sky_user_id'),
  ];
  return (candidates.find(
    (value) =>
      typeof value === 'string' && value.length > 0 && value.length <= 256,
  ) ?? null) as string | null;
}

export function subscriptionPriceId(object: StripeObject) {
  const direct = stringValue(nested(object, 'items', 'data', '0', 'price'));
  if (direct) return direct;
  const lines = record(object.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  for (const entry of data) {
    const line = record(entry);
    const price =
      stringValue(line?.price) ??
      stringValue(nested(line ?? {}, 'pricing', 'price_details', 'price'));
    if (price) return price;
  }
  return null;
}

export function currentPeriodEnd(object: StripeObject) {
  if (typeof object.current_period_end === 'number')
    return object.current_period_end;
  const items = record(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = record(data[0]);
  return typeof first?.current_period_end === 'number'
    ? first.current_period_end
    : null;
}

export function invoicePeriod(object: StripeObject) {
  const lines = record(object.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  const period = record(record(data[0])?.period);
  return {
    start:
      typeof period?.start === 'number'
        ? period.start
        : typeof object.period_start === 'number'
          ? object.period_start
          : null,
    end:
      typeof period?.end === 'number'
        ? period.end
        : typeof object.period_end === 'number'
          ? object.period_end
          : null,
  };
}
