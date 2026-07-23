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

Optional post-deploy verification:

| Secret | Required | Notes |
|--------|----------|-------|
| `BACKEND_PUBLIC_ORIGIN` | no | Public backend origin for CORS verification, for example `https://your-backend-domain.example`. |
| `ADMIN_PUBLIC_ORIGIN` | no | Public admin origin expected in `CORS_ORIGINS`, for example `https://your-admin-domain.example`. |

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

The backend rsync also excludes the separately synced `${DEPLOY_PATH}/database/` tree and the server-side `.npm-cache/` used by `backend/package.json`'s `start:prod` script.

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
- `WECOM_PROVIDER_CORP_ID`
- `WECOM_SUITE_ID`
- `WECOM_SUITE_SECRET`
- `WECOM_CALLBACK_TOKEN`
- `WECOM_CALLBACK_AES_KEY`
- `WECOM_DATA_CALLBACK_TOKEN`
- `WECOM_DATA_CALLBACK_AES_KEY`
- `WECOM_LOGIN_SUITE_ID`
- `WECOM_LOGIN_SUITE_SECRET`
- `WECOM_LOGIN_CALLBACK_TOKEN`
- `WECOM_LOGIN_CALLBACK_AES_KEY`
- `WECOM_AUTH_LAUNCH_TOKEN`
- `WECOM_INSTALL_REDIRECT_URI`
- `WECOM_SENSITIVE_REDIRECT_URI`
- `WECOM_ADMIN_LOGIN_REDIRECT_URI`
- `CORS_ORIGINS`

### Required env reconciliation gate

The real server `.env` is deliberately protected from Git sync. Therefore, every deployment that changes `.env.example` must reconcile new key names into the existing `.env` before migration, build, or restart. Pulling or deploying code does not perform this merge automatically.

Run this from `${BACKEND_DEPLOY_PATH}` after files are synced. It reports missing key names without printing any values:

```bash
comm -23 \
  <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' .env.example | sort -u) \
  <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' .env | sort -u)
```

No output means every template key exists in `.env`. Output means those keys must be reviewed and added; never copy `.env.example` over an existing production `.env`, because that would replace real secrets with placeholders.

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
4. In BaoTa, install backend dependencies from `${BACKEND_DEPLOY_PATH}` with `npm ci`.
5. Build backend with `npm run build`.
6. Install database dependencies from `${BACKEND_DEPLOY_PATH}/database` with `npm ci`.
7. From `${BACKEND_DEPLOY_PATH}`, load the root `.env` explicitly and run `node --env-file=.env database/scripts/migrate.cjs`.
8. From `${BACKEND_DEPLOY_PATH}`, run `node --env-file=.env database/scripts/db-check.cjs`.
9. Start or restart the Node project.

For later code-only deployments, GitHub Actions syncs source and database assets. BaoTa can then run:

```bash
node --env-file=.env database/scripts/migrate.cjs
node --env-file=.env database/scripts/db-check.cjs
npm run start:prod
```

Do not run plain `npm run migrate` from the `database/` directory on this deployment layout: Node does not automatically load the parent directory's `.env`, so the migration process will fail with `DATABASE_URL is required`.

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

Also verify the admin cross-origin preflight, especially after adding or changing mutating admin endpoints:

```bash
npm run verify:cors -- https://your-backend-domain.example https://your-admin-domain.example
```

