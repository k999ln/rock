import type { A2ADelegation } from './a2a-delegation-store.ts';
export const A2A_USAGE_CONTEXT_EXTENSION_URI = 'https://avoado.si/sky/extensions/usage-context/v1';
export const A2A_USAGE_CONTEXT_METADATA = 'org.rockstar.usageContext';
export type A2AUsageContext = {
  schema: 'rock-a2a-usage-context/1';
  ownerUserId: string; parentJobId: string; delegationId: string; messageId: string;
  inputSha256: string; authorizationSha256: string; currency: string;
  maximumAmountMinor: number; deadlineAt: number; pricingVersion?: string;
};
/** Correlation data only; never a credential, an execution grant or a verified receipt. */
export function createA2AUsageContext(d: A2ADelegation): A2AUsageContext {
  return { schema:'rock-a2a-usage-context/1',ownerUserId:d.ownerUserId,parentJobId:d.parentJobId,delegationId:d.id,messageId:d.messageId,inputSha256:d.inputSha256,authorizationSha256:d.authorizationSha256,currency:d.budgetCurrency,maximumAmountMinor:d.budgetLimitMinor,deadlineAt:d.deadlineAt,...(d.priceQuote?{pricingVersion:d.priceQuote.pricingVersion}:{}) };
}
export function validateA2AUsageContext(value: A2AUsageContext, messageId: string, inputSha256: string) {
  const allowed = ['schema','ownerUserId','parentJobId','delegationId','messageId','inputSha256','authorizationSha256','currency','maximumAmountMinor','deadlineAt','pricingVersion'];
  if (!value || typeof value !== 'object' || Object.keys(value).some(key=>!allowed.includes(key)) || value.schema !== 'rock-a2a-usage-context/1' ||
    ['ownerUserId','parentJobId','delegationId','messageId'].some(key=>typeof value[key as keyof A2AUsageContext] !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(value[key as keyof A2AUsageContext] as string)) ||
    value.messageId !== messageId || value.inputSha256 !== inputSha256 || !/^[a-f0-9]{64}$/.test(value.authorizationSha256) ||
    !/^[A-Z]{3}$/.test(value.currency) || !Number.isSafeInteger(value.maximumAmountMinor) || value.maximumAmountMinor<0 ||
    !Number.isSafeInteger(value.deadlineAt) || value.deadlineAt<=Date.now() ||
    (value.pricingVersion!==undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(value.pricingVersion))) throw new Error('A2A_USAGE_CONTEXT_INVALID');
  return value;
}
