# 99_55 — 小程序 wx-login 连接失败排查交接报告 — 2026-07-10

> 状态：**已定位根因（2026-07-11）**。根因见 §11。原「未解决/进行中」记录保留在下方，供追溯。

---

## 11. 根因定位（2026-07-11 续查）

### 结论（一句话）

**问题不在你的代码、后端、nginx 或证书，而在服务器网络入口前的一台上游设备做了「SNI 域名白名单」过滤：`moread.yuanyin.design` 在白名单内，`wecomcard.yuanyin.design` 不在。** 任何客户端（微信、Windows openssl、curl）只要 TLS ClientHello 里的 SNI 是 `wecomcard.yuanyin.design`，就在握手前被上游设备发 RST 掐断；浏览器"能过"只是因为它对 RST 会自动重试且此前可能命中过缓存，本质上外部严格客户端普遍连不上（与 §8 SSL Labs 失败一致）。

### 决定性证据（同一 IP `211.149.165.251`，从本地 Windows 直连，绕开微信缓存）

| 测试 | SNI / Host | 结果 |
|------|-----------|------|
| 原始 TCP 三次握手到 :443 | — | **成功**（`connect_time=0.10s`）——TCP/端口/路由都正常 |
| TLS 握手 :443 | SNI=`moread.yuanyin.design` | **成功**，拿到 moread 真证书，`TLS_AES_256_GCM_SHA384` |
| TLS 握手 :443 | SNI=`wecomcard.yuanyin.design` | **写 ClientHello 即 `errno=10054`（RST）**，收到 0 字节 |
| TLS 握手 :443 | SNI=`bogus.example.com` | **RST**（同上） |
| TLS 握手 :443 | SNI=`yuanyin.design` / `www.` / `test.` | **全部 RST** |
| TLS 握手 :443 | **无 SNI** | 通过 → 命中源站 nginx 默认 server 的自签证书（`Verify 18`） |
| HTTP :80 | Host=`moread.yuanyin.design` | **200** |
| HTTP :80 | Host=`wecomcard.yuanyin.design` | **502**，响应头带 `Proxy-Connection: keep-alive` + `Content-Length: 0`（典型上游代理拦截特征，非源站 nginx 输出） |
| HTTP :80 | Host=`bogus` / `yuanyin.design` / `www.` / `test.` | 未白名单域回 502，已白名单/基础域回 200 |

**推理链：**
1. TCP 能通、无 SNI 能握手 → 端口、路由、源站默认 server 全部正常，**排除源站问题**（也印证 §3 里本机 `curl 127.0.0.1` 一切 200）。
2. 唯独把 SNI 换成 `wecomcard` 就在**发出 ClientHello 后立刻被 RST**（`errno 10054`，收 0 字节）→ 断连由 **ClientHello 里的 SNI 字符串**触发，是**应用层 SNI 过滤**，不是 TCP 层、不是证书层（证书层的话会先完成握手再发 TLS alert，而不是握手前 RST）。这与 §4 tcpdump「握手完成后、TLS ClientHello 前客户端 RST」现象、§7「握手前中止更像基于域名的决定」完全吻合——只是掐断方是**上游中间盒**，被本机 TCP 栈表现为 10054。
3. `moread` SNI 放行、`wecomcard`/其它子域/伪造域一律 RST → **上游设备持有一份域名白名单，moread 已报备/加白，wecomcard 未报备/未加白。**
4. 服务器在**成都 CHINANET 四川电信 IDC**（`AS38283 CHINANET SiChuan Telecom Internet Data Center`）。国内 IDC 普遍在接入层对每个对外提供 80/443 服务的域名做**独立"域名报备/加白"**（区别于全国 ICP 备案）。moread 报备过、wecom 没报备（或换域名/换证书后未重新报备），edge 防护就对未报备域名的 SNI 直接 RST，对未报备 Host 的 HTTP 回 502。

这也解释了此前所有"换证书无效"——**换证书改变不了 SNI 里的域名字符串**，白名单认的是域名，不是证书。

### 修复动作（运维侧，非代码）

根因在服务器接入商的网络边缘，**代码库/nginx/证书都改不了**。按优先级：

