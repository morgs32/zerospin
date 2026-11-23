# 294 — Document incompatible Aggregate browser bundles

Keep existing error handling and teach browser users how to respond when the
deployed System no longer provides the Aggregate release in their app bundle.

1. Extend Fragment’s versioning and deployment handbook. Use a V9-to-V10
   example that distinguishes promotion, browser bundle deployment, and
   release removal. Explain the limits of refresh for incompatible local-only
   commands and the separate review of admitted commands and retained history.
2. Give the two existing unavailable-release codes the same refresh guidance.
   Use it for missing releases in GatewayApi, AggregateApi, session ticket
   issuance and command reads. Socket push rejection already uses the default.
   Keep the command-read capability mismatch code and message.
3. Verify the native System API Workerd suite and Fragment build. Confirm the
   existing codes and the two message paths. Keep the browser lifecycle,
   response shapes and System registry behavior intact.
4. Reconcile the glossary if terminology changed and archive this plan after
   verification. Storage changes and production deployment are separate work.

The [research note](../../research/browser-session-refresh-required.md) covers
the broader refresh-screen design. This plan implements the smaller
documentation and message change.

After V10 becomes canonical, a V9 tab still uses V9 while it remains registered. Once V9 is removed, the same missing-release error can guide the
user to refresh into the published V10 bundle. If the refreshed bundle still
requests V9, the deployment needs investigation.

```text
zerospin/
├── fragment/content/handbook/~ versioning-and-deployment.md
├── packages/
│   ├── error/src/~ defaultErrorMessages.ts
│   ├── system-worker/src/
│   │   ├── AggregateApi/admit/admitAggregate/~ admitAggregate.ts
│   │   ├── AggregateSessionApi/
│   │   │   ├── createWebSocketTicket/~ createWebSocketTicket.ts
│   │   │   └── getBrowserCommands/~ getBrowserCommands.ts
│   │   └── GatewayApi/aggregate/~ aggregate.ts
│   └── system-worker/tests/native-system-api/~ native-system-api.workerd.spec.ts
└── wiki/archive/plans/+ 294-plan-incompatible-aggregate-browser-bundles.md
```

`+` creates a file. `~` modifies a file.

## Verification

1. The native System API Workerd suite passed all nine tests. The existing
   Aggregate fixture verified that requesting an unregistered release includes
   refresh guidance and that a command-read capability mismatch keeps its
   previous message.
2. A direct check of both compiled error defaults confirmed the original codes
   and approved copy. Scoped formatting and the diff check passed.
3. The Fragment build passed on retry and generated the updated handbook page.
   The first invocation generated all pages and then exited at the installed
   Next.js 16.4.0 security upgrade notice. The standard build passed on the
   next invocation without a dependency change.
4. The existing glossary covers session locks and terminal session failures.
   This documentation and copy change introduces no new domain terminology.

## Remaining work

None.
