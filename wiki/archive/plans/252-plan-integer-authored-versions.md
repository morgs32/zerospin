# Integer authored versions and V1 reset

## Agreed behavior

1. Every authored version and version reference is a positive safe integer, scoped independently to its named declaration. Preserve numeric literal inference and explicit lineage.
2. Keep numeric-keyed registries; validate their physical keys canonically. Decode version route segments into numbers with explicit Repo key codecs.
3. Carry numbers through commands, resources, projections, sessions, accepted definitions and SQL. Keep package versions, deployment IDs and artifact identities unchanged.
4. Verify the cutover, publish a breaking fixed-group release, then reset the current example systems and sibling consumer systems to revision 1 and erase their development and production Zerospin data. The user explicitly authorized this destructive data reset on 2026-10-21. Preserve credentials and unrelated source changes.
5. Reuse existing tests and fixtures. Never verify Explorer. No compatibility paths, translation migrations or legacy declarations.

## Implementation and verification

1. Convert core schemas/types, runtime owners and SQL, typed Repo names, browser/native/Studio and first-party declarations.
2. Exercise numeric literal inference, invalid revisions, canonical Repo routes and numeric command/resource storage using the existing external-work checks; run scoped Nx build/typecheck/lint tasks excluding Explorer.
3. Isolate release contents from unrelated WIP, publish the next breaking package release to the configured registry, and verify published versions.
4. Move examples and discovered consumer systems to one latest definition at revision 1, adopt exact new package versions, and verify their permitted checks.
5. Inventory and wipe only their Zerospin development/production data, deploy revision-1 definitions and verify fresh initialization. Do not reset unrelated Cloudflare services or credentials.
6. Update current docs and record evidence. Archive only after all required release/adoption/reset/deployment verification is complete.

## Reset inventory

1. Zerospin examples: Shopping and Tic-Tac-Toe. Extra local worktrees: zerospin-command-operations and zerospin-session-ui share these logical systems; their unrelated source WIP is preserved.
2. Registry consumers: qrk.sh, redropeparking, mentormailbox, stackshirts and zerospin-cloud. Zerospin Cloud also contains a vendored framework snapshot; inspect its active integration before updating it.
3. Excluded unrelated Cloudflare projects discovered during inventory: cloudflare-counter and morganatwork-email.

## Verified outcome

1. Published all 19 fixed-group packages to the configured registry at **24.0.1**, with independent version/integrity checks. Release branch `codex/integer-authored-versions` is retained locally at `3c7aa17907528976e05ae79276ca736f97b46708`. The isolated release excludes unrelated Shopping and Drizzle WIP. The 24.0.1 documentation patch preserves all 4,374 published runtime files from 24.0.0; production receipts correctly retain their deployed 24.0.0 runtime designation.
2. Package library builds, scoped lint/typechecks, seven existing behavioral checks and external-work compile-only checks passed. Existing lint warnings remain. Explorer was not verified. Current Shopping and Tic-Tac-Toe declarations are fresh integer V1 and their scoped checks passed.
3. All five siblings installed exact 24.0.1 dependencies: 106 direct pins with manifests, lockfiles and installations verified. QRK, Cloud, Mentor, Red Rope and Stackshirts permitted builds passed. All in-scope first-party declarations are revision 1.
4. Erased 795 primary SQLite databases across all 14 scoped local stores, including proof/backup/worktree stores and native simulator replicas. Credentials and unrelated source WIP were preserved.
5. Removed all 87 original scoped production Durable Object namespace IDs and created 90 fresh namespace identities. Preserved all six unrelated original namespaces. Removed two obsolete Shopping dispatch deployments. All five framework Workers accepted their V1 system specs and initialized successfully. All temporary bootstrap entrypoints were removed. Scoped R2/KV storage was empty and D1 retained no domain tables.
6. Deployed all seven existing frontend identities and verified public routes, redirects, emitted JavaScript, SharedWorkers and SQLite WASM assets. QRK canonical `https://app.qrk.sh` DNS/TLS and both Worker authorized-party configurations were verified.
7. Browser cleanup stopped at the user's explicit request on 2026-10-21. The user will clear Chrome personally; complete browser erasure is not asserted. The temporary blank reset server was stopped and its process absence verified. No further per-origin browser cleanup is part of this agent's scope.

## Evidence and verification limits

- Release and adoption: `/private/tmp/zerospin-integer-patch-24.0.1/summary.json`, `registry-verification.json` and `consumer-adoption-verification.json`.
- Reset and readiness: `/private/tmp/zerospin-reset-20261021/completion.json`, `reset-status.json`, `production-verification.json` and `local-verification.json`.
- Frontends: `/private/tmp/zerospin-reset-20261021/frontend-summary.json`, including routes/assets, deployment identities and preserved pre-existing configuration gaps.
- Browser handoff: `/private/tmp/zerospin-reset-20261021/browser-cleanup-handoff.json`.
- Authenticated application commands were not exercised. Previously absent Cloud frontends, Mentor Admin/separate API hosting and Stackshirts Stripe configuration were not provisioned. These are existing deployment gaps, recorded separately from completed reset/readiness verification.

## Remaining work

None within the agent's scope. Chrome storage clearing is owned by the user.
