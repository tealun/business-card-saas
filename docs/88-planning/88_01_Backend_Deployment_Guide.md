# 88_01 Backend Deployment Guide

## Scope

This guide documents the GitHub Actions backend deployment flow for the `backend/` project.

- Workflow: `.github/workflows/deploy-backend.yml`
- Trigger: push to `main` when `backend/**`, `database/**`, or the workflow changes; manual `workflow_dispatch`
- Target path: `/www/wwwroot/wecom_card`
- Sync strategy: `rsync --delete` from local `backend/` to the target path, plus `database/` to `${DEPLOY_PATH}/database/`
- Runtime secrets: kept on the server in `.env`; never committed and never uploaded by CI
- Template env file: `backend/.env.example` is synced to `/www/wwwroot/wecom_card/.env.example`

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
- `.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.staging`
- `*.log`, `logs/`
- `coverage/`, `*.tsbuildinfo`
- `certs/`
- `public/uploads/`, `uploads/`
- `data/`, `cache/`, `storage/`, `tmp/`, `runtime/`
- `.git/`, `.vscode/`

Because `dist/` and `node_modules/` are protected, the server should build/install through the panel or through `DEPLOY_RESTART_COMMAND`.

`backend/.env.example` is deliberately not protected by the exclude list. It is safe to sync as a template because it contains placeholders only, and it lets the server root keep an up-to-date example file beside the real `.env`.

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

## Production Domain Values

For your production backend domain, use these URL-shaped values in the server-local `/www/wwwroot/wecom_card/.env`. Do not commit the real domain-specific `.env` file:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
WECOM_INSTALL_REDIRECT_URI=https://your-backend-domain.example/api/v1/wecom/authorization-complete
WECOM_INSTALL_BASE_URL=https://open.work.weixin.qq.com/3rdapp/install
```

If the admin web app calls this API from another domain, include that admin origin in `CORS_ORIGINS`, for example:

```env
CORS_ORIGINS=https://your-admin-domain.example
```

If the admin UI is not deployed yet, keep the final admin domain blank until it exists; WeCom server-to-server callbacks do not depend on browser CORS.

## WeCom Third-Party SaaS Configuration

The `WECOM_*` suite and callback variables in `.env` are provider-level settings for this SaaS application's Enterprise WeChat third-party suite. They are not a customer's CorpID, AgentID, or app secret.

Tenant companies connect by authorizing this third-party suite. After authorization, the backend stores each company's `open_corpid`, encrypted `permanent_code`, `agent_id`, and related status in the database `tenants` table. That is how one fixed SaaS suite supports many Enterprise WeChat companies.

Configure these URLs in the Enterprise WeChat third-party app / service provider console:

| Purpose | URL |
|---------|-----|
| Authorization redirect | `https://your-backend-domain.example/api/v1/wecom/authorization-complete` |
| Command callback | `https://your-backend-domain.example/api/v1/wecom/callbacks/command` |
| Data callback | `https://your-backend-domain.example/api/v1/wecom/callbacks/data` |

Keep the callback Token and EncodingAESKey values consistent between the Enterprise WeChat console and the server `.env`:

```env
WECOM_SUITE_ID=wwsuite_real_value_from_wecom
WECOM_SUITE_SECRET=real_suite_secret_from_wecom
WECOM_CALLBACK_TOKEN=real_command_callback_token
WECOM_CALLBACK_AES_KEY=real_43_character_command_encoding_aes_key
WECOM_DATA_CALLBACK_TOKEN=real_data_callback_token
WECOM_DATA_CALLBACK_AES_KEY=real_43_character_data_encoding_aes_key
```

Generate internal backend-only keys locally and paste only into the server `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use that command for:

- `CARD_FIELD_ENCRYPTION_KEY_BASE64`
- `WECOM_STATE_ENCRYPTION_KEY_BASE64`

Use a long random string for `JWT_SECRET`, `ADMIN_JWT_SECRET`, `VISIT_TOKEN_SECRET`, and `WECOM_AUTH_LAUNCH_TOKEN`.

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
