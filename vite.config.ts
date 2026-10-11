import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, esmExternalRequirePlugin } from 'vite';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };
import { createWebBundleInventoryPlugin } from './scripts/web-bundle-inventory.mjs';
import { createSkyLocalRuntimePlugin } from './scripts/sky-local-runtime.mjs';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: './web-worker.ts',
  compatibility_flags: ['nodejs_compat'],
  vars: { A2A_EGRESS_ALLOWED_ORIGINS: '' },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          migrations_dir: 'drizzle',
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

const clientCloudflareWorkersStub = {
  name: 'rockstar-client-cloudflare-workers-stub',
  enforce: 'pre' as const,
  resolveId(this: { environment?: { name?: string } }, source: string) {
    if (source === 'cloudflare:workers' && this.environment?.name === 'client')
      return '\0rockstar:cloudflare-workers-client-stub';
  },
  load(id: string) {
    if (id === '\0rockstar:cloudflare-workers-client-stub')
      return 'export const env = Object.freeze({});';
  },
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      // Worker dependencies need ESM imports for Node builtins.
      esmExternalRequirePlugin(),
      createSkyLocalRuntimePlugin(),
      createWebBundleInventoryPlugin(),
      clientCloudflareWorkersStub,
      vinext(),
      sites(),
      cloudflare({
        inspectorPort: false,
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
