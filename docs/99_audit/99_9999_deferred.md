# 99_9999 — Deferred

| Audit File | ID | Summary | Reason | Planned Fix |
|------------|----|---------|--------|-------------|
| 99_38_daily_identity_audit.md | S-P2-1 | `switch-identity` / `identities` endpoints lack `@Throttle` | Low risk: authenticated surface, invalid IDs return 403; not an active exploit path | Add a modest throttle when hardening the authenticated API surface |
| 99_38_daily_identity_audit.md | B-P2-3 | Race in `findOrCreateAccount` (SELECT-then-INSERT) on first login | Rare: login throttled + `wx.login` codes single-use; worst case is a transient 500 on double-tap first login | Switch to `INSERT ... ON CONFLICT (primary_wx_openid) DO UPDATE ... RETURNING id` or retry on unique violation |
