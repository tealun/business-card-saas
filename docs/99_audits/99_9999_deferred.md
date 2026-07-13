# 99_9999 - Deferred

| Audit File | ID | Summary | Reason | Planned Fix |
|------------|----|---------|--------|-------------|
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P1-2 | Stateless token revocation | Requires a session/revocation store and logout/deactivation semantics; architecture decision outside a minimal repair. | Before production account deactivation/logout requirements are enabled. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P1-4 | WeCom circuit breaker and stale-token fallback | Requires outage policy, cache semantics, and validation against live WeCom behavior. | Before horizontal production scaling. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P1-7 | Batch contact synchronization | Changes SQL write strategy and needs representative volume/performance testing. | When contact-sync latency or tenant size warrants batching. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P2-2 | Public-card error reporting | Needs a product decision on user-visible copy and remote logging provider. | During mini-program UX/error telemetry work. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P2-3 | Shared background constants | Low-risk maintainability refactor; no runtime defect established. | Next mini-program refactor sprint. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P2-4 | Admin module split and test toolchain | Requires a deliberate admin build/test architecture; current static deployment is documented. | With the planned React/Vite migration. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P2-5 | Visit lifecycle review | Runtime duplication was not reproduced; requires mini-program lifecycle instrumentation. | When end-to-end mini-program telemetry is available. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P2-6 | Deployment smoke test and rollback | Requires deployment topology, health URL, release directory and rollback policy decisions. | Before production CD is enabled. |
| `99_59_Comprehensive_Deep_Audit_Main_at_37efe99.md` | A59-P2-10 | Public endpoint throttling | Requires traffic baseline and proxy/IP trust configuration to avoid blocking legitimate shares. | Before public traffic launch or after load testing. |
