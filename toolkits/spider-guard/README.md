# Spider code inspector

Paste or load your own source into the generated `SPIDER.html`; edits trigger a local recheck after 500 ms. The file runs offline, needs no SDK/API key/server, and never executes or uploads the supplied source. Input stays in page memory; the optional JSON download contains report metadata only. Original files are not modified.

Build from the repository root:

```sh
node scripts/build-spider-inspector.mjs --output ../SPIDER.html
```

`inspector.html` is the UI template. The build embeds `detector.mjs` and `program-inspector.mjs` in a Web Worker; generated HTML is a delivery artifact outside Git. Limits are 64 KiB UTF-8, 2,000 lines and 100 reported findings. Secrets precede personal data and code candidates; counts describe returned findings, and truncation marks coverage incomplete. `inspectProgram(source, { language })` accepts `javascript`, `python` or `text` and returns versioned, value-free findings, counts, state and coverage limitations. Text mode checks only secret/personal-data candidates. Browser JavaScript/TypeScript and Python checks use bounded lexical patterns, not a full parser, type checker or dependency/data-flow analysis.

The four code-rule families flag places to review, not proven vulnerabilities:

- Dynamic evaluation can interpret supplied strings as code. Review the source of the input and whether evaluation is necessary. [MDN: eval](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval).
- HTML assignment can interpret attacker-controlled markup. Review the trust boundary and sanitization before treating a finding as exploitable. [MDN: innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML).
- Shell invocation requires careful handling of untrusted arguments; merely invoking a process does not prove injection. [Python subprocess security considerations](https://docs.python.org/3/library/subprocess.html#security-considerations).
- Disabling server-certificate verification changes the TLS trust check. Review the actual API and configuration. [Node.js TLS options](https://nodejs.org/api/tls.html).

Aliases, interpolation, dynamic construction, incomplete syntax and external dependencies can be missed. Comments/strings are masked for code rules, while secret/PII checks still inspect them. A clean report does not establish safety, intercept a running program or activate OS-wide protection. The separate native `security.inspectCode` endpoint and existing Platform guard retain their own authentication and execution boundaries; see [scope, usage and validation](../../docs/spider-guard.md).
