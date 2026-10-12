# Reviewed local security fork of http-cache-semantics

Based on upstream 4.3.0, https://github.com/kornelski/http-cache-semantics/commit/b1d4bd682fbab0252985de45219f4e7497c0067c. Original BSD-2-Clause license and attribution are preserved in LICENSE. This is a private repository-local patched distribution (4.3.0-rock.1), not an upstream release. npm overrides route all consumers through this source; no install-time network patching or version impersonation.

The 4.3.0 registry release still reproduces the reported max-stale disclosure despite the advisory range stopping at 4.2.0. The request evaluator now refuses non-storable/no-cache responses and shared proxy-revalidate or non-public, non-immutable Set-Cookie responses before max-stale or stale-while-revalidate can revive them. Public caching and explicitly private caches retain existing behavior.

Validation: `node --test tests/dependency-security.test.mjs` from the repository root. Original code fails four of eight regression tests; patched code passes all eight. Full build/CI acceptance is tracked separately in docs/evidence/security-gate-completion.json. ROCKSTAR-PATCH.json records original and patched file digests.

Maintenance: Security / SYS15 owns these temporary forks. Recheck the actual exploit when upstream publishes a fix; do not rely only on its advisory version range. Remove the local override only after the same regression tests and full verify pass with the upstream package. Do not modify vendor/mr.

CodeQL additionally identified polynomial whitespace backtracking in Connection header splitting. Split on the literal comma and trim each token to preserve behavior with linear work; the regression includes one million spaces.

Origin-error follow-up: the same response reuse guard now protects stale-if-error and the direct stale-while-revalidate helper. Error fallback also requires matching URI/host/method/Vary and no request no-cache directive. Expired shared s-maxage and wildcard Vary cannot authorize stale reuse. Successful 304 validation, matching HEAD, public/immutable cookies and explicitly private caches retain their intended behavior. timeToLive remains a retention hint, not permission to serve a response.

Run node --test tests/dependency-cache-revalidation-security.test.mjs without external dependencies: the main baseline passed 3 and failed 10; the patched source passes all 13, with no skips. Source digest and acceptance boundaries are in docs/evidence/spider-cache-error-revalidation.json. The original BSD-2-Clause LICENSE and package metadata are unchanged; the earlier MIT label in this patch record was corrected.