1. **【主修复】向 IDC 接入商（成都电信 IDC / 你买服务器的服务商，宝塔只是面板不负责这层）提交 `wecomcard.yuanyin.design` 的域名报备/加白工单**，说明"同服务器 `moread.yuanyin.design` 已可正常访问，请对新域名 `wecomcard.yuanyin.design` 做同样的接入报备/加白"。这是 moread 能通、wecom 不能通的唯一差异面。
2. 一并向接入商确认：是否有"云清洗/高防/CC 防护/域名报备系统"对未报备域名默认拦截；`wecomcard` 的 ICP 备案号是否已在**该接入商的备案接入**里登记（ICP 备案在工信部通过 ≠ 已在这家 IDC 的接入白名单里登记）。
3. 若接入商加白需时间，可临时验证方案：把小程序 `apiBase` 与「request 合法域名」临时切到**已白名单的 `moread.yuanyin.design`**（在其 nginx 上加一个 `location /wecom-api/ proxy_pass http://127.0.0.1:3030/`），确认放行后请求即通——用于隔离验证，不作长期方案。

### 修复后验证方法（可执行，判定是否真修好）

在本地 Windows（严格外部客户端，不吃微信缓存）跑：
```powershell
"Q" | openssl s_client -connect 211.149.165.251:443 -servername wecomcard.yuanyin.design
```
- **修好**：能完成握手、拿到 `CN=wecomcard.yuanyin.design` 证书、`Verify return code: 0`（与当前 `moread` 表现一致），不再 `errno 10054`。此时小程序清缓存后即可登录。
- **未修好**：仍 `write:errno=10054` / 收 0 字节 → 接入商尚未加白，继续跟进工单。

辅助：`curl.exe -I -H "Host: wecomcard.yuanyin.design" http://211.149.165.251/` 从 502 变 200。

---

## 12. 白名单加白后新症状：wx-login 返回 500（2026-07-11 续查·已修）

加白后 SNI 拦截消失，请求首次真正打到后端，登录提示从 `ERR_CONNECTION_CLOSED` 变成 **HTTP 500**。

### 复现与隔离

从本地严格外部客户端验证（此时 TLS 已通、health 200）：

| 请求 | 结果 | 说明 |
|------|------|------|
| `GET /api/v1/health` | 200 | 后端存活 |
| `POST /wx-login {code:"test123"}` | 502 `code:50001` `40029 invalid code` | 假 code 在 `jscode2session` 被微信挡下（HttpException→502），**走不到写库** |
| `POST /wx-login {code:"demo-wx-code"}` | 502 `40029` | demo 通道已按 99_54 关闭（未走 demo 分支，说明生产 `DEMO_AUTH_ENABLED` 已为 false ✅） |
| `POST /wx-login {code:""}` | **500** `internal server error` | 暴露一个**独立 bug**：controller 的 `authCodeRequestSchema.parse()` 抛的 `ZodError` 不是 `HttpException`，掉进全局过滤器 500 兜底（本应 400） |

- 小程序端发的是 `wx.login()` 返回的真实 code（[miniprogram/utils/auth.js](../../miniprogram/utils/auth.js) → `{ code }`），前端无误。
- 真实 code 能通过 `jscode2session` 拿到 openid，随后进入 `PersonalIdentityRepository.provisionFromWxSession` 的写库事务 → 抛出非 `HttpException` 异常 → 全局过滤器替换成通用 500，**真实堆栈只按 `trace_id` 记在服务器 pino 日志**（99_54 的错误屏蔽加固所致）。
- **关键背景：这是生产环境第一次有真实 code 走到写库事务**——此前所有真实登录都被 §11 的 SNI 拦截挡在门外，只测过假 code 的 40029；本地开发无 `DATABASE_URL` 走内存分支、单测用 Fake DB，**这段 RLS 写路径从未被真正执行过**。

### 根因：provisioning 事务未设置 RLS 会话上下文

- `provisionFromWxSession` 用 `database.transaction` **裸事务**，不经过 [tenant-tx.service.ts](../../backend/src/database/tenant-tx.service.ts)（该封装专门 `set_config('app.tenant_id'|'app.account_id')`）。
- 事务内写序：`accounts`（无 RLS）→ `tenants`（无 RLS）→ **`member_identities`（RLS 开）** → `account_identity_bindings`（RLS）→ `cards`（RLS）→ `account_preferences`（RLS）。
- [rls.sql](../../database/rls.sql) 对这些表启用 `USING (tenant_id = current_setting('app.tenant_id', true)::bigint)`（bindings 另有 `account_id` 策略）。裸事务里该 GUC 未设 → `NULL::bigint` → INSERT 的 WITH CHECK 不满足 → **RLS 拒绝写入 `member_identities`** → pg 报错 → 500。
- 运行角色受 RLS 约束的佐证：[database/README.md](../../database/README.md) 明确 public 读取「without granting BYPASSRLS」、迁移用单独 admin 角色、`db-verify` 专门证明 tenant RLS 隔离生效——即 app 运行角色非 owner、非 BYPASSRLS。

