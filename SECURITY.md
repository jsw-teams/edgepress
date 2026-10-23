# Security

## Report privately

Do not publish exploit details, secrets, personal documents or production data in issues or PRs. Use this repository's private vulnerability reporting option if available, or email **helper@js.gripe** with the subject "Security: edgepress".

Include the affected commit/version, platform, impact, a minimal sanitized reproduction and possible mitigation. Use dummy accounts/data, not live credentials. We can agree on a private way to exchange a sensitive fixture if needed.

## Scope and maintenance

Reports about current `main` source and reproducible regressions are welcome. There is no promised response SLA, automatic backport policy or security certification. Operators should review changes and dependency advisories before deploying. Vendor platform/provider issues belong to their vendor.

Keep websites static and optional services consent-gated. Do not add authentication, comment storage or API proxies. Test generated hashes, CSP, languages, themes and keyboard behavior.

Ordinary bugs/ideas can use public issues. Coordinate disclosure after a fix and verification. Do not test someone else's live service without authorization.

## Dependency installation

The upstream `@file-viewer/doc` dependency pins an older DOMPurify version. EdgePress currently uses a scoped root npm override to install the patched **DOMPurify 3.4.17** instead. The direct `sanitize-html` dependency is **2.18.1 or newer**. These versions addressed the advisories tracked in [issue #16](https://github.com/jsw-teams/edgepress/issues/16); continue monitoring for new advisories rather than assuming these versions remain safe indefinitely.

Npm applies overrides only from the root project. Sites consuming EdgePress must preserve the scoped `@file-viewer/doc` override in their own `package.json` and regenerate their lockfile if they install a dependency tree that still pins the older DOMPurify. `edgepress init` carries the framework's override into new sites while preserving operator choices. Keep dependency audits enabled in CI; do not suppress findings or remove document isolation as a workaround.
