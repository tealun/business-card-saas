# 99_55 — 小程序 wx-login 连接失败排查交接报告 — 2026-07-10

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
| 小程序 | AppID `wx9927ec4d4239bb6f`，`apiBase = https://wecomcard.yuanyin.design/api/v1` |
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
| 6 | request 合法域名 | 后台已配 `https://wecomcard.yuanyin.design`，与 apiBase 完全一致；AppID 匹配（`wx9927ec4d4239bb6f`） |
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
