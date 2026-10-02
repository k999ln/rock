/** Format an ISO 4217 amount stored in currency minor units without guessing its exponent. */
export function formatCurrencyMinor(amountMinor: number, currency: string, locale = 'ja-JP') {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !/^[A-Z]{3}$/.test(currency))
    return '金額を確認できません';
  try {
    if (typeof Intl.supportedValuesOf === 'function' &&
      !new Set(Intl.supportedValuesOf('currency')).has(currency))
      return `${currency} ${amountMinor.toLocaleString(locale)}（通貨最小単位）`;
    const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / (10 ** digits));
  } catch {
    return `${currency} ${amountMinor.toLocaleString(locale)}（通貨最小単位）`;
  }
}

/** Parse a user-entered major-unit amount into ISO 4217 minor units without floating-point rounding. */
export function parseCurrencyInputToMinor(value: string, currency: string, locale = 'ja-JP') {
  if (!/^[A-Z]{3}$/.test(currency) || typeof value !== 'string') return null;
  let digits: number | undefined;
  try {
    digits = new Intl.NumberFormat(locale, { style: 'currency', currency })
      .resolvedOptions().maximumFractionDigits;
  } catch {
    return null;
  }
  if (digits === undefined) return null;
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > digits) return null;
  const scale = BigInt(10 ** digits);
  const fraction = (match[2] ?? '').padEnd(digits, '0');
  const minor = BigInt(match[1]) * scale + BigInt(fraction || '0');
  const amount = Number(minor);
  return Number.isSafeInteger(amount) ? amount : null;
}
