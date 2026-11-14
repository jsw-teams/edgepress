# EdgePress VPS deployment guide for Agents

This is the operator playbook for `edgepress d`. Project-wide source editing rules remain in [AGENTS.md](AGENTS.md). Public deployment descriptions belong in [README.md](README.md) and the [deployment page](content/pages/deployment/en.json); do not duplicate or contradict those instructions.

## Requirements

- Use Node.js 22.12+ and install the site's dependencies (`npm install`). Run EdgePress from the intended site root, not an unrelated project.
- The VPS must support SSH/SFTP. The selected account must have permission to create and rename sibling directories in the **parent** of `remotePath`. Configure Nginx/OpenResty to serve `remotePath` as the site document root.
- A production deployment changes the remote website. Confirm authorization for the exact host and destination before deploying. Do not deploy merely to verify a source change or PR.
- `dist/` is generated output; do not manually edit or commit it.

## Configure the private site's config.yml

Use the following example in an operator-controlled **local configuration**, not as a public secret:

```yaml
deploy:
  vps:
    host: 203.0.113.10
    port: 22
    username: deploy
    remotePath: /var/www/example.org
    password: "replace-with-your-password"
    # Optional server identity verification:
    # hostKeySha256: "SHA256:REPLACE_WITH_VERIFIED_SERVER_FINGERPRINT"
```

The password can be stored directly as a quoted YAML string. Choose exactly **one** authentication setting: `password`, `passwordEnv`, or `privateKey`. With a private key, `passphrase` or `passphraseEnv` may also be used. Port 22 is the default.

`hostKeySha256` is **optional**. When provided, it pins the SSH host public key to that verified fingerprint and refuses mismatches. When omitted, EdgePress warns and connects without verifying the SSH server identity. Encryption still applies, but server impersonation is not reliably detected. Verify the fingerprint through an independent trusted channel if you use it.

**Do not commit credentials.** The example project's `config.yml` is already tracked, so `.gitignore` cannot hide modifications to it. Never put real passwords in commits, PRs, CI variables visible in logs, screenshots or documentation. If the site is version-controlled, `passwordEnv` or a private key outside the repository is preferable. Never run `git add -A` blindly with a secret-bearing local config.

## Agent procedure

1. Check the intended EdgePress site root and `git status --short`. Preserve local-only changes and unrelated work. Obtain authorization for the VPS and destination; do not invent either.
2. Review the field names in `config.yml` without printing credentials or the entire file. Confirm `host`, `port`, `username`, `remotePath`, and the selected auth method. `remotePath` must be absolute and must not be `/`.
3. Confirm the remote SFTP account can write and rename under the parent of `remotePath`. If host-key verification is selected, confirm that the fingerprint is trusted.
4. Run `edgepress d --dry-run`. This builds the website and inventories the output without connecting to the VPS or reading authentication secrets.
5. For an explicitly authorized production deployment, run `edgepress d` (or `edgepress deploy vps`, or `npm run deploy:vps`). The uploader stages the output, checks uploaded sizes, and replaces the destination directory.
6. Check the exit status and published file count. Then check the actual site with an authorized HTTP smoke test to verify DNS, TLS and static server routing. Successful SFTP upload alone is not proof that the public URL serves content.
7. If upload fails, the staging directory is removed when possible. If the final swap fails, EdgePress attempts to restore the original directory. If cleanup reports a backup path, inspect it before removal or retry; do not delete the last working site.

## Commands

```sh
edgepress generate       # build only
edgepress s              # local preview and Pages editor, not VPS upload
edgepress d --dry-run    # build and validate, no SSH connection
edgepress d              # build and deploy to the configured VPS
edgepress deploy vps     # equivalent
npm run deploy:vps       # equivalent package script
```

The separate `edgepress deploy cloudflare`, `vercel`, `netlify`, `edgeone`, and `esa` commands deploy to hosted platforms; VPS deployment does not update those providers.

## Changes and tests

When adjusting the VPS deployer, update `src/vps-deploy.js`, `tests/vps-deploy.test.mjs`, the sample `config.yml`, README and site deployment pages together. Run `npm test`, `npm run build` and `npm run audit`; record real results, never an assumed pass. Do not deploy production to test source changes.
