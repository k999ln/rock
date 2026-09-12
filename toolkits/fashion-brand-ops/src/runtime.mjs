import { loadConfig } from "./config.mjs";
import { Store } from "./db.mjs";
import { createProviderRegistry } from "./providers/index.mjs";
import { FashionBrandService } from "./service.mjs";
import { createToolRouter } from "./tools.mjs";

export function createRuntime(options = {}) {
  const config = options.config || loadConfig(options.env);
  const store = options.store || new Store(config.dbPath);
  store.migrate();
  const providers = options.providers || createProviderRegistry(config, options);
  const service = new FashionBrandService({ store, providers, config, clock: options.clock });
  return { config, store, providers, service, callTool: createToolRouter(service) };
}
