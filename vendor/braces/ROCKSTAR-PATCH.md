# Reviewed local security fork of braces

Based on upstream 3.0.3, https://github.com/micromatch/braces/commit/74b2db2938fad48a2ea54a9c8bf27a37a62c350d. Original MIT license and attribution are preserved in LICENSE. This is a private repository-local patched distribution (3.0.3-rock.1), not an upstream release. npm overrides route all consumers through this source; no install-time network patching or version impersonation.

Parser nesting and all three public AST walkers have a hard depth ceiling of 100. This also bounds cyclic child graphs. Escaping, normal nesting, ranges and glob expansion retain upstream behavior.

Validation: `node --test tests/dependency-security.test.mjs` from the repository root. Original code fails four of eight regression tests; patched code passes all eight. Full build/CI acceptance is tracked separately in docs/evidence/security-gate-completion.json. ROCKSTAR-PATCH.json records original and patched file digests.

Maintenance: Security / SYS15 owns these temporary forks. Recheck the actual exploit when upstream publishes a fix; do not rely only on its advisory version range. Remove the local override only after the same regression tests and full verify pass with the upstream package. Do not modify vendor/mr.