This check must report that the admin origin may `PATCH` the backend. A failure means the running backend build or proxy CORS policy is stale or incomplete.

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
WECOM_SENSITIVE_REDIRECT_URI=https://your-backend-domain.example/api/v1/wecom/member-sensitive/callback
WECOM_ADMIN_LOGIN_REDIRECT_URI=https://your-admin-domain.example/
WECOM_INSTALL_BASE_URL=https://open.work.weixin.qq.com/3rdapp/install
STORAGE_DRIVER=local
STORAGE_LOCAL_ROOT=/data/business-card-saas/uploads
STORAGE_MAX_UPLOAD_BYTES=5242880
STORAGE_MAX_VIDEO_UPLOAD_BYTES=524288000
```

`WECOM_ADMIN_LOGIN_REDIRECT_URI` is the public admin web page that receives WeCom `code` and `state`, not the backend JSON exchange endpoint. The admin page then calls `/api/v1/admin/auth/wecom/scan-callback` to complete the login.

If the admin web app calls this API from another domain, include that admin origin in `CORS_ORIGINS`, for example:

```env
CORS_ORIGINS=https://your-admin-domain.example
```

If the admin UI is not deployed yet, keep the final admin domain blank until it exists; WeCom server-to-server callbacks do not depend on browser CORS.

For local file storage, `STORAGE_LOCAL_ROOT` is optional. If it is empty or missing, the backend stores uploaded files under `storage/uploads` relative to the process working directory. In production, set it to a persistent server path and make sure the app process can create and write that directory. `STORAGE_MAX_UPLOAD_BYTES` controls ordinary image/media uploads, and `STORAGE_MAX_VIDEO_UPLOAD_BYTES` controls video uploads; the video API also respects each tenant's enabled video capability and effective size limit.

## WeCom Third-Party SaaS Configuration

The `WECOM_*` suite and callback variables in `.env` are provider-level settings for this SaaS application's Enterprise WeChat third-party suite. They are not a customer's CorpID, AgentID, or app secret.

Tenant companies connect by authorizing this third-party suite. After authorization, the backend stores each company's `open_corpid`, encrypted `permanent_code`, `agent_id`, and related status in the database `tenants` table. That is how one fixed SaaS suite supports many Enterprise WeChat companies.

Configure these URLs in the Enterprise WeChat third-party app / service provider console:

| Purpose | URL |
|---------|-----|
| Authorization redirect | `https://your-backend-domain.example/api/v1/wecom/authorization-complete` |
| Command callback | `https://your-backend-domain.example/api/v1/wecom/callbacks/command` |
| Data callback | `https://your-backend-domain.example/api/v1/wecom/callbacks/data` |
| Login authorization callback | `https://your-backend-domain.example/api/v1/wecom/callbacks/login` |

Keep the callback Token and EncodingAESKey values consistent between the Enterprise WeChat console and the server `.env`:

```env
WECOM_SUITE_ID=wwsuite_real_value_from_wecom
WECOM_SUITE_SECRET=real_suite_secret_from_wecom
WECOM_CALLBACK_TOKEN=real_command_callback_token
WECOM_CALLBACK_AES_KEY=real_43_character_command_encoding_aes_key
WECOM_DATA_CALLBACK_TOKEN=real_data_callback_token
WECOM_DATA_CALLBACK_AES_KEY=real_43_character_data_encoding_aes_key
WECOM_LOGIN_SUITE_ID=ww_login_authorization_suite_id
WECOM_LOGIN_SUITE_SECRET=real_login_authorization_suite_secret
WECOM_LOGIN_CALLBACK_TOKEN=real_login_authorization_callback_token
WECOM_LOGIN_CALLBACK_AES_KEY=real_43_character_login_authorization_encoding_aes_key
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
2. Confirm `${BACKEND_DEPLOY_PATH}/.env` exists, run the required env reconciliation gate, and add every newly introduced key with a reviewed production value.
3. Push a change under `backend/**` or run the workflow manually.
4. After first deployment or any schema change, run `node --env-file=.env database/scripts/migrate.cjs` and `node --env-file=.env database/scripts/db-check.cjs` from `${BACKEND_DEPLOY_PATH}`.
5. In GitHub Actions, confirm `Deploy Backend` passes verification and sync.
6. On the server, confirm the backend is built/restarted by the panel or `DEPLOY_RESTART_COMMAND`.
7. Verify `/api/v1/health/ready`.
8. Verify CORS preflight with `npm run verify:cors -- https://your-backend-domain.example https://your-admin-domain.example`.

## Rollback

This workflow syncs source into the root path directly. Rollback is therefore a Git rollback:

1. Revert the bad commit or push a known-good commit to `main`.
2. Let the deploy workflow sync again.
3. Rebuild/restart on the server.