> 说明：本机无 Docker/psql、无生产库凭据，无法直接 psql 复现确认；上述为基于代码+RLS 策略+README 的高置信度推断。修复对两种情形都安全：角色受 RLS 约束时为必需，角色恰好绕过 RLS 时 `set_config` 仅设一个无人读的 GUC、无副作用。

### 修复（已提交，含回归测试）

1. **[personal-identity.repository.ts](../../backend/src/auth/personal-identity.repository.ts)**：在 `provisionFromWxSession` 建好 account+tenant、拿到 id 后、写第一张 RLS 表前，注入 `set_config('app.account_id'|'app.tenant_id', ..., true)`（新增私有 `setRlsContext`）。回归测试断言上下文在 `INSERT INTO member_identities/cards/account_identity_bindings` **之前**、且在 `accounts/tenants` **之后**执行。
2. **[api-exception.filter.ts](../../backend/src/common/api-exception.filter.ts)**：`ZodError` → 400 `invalid request payload`（不回显字段细节），修掉「空/畸形 body 返回 500」。含新增过滤器测试。
3. 验证：`npm run lint` 通过、`npx tsc --noEmit` 通过、`npx jest` **37 套件 161 测试全绿**。

### 部署后线上验证方法

部署后端并重启后，用真机「预览」登录，应从 500 变为登录成功。若仍 500：抓服务器 pino 日志里该 `trace_id` 对应的 `Unhandled exception trace_id=... :` 行拿到真实 pg 报错，即可精确定位（当前推断之外的次要可能：某张表迁移缺失/列缺失）。

### 残留风险（同类隐患，本次未改，需另行决策）

`listAccountIdentities` / `switchIdentity` / `preferredAccountIdentity` 同样用裸事务读 RLS 表且**未设上下文**：新鲜个人用户登录本身不受影响（登录响应里的 identities 由已修好的 provisioning 事务返回），但**登录后单独调用 `GET /auth/identities`、切换身份可能返回空/403**。彻底修复涉及「一个 account 跨多 tenant 如何在单一 tenant 上下文下列举」的设计取舍（member_identities/cards 仅有 tenant 策略），故本次仅标注、不擅自扩大改动。

---

<details>
<summary>以下为 2026-07-10 原始交接记录（状态：当时未解决），保留供追溯</summary>

> 状态：**未解决（进行中）**。本文记录已排查路径、证据与结论，供接手者继续。

## 1. 症状

微信小程序发往生产域名的**任何请求**都失败：

```
POST https://wecomcard.yuanyin.design/api/v1/auth/wx-login
net::ERR_CONNECTION_CLOSED
errMsg: "request:fail"
(env: Windows,mp,2.01.2510260; lib: 3.16.2)
```

- 连最简单的 `GET /api/v1/health` 在小程序里也是同样的 `ERR_CONNECTION_CLOSED`。
- **开发者工具（Windows 模拟器）和真机（4G）都失败。**
- **同一台电脑的浏览器访问同一域名/接口却完全正常（200）。**

## 2. 环境

| 项 | 值 |
|----|----|
| 服务器 | `211.149.165.251`（国内 IDC，宝塔面板 BT-Panel），公网 IP 直接绑在 eth0，无 NAT |
| 后端 | NestJS + Fastify，监听 `127.0.0.1:3030`，`npm run start:prod`（该脚本每次会 `npm install && npm run build && node --env-file=.env dist/main.js`） |
| 反代 | nginx，站点配置 `/www/server/panel/vhost/nginx/node_wecom_card.conf`，`proxy_pass http://127.0.0.1:3030` |
| 域名 | `wecomcard.yuanyin.design`，**已 ICP 备案** |
| 小程序 | AppID `<MINIPROGRAM_APPID>`，`apiBase = https://wecomcard.yuanyin.design/api/v1` |
| **对照项目** | **moread**（`moread.yuanyin.design` → `127.0.0.1:3001`，**同一台服务器、同一个 nginx**）——**小程序连接完全正常** |

对照项目 moread 是本次排查的关键：它证明服务器、nginx、网络、备案、微信客户端全都没问题，问题被隔离到 **wecom 这个站点独有的因素**。

## 3. 已排除项（含证据）

