# EdgePress VPS Deployment Playbook

This guide explains how to deploy `dist/` to one or more VPS nodes with `edgepress d`. For repository editing rules, read [AGENTS.md](AGENTS.md).

## Requirements

- Node.js 22.12+. EdgePress itself has zero runtime dependencies. To run live SFTP uploads, install the optional `ssh2` package (`npm install --no-save ssh2`).
- Run commands from the target site root, not another project directory.
- Your VPS SSH user needs SFTP access and write/rename permission in the **parent** directory of `remotePath`. Configure Nginx or OpenResty to serve `remotePath`.
- Confirm authorization for the exact host and target path before running a production deploy. Never deploy production just to test a local edit.
- Never hand-edit or commit `dist/`.

## Configure a private config.yml

Keep credentials in a local, uncommitted `config.yml`:

```yaml
deploy:
  vps:
    host: 203.0.113.10
    port: 22
    username: deploy
    remotePath: /var/www/example.org
    password: "replace-with-your-password"
    # Optional SSH host key pin:
    # hostKeySha256: "SHA256:REPLACE_WITH_VERIFIED_SERVER_FINGERPRINT"
```

Choose **one** authentication method: `password`, `passwordEnv`, or `privateKey` (plus optional `passphrase` or `passphraseEnv`). For multiple servers, list named targets under `deploy.vpsTargets`; EdgePress uploads to them concurrently, and you can filter with `--target <name>`.

If you set `hostKeySha256`, EdgePress aborts when the server fingerprint does not match. If you omit it, EdgePress prints a warning and continues without host-key verification.

**Never commit real passwords or keys.** Check `git status --short` before staging files so private changes to a tracked `config.yml` never leak into Git.

## Deployment checklist

1. Verify you are in the right site root and check `git status --short`.
2. Verify `host`, `port`, `username`, `remotePath` (must be absolute and not `/`), and the auth method without printing secrets.
3. Run `edgepress d --dry-run` to build `dist/` and verify the file inventory locally without connecting.
4. Run `edgepress d` (or `edgepress d --target <name>`) once authorized. EdgePress creates remote directories concurrently, uploads files with size checks, stages the new build, swaps it into `remotePath`, and restores the previous folder if the swap fails.
5. Check the exit code, then verify the live site over HTTPS to confirm DNS, TLS, and Nginx/OpenResty routing.

## Commands

```sh
edgepress status              # inspect site summary
edgepress generate            # build dist/ only
edgepress s                   # local preview + Pages editor
edgepress d --dry-run         # build and verify locally, no SSH
edgepress d                   # build and deploy all configured VPS targets
edgepress d --target prod-eu  # build and deploy one named VPS target
```
