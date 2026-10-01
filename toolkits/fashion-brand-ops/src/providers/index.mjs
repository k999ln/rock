import { HiggsfieldCreativeProvider, MockCreativeProvider } from "./creative.mjs";
import { HttpSocialProvider, MetaGraphSocialProvider, MockSocialProvider } from "./social.mjs";
import { MockPaymentProvider, StripePaymentProvider } from "./payment.mjs";
import { MockNotificationProvider, WebhookNotificationProvider } from "./notification.mjs";

function select(name, options, kind) {
  const provider = options[name];
  if (!provider) throw new Error(`${kind}_provider_unsupported`);
  return provider;
}

export function createProviderRegistry(config, overrides = {}) {
  const registry = {
    creative: select(config.creativeProvider, { mock: new MockCreativeProvider(), higgsfield: new HiggsfieldCreativeProvider(config, overrides) }, "creative"),
    social: select(config.socialProvider, { mock: new MockSocialProvider(), "instagram-http": new HttpSocialProvider(config, overrides), "meta-graph": new MetaGraphSocialProvider(config, overrides) }, "social"),
    payment: select(config.paymentProvider, { mock: new MockPaymentProvider(), stripe: new StripePaymentProvider(config, overrides) }, "payment"),
    notification: select(config.notificationProvider, { mock: new MockNotificationProvider(), webhook: new WebhookNotificationProvider(config, overrides) }, "notification"),
  };
  return Object.freeze(registry);
}