| # | 排除项 | 证据 |
|---|--------|------|
| 1 | 后端挂了 | 本机 `curl 127.0.0.1:3030/api/v1/health` → 200；`POST .../wx-login {code:"test123"}` → **502 `WeChat jscode2session failed: 40029 invalid code`**（微信真实响应）——证明后端、DB、出网访问 `api.weixin.qq.com`、wx-login 路由全部正常 |
| 2 | nginx 反代/可达性 | 本机带 Host 头 `curl 127.0.0.1`（80 和 443）→ `/api/v1/health` 200 |
| 3 | 防火墙 | 本机 iptables INPUT 有 `--dport 80/443 -j ACCEPT`；云安全组已放行 80/443 |
| 4 | 未备案 SNI 阻断 | 域名已备案；ping.pe 全球（含成都/上海/腾讯/阿里/电信/移动/联通）0% 丢包，IP 可达 |
| 5 | 证书链不完整 / TLS 版本 | 本机 `openssl s_client 127.0.0.1:443`：证书链完整、`Verify return code: 0 (ok)`、TLS1.3 与 TLS1.2（`ECDHE-RSA-CHACHA20-POLY1305`）均正常 |
| 6 | request 合法域名 | 后台已配 `https://wecomcard.yuanyin.design`，与 apiBase 完全一致；AppID 匹配（`<MINIPROGRAM_APPID>`） |
| 7 | 微信端校验 | 开发者工具"不校验合法域名/TLS/证书"**已勾选**，仍失败 |
| 8 | 本机代理/VPN（Windows） | 关掉后仍失败；且**真机 4G（不同设备/网络/IP）行为完全一致**，排除本机代理 |
| 9 | 微信网络本身坏了 | 同一开发者工具里 `wx.request('https://www.baidu.com')` → **`BAIDU OK 200`**，微信能做 HTTPS |

## 4. 抓包关键证据（服务器 tcpdump）

> ⚠️ 注意：第一次用 `tcp[tcpflags] & tcp-syn` 过滤器在 `-i any`（LINUX_SLL2 cooked 抓包）下**不可靠，会假报 0 包**。改用 `tcp port 443` 后正常。

**浏览器（219.159.103.75）访问 health —— 完整成功：**
```
In  55006>443 [P.] len 66      ← ClientHello
Out 443>55006 [P.] len 797     ← ServerHello + 证书
...继续收发数据，200 ✅
```

**小程序（开发者工具，同 IP 219.159.103.75）与真机（4G，111.55.11.130）—— 每次都这样：**
```
In  50103>443 [S]        ← 客户端发起
Out 443>50103 [S.]       ← 服务器正常 SYN-ACK
In  50103>443 [.] ack 1  ← TCP 三次握手完成
In  50103>443 [R]        ← 0.6ms 后客户端自己 RST，之前没发任何 TLS 数据
```

**结论：连接到达了服务器，服务器 SYN-ACK 正常；是客户端（微信）在 TCP 握手完成后、发 TLS ClientHello 之前，主动 RST 掉连接。** 浏览器不会这样。

## 5. 决定性对照：moread（正常）vs wecom（失败），同一 nginx

`diff node_moread.conf node_wecom_card.conf`：两者结构一致（同宝塔模板，`ssl_protocols`/`ssl_ciphers` 相同，均 `http2 on`）。差异仅：server_name、证书路径、`proxy_pass` 端口（3001 vs 3030）、moread 多一个 `/agent/ws` websocket location、各自 include 的子配置文件不同、日志路径。

**原始证书差异（当时的头号线索）：**

| | moread（正常） | wecom（失败，换证书前） |
|---|---|---|
| CA | **Certum**（Asseco Data Systems） | DigiCert "Encryption Everywhere DV TLS CA - G2" |
| 证书链 | **4 张，完整到根** | **2 张**（叶子 + 1 中间，根 DigiCert Global Root G2 未下发） |

## 6. 已采取的措施及结果

**措施**：把 wecom 的证书从 DigiCert 换成 **Certum**，现与 moread 同款——4 张全链、有效期正常、SAN 正确：
```
0 s: wecomcard.yuanyin.design
1 s: Certum DV TLS G2 R39 CA
2 s: Certum Trusted Root CA
3 s: Certum Trusted Network CA
notBefore=Jul 10 12:08:35 2026 GMT / notAfter=Jan 25 12:08:34 2027 GMT
```

**结果**：**仍然失败**，小程序登录依旧 `ERR_CONNECTION_CLOSED`。

→ 说明**证书 CA/链类型不是（唯一）根因**，或微信缓存了旧的校验结果。

## 7. 当前矛盾点（供接手者重点思考）

