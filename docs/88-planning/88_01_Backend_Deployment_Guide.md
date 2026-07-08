# 88_01 Backend Deployment Guide

## Scope

This guide documents the GitHub Actions backend deployment flow for the `backend/` project.

- Workflow: `.github/workflows/deploy-backend.yml`
- Trigger: push to `main` when `backend/**`, `database/**`, or the workflow changes; manual `workflow_dispatch`
- Target path: configured by GitHub Actions secret `BACKEND_DEPLOY_PATH` or `DEPLOY_PATH`
- Sync strategy: `rsync --delete` from local `backend/` to the target path, plus `database/` to `${DEPLOY_PATH}/database/`
- Runtime secrets: kept on the server in `.env`; never committed and never uploaded by CI
- Template env file: `backend/.env.example` is synced to `${DEPLOY_PATH}/.env.example`

## GitHub Secrets

Configure these in GitHub:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Required server identity:

| Secret | Required | Notes |
|--------|----------|-------|
| `DEPLOY_HOST` | yes | Server IP or hostname. `SSH_HOST` is also accepted. |
| `DEPLOY_USER` | yes | SSH user with write access to the backend deploy path. `SSH_USER` is also accepted. |
| `DEPLOY_PORT` | no | SSH port. Defaults to `22`. `SSH_PORT` is also accepted. |

Required target path:

| Secret | Required | Notes |
|--------|----------|-------|
| `BACKEND_DEPLOY_PATH` | yes | Preferred backend target directory, for example `/www/wwwroot/wecom_card`. |
| `DEPLOY_PATH` | fallback | Backward-compatible generic target directory. Used only when `BACKEND_DEPLOY_PATH` is empty. |

Authentication, choose one:

| Secret | Required | Notes |
|--------|----------|-------|
| `DEPLOY_SSH_KEY` | optional | Preferred. Private key for SSH auth. `SSH_PRIVATE_KEY` or `SSH_KEY` is also accepted. |
| `DEPLOY_PASSWORD` | optional | Password fallback when no key is configured. `SSH_PASSWORD` is also accepted. |

Optional restart:

| Secret | Required | Notes |
|--------|----------|-------|
| `DEPLOY_RESTART_COMMAND` | no | Server-side shell script run after sync from `${DEPLOY_PATH}`. If empty, CI only syncs files. |

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

Create the target directory once. Example:

```bash
BACKEND_DEPLOY_PATH=/www/wwwroot/wecom_card
mkdir -p "$BACKEND_DEPLOY_PATH"
```

Keep production environment variables on the server:

```bash
cd "$BACKEND_DEPLOY_PATH"
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

## BaoTa Node Project Setup

Use BaoTa only as the runtime/process manager. GitHub Actions is responsible for syncing source files into the configured backend deploy path; BaoTa then installs dependencies, builds, and runs the backend from that same directory.

Create the project in BaoTa:

| BaoTa field | Value |
|-------------|-------|
| Project type | `Node.js` |
| Project path | Same as `BACKEND_DEPLOY_PATH`, for example `/www/wwwroot/wecom_card` |
| Project name | `wecom-card-api` |
| Node version | Node `24.x` preferred; Node `22.x` LTS is acceptable if `24.x` is unavailable |
| Package manager | `npm` |
| Install command | Leave empty if using `start:prod`, or `npm install` |
| Build command | Leave empty if using `start:prod`, or `npm run build` |
| Start command | `npm run start:prod` |
| Run directory | Same as `BACKEND_DEPLOY_PATH` |
| Port | Same as `.env` `PORT`, for example `3000` |

If BaoTa has separate fields for environment variables, keep only non-secret basics there, such as `NODE_ENV=production`. Put all secrets in `${BACKEND_DEPLOY_PATH}/.env`, not in GitHub, not in the repository, and not in screenshots.

Recommended first-time sequence in BaoTa:

1. Wait until GitHub Actions has synced files and `${BACKEND_DEPLOY_PATH}/package.json` exists.
2. Copy `${BACKEND_DEPLOY_PATH}/.env.example` to `${BACKEND_DEPLOY_PATH}/.env`.
3. Edit `${BACKEND_DEPLOY_PATH}/.env` with production values.
4. In BaoTa, install dependencies with `npm ci`.
5. Build with `npm run build`.
6. Run database migration with `npm run db:migrate`.
7. Run database readiness check with `npm run db:check`.
8. Start or restart the Node project.

For later code-only deployments, GitHub Actions syncs source and database assets. BaoTa can then run:

```bash
npm run db:migrate
npm run db:check
npm run start:prod
```

If BaoTa automatically restarts an already configured project, do not also set a GitHub Actions `DEPLOY_RESTART_COMMAND`. Use one restart owner to avoid two processes fighting over the same port.

### BaoTa Reverse Proxy And Domain

Point the backend domain DNS record to the server, then bind the domain in BaoTa to the Node project or to a reverse proxy that forwards to `127.0.0.1:${PORT}`.

For example, if `.env` has:

```env
PORT=3000
HOST=0.0.0.0
```

BaoTa/Nginx should proxy the public HTTPS domain to:

```text
http://127.0.0.1:3000
```

After binding HTTPS, verify these public URLs:

```text
https://your-backend-domain.example/api/v1/health/live
https://your-backend-domain.example/api/v1/health/ready
```

Enterprise WeChat callback verification requires the public HTTPS URLs to be reachable from the internet. A local-only domain, IP-only URL, or HTTP-only URL is not enough for production callback setup.

### BaoTa Files That Must Stay On Server

These files/directories are intentionally protected from GitHub Actions deletion or overwrite:

- `${BACKEND_DEPLOY_PATH}/.env`
- `${BACKEND_DEPLOY_PATH}/node_modules/`
- `${BACKEND_DEPLOY_PATH}/dist/`
- runtime uploads, cache, logs, storage, tmp, and data directories

If the server project directory looks empty after a workflow run, check GitHub Actions first. The deploy step should show `Sync backend and database assets to server`. If that step did not run or failed, BaoTa cannot install because `package.json` has not arrived yet.

## Production Domain Values

For your production backend domain, use these URL-shaped values in the server-local `${BACKEND_DEPLOY_PATH}/.env`. Do not commit the real domain-specific `.env` file:

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
2. Confirm `${BACKEND_DEPLOY_PATH}/.env` exists on the server and contains production values.
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
