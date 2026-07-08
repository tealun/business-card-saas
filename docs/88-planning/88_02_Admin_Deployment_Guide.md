# 88_02 Admin Deployment Guide

## Scope

This guide documents the GitHub Actions static deployment flow for the `admin/` directory.

- Workflow: `.github/workflows/deploy-admin.yml`
- Trigger: push to `main` when `admin/**` or the workflow changes; manual `workflow_dispatch`
- Target path: configured by GitHub Actions secret `ADMIN_DEPLOY_PATH`
- Sync strategy: `rsync --delete` from local `admin/` to `${ADMIN_DEPLOY_PATH}/`
- Runtime model: static hosting through Nginx, BaoTa static site, COS, or any equivalent web root

## Variable Strategy

Admin-specific variables are resolved first. Generic deployment variables are used only as fallbacks for same-server deployments.

Use this split when backend and admin are on different servers:

| Concern | Backend | Admin |
|---------|---------|-------|
| Host | `DEPLOY_HOST` or `SSH_HOST` | `ADMIN_DEPLOY_HOST` |
| User | `DEPLOY_USER` or `SSH_USER` | `ADMIN_DEPLOY_USER` |
| Port | `DEPLOY_PORT` or `SSH_PORT` | `ADMIN_DEPLOY_PORT` |
| Path | `BACKEND_DEPLOY_PATH` or `DEPLOY_PATH` | `ADMIN_DEPLOY_PATH` |
| SSH key | `DEPLOY_SSH_KEY` / `SSH_PRIVATE_KEY` / `SSH_KEY` | `ADMIN_DEPLOY_SSH_KEY` |
| Password | `DEPLOY_PASSWORD` or `SSH_PASSWORD` | `ADMIN_DEPLOY_PASSWORD` |
| Reload command | `DEPLOY_RESTART_COMMAND` | `ADMIN_DEPLOY_RESTART_COMMAND` |

If admin and backend are on the same server, configure only `ADMIN_DEPLOY_PATH` plus the existing backend `DEPLOY_*`/`SSH_*` credentials.

## GitHub Secrets

Configure these in GitHub:

`Settings -> Secrets and variables -> Actions`

Required target path:

| Secret | Required | Notes |
|--------|----------|-------|
| `ADMIN_DEPLOY_PATH` | yes | Absolute server directory for static admin files, for example `/www/wwwroot/wecom_card_admin`. |

Server identity:

| Secret | Required | Notes |
|--------|----------|-------|
| `ADMIN_DEPLOY_HOST` | required for separate admin server | Server IP or hostname. Falls back to `DEPLOY_HOST`, then `SSH_HOST`. |
| `ADMIN_DEPLOY_USER` | required for separate admin server | SSH user. Falls back to `DEPLOY_USER`, then `SSH_USER`. |
| `ADMIN_DEPLOY_PORT` | no | SSH port. Falls back to `DEPLOY_PORT`, then `SSH_PORT`, then `22`. |

Authentication, choose one:

| Secret | Required | Notes |
|--------|----------|-------|
| `ADMIN_DEPLOY_SSH_KEY` | optional | Preferred for a separate admin server. Falls back to `DEPLOY_SSH_KEY`, `SSH_PRIVATE_KEY`, or `SSH_KEY`. |
| `ADMIN_DEPLOY_PASSWORD` | optional | Password fallback. Falls back to `DEPLOY_PASSWORD` or `SSH_PASSWORD`. |

Optional reload:

| Secret | Required | Notes |
|--------|----------|-------|
| `ADMIN_DEPLOY_RESTART_COMMAND` | no | Server-side shell script run after sync from `${ADMIN_DEPLOY_PATH}`. Usually empty for static hosting. |

## Protected Server Files

The deploy job uses `rsync --delete`, but excludes common server-owned files:

- `.env`, `.env.local`, `.env.*.local`
- `*.log`, `logs/`
- `certs/`
- `uploads/`
- `cache/`, `tmp/`
- `.git/`, `.vscode/`

Keep admin runtime configuration in browser storage or server-side web server config. Do not commit environment-specific secrets into `admin/`.

## Suggested Server Setup

Create the static web root once:

```bash
ADMIN_DEPLOY_PATH=/www/wwwroot/wecom_card_admin
mkdir -p "$ADMIN_DEPLOY_PATH"
```

Bind the admin domain to that directory in Nginx/BaoTa, then set the backend `.env` `CORS_ORIGINS` to include the admin origin, for example:

```env
CORS_ORIGINS=https://your-admin-domain.example
```

The admin page resolves API base automatically when hosted over HTTP(S): it uses the current origin plus `/api/v1` unless the browser has `bc_api_base` in local storage.

## Deployment Checklist

1. Configure `ADMIN_DEPLOY_PATH`.
2. Configure admin-specific SSH secrets if admin deploys to a different server; otherwise reuse the backend deploy credentials.
3. Push a change under `admin/**` or run `Deploy Admin` manually.
4. Verify the GitHub Actions `Deploy Admin` workflow passes.
5. Open the admin domain and confirm API Base points at the intended backend.

## Rollback

This workflow syncs static files into the target path directly. Rollback is a Git rollback:

1. Revert the bad commit or push a known-good commit to `main`.
2. Let the deploy workflow sync again.
3. Clear browser cache if the old static assets are still visible.