- 抓包显示客户端在 **TLS ClientHello 之前**就 RST。若真是"证书不被信任"，应在收到证书后才断（TLS alert），而非握手前。**"握手前中止"更像客户端基于域名的缓存策略决定不连。**
- moread 与 wecom 唯一面向用户的差异是**域名**。微信在连接前唯一能知道的也是域名。**强烈怀疑微信服务端对 `wecomcard.yuanyin.design` 的域名安全校验缓存了"失败"状态**（可能是用旧的 DigiCert 证书时校验失败留下的），导致客户端拒连。
- 佐证：**SSL Labs 对 wecom 的评估也失败**（"Assessment failed: Internal Server Error"，提示词含 "connection rate limits / block connections in response to unusual traffic / multiple TLS servers behind the same IP"）——严格外部客户端普遍连不上 wecom，浏览器却能过。换证书后尚未复测 SSL Labs。

## 8. 待执行的下一步（未完成）

1. **Windows 上用 openssl 直连对比**（严格外部客户端、不吃微信缓存），判断换证书后 wecom 的 TLS 到底能否完成：
   ```powershell
   "Q" | openssl s_client -connect wecomcard.yuanyin.design:443 -servername wecomcard.yuanyin.design
   "Q" | openssl s_client -connect moread.yuanyin.design:443 -servername moread.yuanyin.design
   ```
   - wecom 现在能握手（Verify 0、拿到链）→ 服务器已修好，微信失败=缓存 → 重启开发者工具/清缓存/删除重加 request 合法域名触发微信重新校验。
   - wecom 仍失败、moread 成功 → 服务器端还有针对 wecom 的连接重置源，非证书。

2. **对比两站点独立 include 文件**（找 wecom 独有的 CC/WAF/限流/deny 规则）：
   ```bash
   cat /www/server/panel/vhost/nginx/extension/wecom_card/*.conf
   cat /www/server/panel/vhost/rewrite/node_wecom_card.conf
   cat /www/server/panel/vhost/nginx/extension/moread/*.conf
   cat /www/server/panel/vhost/rewrite/node_moread.conf
   ```

3. **微信服务端域名校验缓存**：在小程序后台把 request 合法域名**删除后重新添加**（或重新保存），触发微信对新证书重新校验；等待数分钟；清开发者工具缓存后重试真机「预览」（非「真机调试」，后者请求可能经 PC 中转）。

4. **确认 ClientHello 是否真的发出**：`tcpdump -i any -n -X 'tcp port 443'` 抓包内容，区分"客户端发了 ClientHello 后被拒"还是"握手前中止"。

5. **复测 SSL Labs / myssl.com**（换证书后）：`https://myssl.com/wecomcard.yuanyin.design` 看微信/各客户端兼容性栏，与 moread 对比。

6. **排查是否有安全设备/宝塔 Nginx 防火墙/CC 防护/fail2ban** 针对 wecom：
   ```bash
   ls /www/server/panel/plugin/ | grep -iE "firewall|waf|btwaf"
   fail2ban-client status; fail2ban-client status nginx
   ```

## 9. 本次排查顺带修复（与本连接问题无关，已提交）

- **DEMO_AUTH_ENABLED 强转坑**：`z.coerce.boolean()` 把 `"0"/"false"` 当 true，导致生产启动崩溃、旧 dist 一直不更新（wx-login 曾 404）。已改严格解析 + 回归测试。提交 `da00543`。
- **审计 99_54 加固**：metrics 端点鉴权、500 错误信息屏蔽、pino 日志脱敏。提交 `c770ef4`。
- **小程序 wxml 根节点缺失闭合标签**、登录按钮与原生 tabBar 间隙。已修。

## 10. 一句话总结

后端、数据库、微信对接、nginx、备案、合法域名、TLS 配置**均已验证正常**；对照项目 moread 在同服务器同 nginx 上小程序连接正常。问题隔离在 **wecom 站点独有因素**，现象为**微信客户端 TCP 握手后、TLS 前主动 RST**。已把证书换成与 moread 同款 Certum 全链但**仍未解决**。下一步应优先：**① Windows openssl 判断 TLS 是否已修好 ② 触发微信对该域名重新校验（删除重加合法域名）③ 检查 wecom 独立 include 是否有拦截规则**。

> **2026-07-11 补充：§8 第 1 项已执行并定位到根因——见文首 §11。** 结论：不是证书、不是 nginx、不是微信缓存，而是**服务器接入商边缘对 `wecomcard.yuanyin.design` 的 SNI 做了白名单拦截（未报备/未加白），moread 已加白**。修复=向 IDC 接入商提交该域名报备/加白工单。

</details>
