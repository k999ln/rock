# Security policy

## SPIDER on GitHub

[Secret checks](https://github.com/k999ln/rock/actions/workflows/spider.yml) · [Code analysis](https://github.com/k999ln/rock/actions/workflows/spider-codeql.yml) · [Security alerts](https://github.com/k999ln/rock/security)

SPIDER checks this repository's reachable Git history for secret patterns with checksum-pinned Gitleaks. Suspected secrets fail the `SPIDER / secrets` check. A scanner error also fails the check. Reports contain locations and rule names, never the matched values, source snippets, author details or commit messages. Reviewed exceptions must be narrow; test folders and old history are not blanket-excluded.

The scanner and policy are loaded from an explicit commit in the workflow. Changes in the candidate tree cannot silently change those files for that scan. To update the policy, review and commit its changes first, then update the control commit in the workflow. Workflow changes themselves still require human review: a modified workflow can change its own behavior, and a badge is not a security boundary.

CodeQL separately analyzes JavaScript/TypeScript and Python using the extended security suite. Findings appear in GitHub's Security / Code scanning view. These checks do not build or execute the application, install its dependencies, examine running devices or prove the absence of vulnerabilities. C/C++, Java/Kotlin, binary files, archives, arbitrary encoded data and general personal-information discovery are not comprehensively covered by these repository checks. The native Platform guard and offline pasted-code inspector have separate scopes described in [Spider Guard](docs/spider-guard.md).

Pushes to `main` and `codex/spider-guard`, and pull requests, trigger the workflows. Daily scheduled checks begin only after the workflows reach the default branch. GitHub may delay scheduled jobs or disable inactive public-repository schedules; this is event-based and periodic inspection, not a continuously running firewall.

GitHub secret scanning and push protection were already enabled when this integration began. Dependabot vulnerability alerts and automated security-fix PRs were enabled and read back on 2026-10-03 UTC. These are repository settings, separate from these source files. A fix PR still needs testing and review.

At setup, `main` had no required status checks. Workflow failures are visible but are not enforced merge blockers until required-check rules are configured. After integrating the workflows, require `SPIDER / secrets` and review CodeQL findings before merging. Keep workflow, policy and exception changes under owner review. Existing verification failures are not waived by SPIDER.

## Reporting and response

The improvement cycle is: collect metadata → inspect the source → implement a focused repair → run regression tests → rescan the same commit → report a reviewable PR. `npm run spider:feedback -- --ref codex/spider-guard --output work/spider-feedback` reads CodeQL alerts for that branch, Dependabot alerts for the default branch and current-HEAD workflow status. It never changes or dismisses alerts. Collection failure, incomplete pagination and missing checks remain unknown, not zero findings. A successful collection is not a clean security result.

An hourly local Codex follow-up continues this cycle while its computer and app are running. It reuses existing dependency fix PRs and reports meaningful findings, verified repairs and failures. It does not merge, deploy, rotate credentials or weaken checks. The `SPIDER / repair regressions` job exercises the collector, service-worker sender boundary and MCP authentication/error regressions. Unlike static scans, this job runs repository tests in an isolated GitHub runner with read-only repository permission and no configured secrets.

Do not post credentials, personal records, recovery phrases or exploit details in a public issue or PR. If GitHub offers “Report a vulnerability” in this repository's Security tab, use that private channel. Otherwise arrange a private channel with the repository owner before sharing details; this document does not promise that private reporting is enabled.

If a genuine secret is found, revoke or rotate it at its issuer first, then remove its use from source and review access logs. Deleting the current line does not erase Git history or invalidate a credential. Do not add an exception to silence a genuine leak. Any history rewrite is a separate owner-controlled operation.

An exception must document why a value is public synthetic data, restrict both its rule and path and its exact public value where possible, and be accompanied by a test showing another value in the same file is still detected. Never suppress entire test or documentation trees.
