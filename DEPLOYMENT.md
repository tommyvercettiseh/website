# GitHub → Hostnet

A push to `main` validates the static site. When `HOSTNET_DEPLOY_ENABLED=true`, it also publishes to Hostnet using SFTP.

## One-time setup

Repository Settings → Secrets and variables → Actions:

Secrets:
- `HOSTNET_SSH_KEY`: the private Ed25519 key matching the existing Hostnet public key named **GitHub Actions Hostnet Deploy**. Never paste this in chat, commit it, or print it in workflow logs.
Server identity is pinned in the script using SHA-256 SSHFP fingerprints independently verified through DNSSEC-validating DNS-over-HTTPS (AD=true) on 2026-09-28. No automatic acceptance of changed keys is allowed. Reverify DNSSEC SSHFP if Hostnet rotates its host keys.

Variables:
- `HOSTNET_WEBROOT`: the verified SFTP path to the live `httpdocs` directory. The File Manager's `HTTP/` label is not necessarily an SFTP path.
- `HOSTNET_DEPLOY_ENABLED`: set to `true` only after the settings above are configured.

First run Actions → Publish to Hostnet → Run workflow with `probe` checked to verify the connection and discover the webroot without changing files. Then, after configuring the variables, run it again with `probe` unchecked. Verify the first run completes and all five live page checks pass. Automatic deployment is **not active** until this setup and first live test succeed.

## Behaviour

- Publishes only tracked static site files and `.htaccess`; excludes workflow code, documentation, credentials and Git metadata.
- Does not delete files on Hostnet. Rebirth, which is currently only on Hostnet, is preserved.
- Compares file hashes and uploads only changes.
- Copies all files that will be overwritten into `github-deploy-backups/<run-id>-<attempt>/`, beside `httpdocs`, and verifies those backups before publishing.
- Verifies each staged upload and uses atomic replacement per file. This is not an atomic whole-site release.
- Runs deployments serially; never cancels a deployment halfway through.
- Uses strict SSH host verification and a read-only GitHub token. Secrets are never embedded in public files.
- Checks the homepage, Diensten, Projects, Pallet Optimizer and Rebirth after publishing.

## Recovery and maintenance

Revert a bad Git commit and push `main` to redeploy the prior tracked version. For files missing from Git or a partial deployment, restore affected files from `github-deploy-backups` using SFTP or Hostnet File Manager.

Backups are on the same hosting account, so they are not independent disaster recovery. They accumulate until reviewed and removed manually. No automatic deletion is configured. Keep a separate off-host backup and periodically test recovery.
