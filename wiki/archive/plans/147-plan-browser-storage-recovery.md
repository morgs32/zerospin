# Automatic browser storage recovery

Status: Implemented, released, and verified.

## Goal

Implement the approved [Red Rope handoff](/Users/morgs32/GitHub/redropeparking/wiki/archive/handoffs/2026-10-13-handoff-browser-storage-recovery.md): every persistent browser aggregate, service, and standalone Node automatically resets only after the typed `node-storage-reset-required` compatibility error, then initializes once with its current declaration. Native and backend reset policy and schema versions stay unchanged.

The user accepted disposal of unsent commands and standalone-only data. There is no opt-in flag. Connected recovery must retain admission, identity verification, server baseline installation, synchronization, and publication ordering; unavailable or rejected admission must never publish an empty Node as ready. Standalone recovery installs current seed resources exactly once, including cold `session.reset()` startup.

## Implementation

1. Preserve unrelated upstream and consumer WIP. Work in the attached isolated committed upstream worktree. Reconcile the retained 8.0.0 release to committed source before preparing 9.0.0; never publish from only the older 7.0.0 baseline.
2. Add browser-owned `Node/resetNodeStorage.ts` with `{ db, assertCurrent }`. Assert ownership before mutation and commit; disable foreign keys outside `BEGIN IMMEDIATE`, drop escaped user tables excluding `sqlite_%`, clear `user_version`, and commit. Roll back failures/cancellation, retain rollback errors, restore foreign keys, and await cleanup before storage closes.
3. Recover cold initialization in all three worker families. Catch only the typed compatibility error; reset and reinitialize once outside that catch. Preserve namespace lease, handles, queued attachments, authentication, and warm reset/stale capability behavior.
4. Exclude SQLite internal tables from ServiceNode's initialization inventory. Keep core initialization strict and update existing browser/core docs. Add the agreed logging TODO to the shared reset procedure.
5. Extend only the existing `scripts/verify-session-identity.mjs` using its current SQLite fixtures, inventories, declarations, and command builders. Add no runners, fixture files, or configuration.
6. Preview the fixed-group major release, build all 19 packages, publish 9.0.0 to the retained local registry, and verify metadata/integrity with upstream pnpm 11.1.1.
7. Upgrade Red Rope's exact packages, including `system-worker`, with pnpm 9.15.9. Retarget its existing correction patch only if still needed, regenerate the lockfile, update version references, and retain Effect/platform-node-shared 4.0.2.

## Required verification

- Scoped upstream Nx library builds, lint, and typechecks; existing identity verifier.
- Recovery for aggregate/service/standalone, changed standalone declaration, compatible storage preservation, identity refusal before writes, transaction rollback/cancellation, one retry only, queued attachment reuse, `sqlite_sequence`, warm reset and stale capabilities.
- Authenticated connected snapshots and unavailable/rejected admission without readiness.
- Red Rope Nx `ts` for web/admin/partner/zerospin, Workerd suite, web lint, web/admin/Storybook builds.
- Existing Chrome profile: visitor and authenticated aggregate/service recovery; intake localStorage unchanged; affected development pages healthy after required original-command restarts.

## Evidence

- Pickup: upstream HEAD `bb225f3c9c` (7.0.0); primary checkout has uncommitted 8.0.0 release metadata, Worker naming change, and unrelated documentation WIP. Consumer retains unrelated Slack/domain WIP and a 7.0.0 correction patch.
- Reconciled committed 8.0.0 baseline: `7085e9a677953eb38fa34ebcb14eb45958dfcdfb`. All 19 retained release tarballs passed SHA512 integrity; packed source/dist comparisons prove the sole runtime delta from 7.0.0 is the generated Worker suffix. No existing 8.0.0 commit was present. The verified source was extracted from the retained tarball, excluding unrelated dirty fragment changes.
- Recovery release commit: `01caaafc30` on `codex/browser-storage-recovery`. All 19 packages published as 9.0.0 to the retained registry; registry metadata, tarball SHA512 integrity, packed framework dependency versions, the recovery module, and the retained 8.0.0 Worker naming change were verified.
- Browser reproduction before installation: both configured localhost and 127.0.0.1 visitor startup on installed 7.0.0 displayed `node-storage-reset-required`; the old standalone database was retained for automatic recovery. Intake localStorage values were captured for comparison.
- Isolated implementation checkout: `/Users/morgs32/.codex/worktrees/browser-storage-recovery/zerospin`.
- Red Rope's resolved typecheck target is `ts`; its disabled `tsc:typecheck` target does not perform validation.

## Outcome and verification

- Final upstream Nx browser/core library builds, typechecks, and lint passed. The existing identity/recovery verifier passed all six groups, including typed-only recovery, identity refusal, rollback/cancellation, all reset/rollback/foreign-key cleanup errors, one retry, queued attachment cleanup, compatible preservation, and existing warm reset/stale capability behavior. No new test runners, fixture files, or configuration were created.
- Built all 18 compiled fixed-group release packages. `server-only`, the nineteenth package, is static JavaScript with no build target. Version/changelog preview, publication dry-run, and all 19 actual publications succeeded; all published package metadata and SHA512 tarball integrity were verified. Registry storage was preserved.
- Red Rope installed exact 9.0.0 pins with pnpm 9.15.9. Its existing `system-worker` patch was retargeted without changing its bytes or behavior, and verified in installed source. Effect and platform-node-shared remain 4.0.2. Unrelated primary and consumer WIP was preserved.
- Consumer Nx `ts` passed for web, admin, partner, and zerospin. Workerd passed 9 files / 18 tests. Web lint passed with zero errors and five pre-existing unused-symbol warnings. Web/admin Next builds and Storybook build passed.
- Existing Chrome profile: the retained incompatible visitor database recovered to SQLite schema 14 and exposed the homepage. Cold authenticated aggregate and service recovery were verified by marking only their current, unowned browser Node schema metadata as 13 under the namespace lease, then observing rebuilt schema 14, authenticated server requests, resumed aggregate/service sockets, and healthy membership/admin views. An initial probe in the older compiled namespace was restored to its original schema metadata before proceeding. No incompatible probe remains.
- Both intake localStorage keys remained byte-for-byte unchanged (`null` before and after). No intake form was submitted or changed. Native/backend storage was not reset.
- Restarted the original root `pnpm dev` process tree on 9.0.0; started `pnpm nx run admin:dev --excludeTaskDependencies` after its backend dependency was ready. Web, Storybook, backend, and admin reported readiness. The existing waitlist Storybook preview passed its five interactions. Dev servers and the retained registry remain running.
- Alternate hostnames had a pre-existing WASM CORS failure because the app's configured asset origins are localhost. Affected tabs were left healthy on the configured localhost origins; no unrelated CORS repair was added. Upstream Nx Cloud access warnings did not prevent local checks.
- Browser proof: `/Users/morgs32/.codex/visualizations/2026/10/13/01a137a2-fea1-7dd0-b5e2-9c272c91eed4/browser-storage-recovery-verified.png`.

## Remaining work

None. Production deployment is separate from this completed local release and consumer upgrade.
