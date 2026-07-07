# 88_01 Backend Deployment Guide

## Scope

This guide documents the GitHub Actions backend deployment flow for the `backend/` project.

- Workflow: `.github/workflows/deploy-backend.yml`
- Trigger: push to `main` when `backend/**` or the workflow changes; manual `workflow_dispatch`
- Target path: `/www/wwwroot/wecom_card`
- Sync strategy: `rsync --delete` from local `backend/` to the target path, plus `database/` to `${DEPLOY_PATH}/database/`
- Runtime secrets: kept on the server in `.env`; never committed and never uploaded by CI

## GitHub Secrets

Configure these in GitHub:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Required server identity:

| Secret | Required | Notes |
|--------|----------|-------|
| `DEPLOY_HOST` | yes | Server IP or hostname. `SSH_HOST` is also accepted. |
| `DEPLOY_USER` | yes | SSH user with write access to `/www/wwwroot/wecom_card`. `SSH_USER` is also accepted. |
| `DEPLOY_PORT` | no | SSH port. Defaults to `22`. `SSH_PORT` is also accepted. |

Authentication, choose one:

| Secret | Required | Notes |
|--------|----------|-------|
| `DEPLOY_SSH_KEY` | optional | Preferred. Private key for SSH auth. `SSH_PRIVATE_KEY` or `SSH_KEY` is also accepted. |
| `DEPLOY_PASSWORD` | optional | Password fallback when no key is configured. `SSH_PASSWORD` is also accepted. |

Optional restart:

| Secret | Required | Notes |
|--------|----------|-------|
| `DEPLOY_RESTART_COMMAND` | no | Server-side shell script run after sync from `/www/wwwroot/wecom_card`. If empty, CI only syncs files. |

Authentication priority:

1. Use `DEPLOY_SSH_KEY`, `SSH_PRIVATE_KEY`, or `SSH_KEY` when present.
2. Otherwise use `DEPLOY_PASSWORD` or `SSH_PASSWORD`.
3. Fail deployment if neither key nor password is configured.

## Protected Server Files

The deploy job uses `rsync --delete`, but excludes server-owned runtime files so they are not deleted or overwritten:

- `node_modules/`
- `dist/`
- `.env`, `.env.*`
- `*.log`, `logs/`
- `coverage/`, `*.tsbuildinfo`
- `certs/`
- `public/uploads/`, `uploads/`
- `data/`, `cache/`, `storage/`, `tmp/`, `runtime/`
- `.git/`, `.vscode/`

Because `dist/` and `node_modules/` are protected, the server should build/install through the panel or through `DEPLOY_RESTART_COMMAND`.

## Suggested Server Setup

Create the target directory once:

```bash
mkdir -p /www/wwwroot/wecom_card
```

Keep production environment variables on the server:

```bash
cd /www/wwwroot/wecom_card
cp .env.example .env
```

Then edit `.env` on the server only. Required production secrets include:

- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `VISIT_TOKEN_SECRET`
- `CARD_FIELD_ENCRYPTION_KEY_BASE64`
- `WECOM_STATE_ENCRYPTION_KEY_BASE64`
- `WECOM_SUITE_ID`
- `WECOM_SUITE_SECRET`
- `WECOM_CALLBACK_TOKEN`
- `WECOM_CALLBACK_AES_KEY`
- `WECOM_DATA_CALLBACK_TOKEN`
- `WECOM_DATA_CALLBACK_AES_KEY`
- `WECOM_AUTH_LAUNCH_TOKEN`
- `WECOM_INSTALL_REDIRECT_URI`
- `CORS_ORIGINS`

Generate 32-byte base64 keys with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Restart Command Examples

If the hosting panel handles install/build/restart manually, leave `DEPLOY_RESTART_COMMAND` empty.

If you want GitHub Actions to restart automatically, set `DEPLOY_RESTART_COMMAND` to a server-side script. Examples:

```bash
npm ci
npm run build
pm2 reload wecom-card-api || pm2 start dist/main.js --name wecom-card-api
```

or:

```bash
npm ci
npm run build
systemctl restart wecom-card-api
```

Do not put secret values in `DEPLOY_RESTART_COMMAND`; read them from the server-local `.env` or process manager configuration.

## Deployment Checklist

1. Configure GitHub Secrets.
2. Confirm `/www/wwwroot/wecom_card/.env` exists on the server and contains production values.
3. Push a change under `backend/**` or run the workflow manually.
4. After first deployment or any schema change, run `npm run db:migrate` and `npm run db:check` on the server with the production `.env` loaded.
5. In GitHub Actions, confirm `Deploy Backend` passes verification and sync.
6. On the server, confirm the backend is built/restarted by the panel or `DEPLOY_RESTART_COMMAND`.
7. Verify `/api/v1/health/ready`.

## Rollback

This workflow syncs source into the root path directly. Rollback is therefore a Git rollback:

1. Revert the bad commit or push a known-good commit to `main`.
2. Let the deploy workflow sync again.
3. Rebuild/restart on the server.
