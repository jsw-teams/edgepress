# Security

## Report privately

Do not publish exploit details, secrets, personal documents or production data in issues or PRs. Use this repository's private vulnerability reporting option if available, or email **helper@js.gripe** with the subject "Security: edgepress".

Include the affected commit/version, platform, impact, a minimal sanitized reproduction and possible mitigation. Use dummy accounts/data, not live credentials. We can agree on a private way to exchange a sensitive fixture if needed.

## Scope and maintenance

Reports about current `main` source and reproducible regressions are welcome. There is no promised response SLA, automatic backport policy or security certification. Operators should review changes and dependency advisories before deploying. Vendor platform/provider issues belong to their vendor.

Keep websites static and optional services consent-gated. Do not add authentication, comment storage or API proxies. Test generated hashes, CSP, languages, themes and keyboard behavior.

Ordinary bugs/ideas can use public issues. Coordinate disclosure after a fix and verification. Do not test someone else's live service without authorization.

## Dependency installation

The legacy DOC renderer currently pins DOMPurify to an affected version. The scoped `@file-viewer/doc` override installs DOMPurify 3.4.16 until the upstream renderer updates its pin. npm applies overrides only in the root project: sites consuming EdgePress must retain the same override in their own manifest and regenerate their lockfile. `edgepress init` includes it for new sites while preserving existing operator overrides. Keep dependency audits enabled in CI; do not suppress findings or remove document isolation as a workaround.
