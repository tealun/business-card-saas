# 88_02 Admin Deployment Guide

## Scope

This guide documents the GitHub Actions static deployment flow for the `admin/` directory.

- Workflow: `.github/workflows/deploy-admin.yml`
- Trigger: push to `main` when `admin/**` or the workflow changes; manual `workflow_dispatch`
- Target path: configured by GitHub Actions secret `ADMIN_DEPLOY_PATH`
- Sync strategy: `rsync --delete` first, with tar-over-SSH fallback from local `admin/` to `${ADMIN_DEPLOY_PATH}/`
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

The deploy job tries `rsync --delete` first, and falls back to a tar-over-SSH sync when the target shell rejects rsync. Both paths exclude common server-owned files:

- `config.js`
- `node_modules/`
- `dist/`
- `.npm-cache/`
- `database/`
- `.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.staging`
- `*.log`, `logs/`
- `certs/`
- `public/uploads/`, `uploads/`
- `data/`, `cache/`, `storage/`, `tmp/`, `runtime/`
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

## First Owner Bootstrap（首个管理员引导，一次性）

管理后台的登录与迁移执行都要求数据库里已有 owner。首个 owner 由服务器上的一次性 CLI 创建（该工具只在服务器本地运行，依赖 `.env` 里的 `DATABASE_URL` 与 `ADMIN_JWT_SECRET`，不新增任何远程入口）：

```bash
cd <backend-deploy-path>

# 查看现有租户（新库为空时会提示用 setup 创建）
node --env-file=.env scripts/admin-bootstrap.cjs list

# 创建租户 + owner + 标记基线迁移 + 签发 8 小时 owner 访问令牌
node --env-file=.env scripts/admin-bootstrap.cjs setup \
  --tenant-name "平台运营" \
  --open-userid <你的标识> \
  --mark migrate_v1_1,migrate_v1_2
```

输出末尾的 access token 粘贴到后台登录页「使用访问令牌登录」即可进入。已有租户时用 `--tenant-id` 替代 `--tenant-name`。

`--mark` 用于存量库收编：把「表结构已存在」的迁移标记为已应用（不执行），之后的迁移全部通过后台「数据库」页检测并执行。

## Console Migration Runner Requirements

后台「数据库」页可用的前提：

1. 后端 `.env` 配置 `DATABASE_DIR=database` 并重启后端（缺失时页面显示 `DATABASE_DIR is not configured`）。
2. 存量库已用 `--mark`（或 `database/scripts/migrate.cjs mark`）收编基线，否则待执行列表会包含基线迁移，执行时会因表已存在而失败。
3. 执行迁移要求 owner 角色令牌；检测只需 admin。

## Super Admin Password Login（推荐路径，2026-07-11 起）

后台首选登录方式是账号密码。初始化只需在后端 `.env` 配置：

```bash
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_PASSWORD=<至少8位初始密码>
```

后端启动时若该账号不存在则自动创建（存入 `platform_admins`，scrypt 加盐哈希）；账号已存在时永不覆盖。登录后台后用右上角「修改密码」改掉初始密码，之后 `.env` 里这两行即可删除。

前置条件：`platform_admins` 表由 `migrate_v1_4.sql` 创建——存量库需先完成一次迁移（见下），之后重启后端触发初始化。

上文的 admin-bootstrap CLI 与企微 code / 访问令牌登录保留为备用路径。
