# Framework-owned connected SharedWorkers

Status: Complete

## Scope

Aggregate and service browser session releases provide their worker factory
internally. Keep creation deferred until the connection resolves the session
identity and worker name. Ship the worker entry and SQLite WASM with the browser
package. Standalone sessions retain authored executable worker declarations.
Include the packaged worker entry in the existing worker content hash so the
URL cutover acquires a distinct worker name and lifetime namespace.

Use the retained committed 9.1.0 source snapshot as the release base so the
installed mock session behavior remains intact. Publish the fixed package group
to the existing loopback registry and update Mentor Mailbox's exact dependencies
and connected releases, preserving unrelated work and stored data.

## Verification

- Build and check the changed browser package and its in-repository consumers.
- Verify the installed package builds Mentor Mailbox's Next.js worker and WASM
  assets and runs the existing Mentor session tests.
- Publish the complete fixed package group, install exact versions in Mentor
  Mailbox, and verify the frozen lockfile.

## Outcome

- Published and verified all 19 fixed-group packages at `10.0.0` in
  `http://127.0.0.1:4873/`. Updated all 20 direct framework dependencies in Mentor
  Mailbox and verified its frozen lockfile contains no preview or old framework
  entries.
- Framework-owned aggregate/service factories retain cold construction and use
  the runtime-provided identity name. The packaged entry and valid SQLite WASM
  are present in the installed package. The entry participates in the worker
  hash, changing the worker name and lifetime namespace from `9.1.0`.
- Browser `lib`, `ts`, and `lint` pass. All distributable builds and the Shopping
  and Tic-Tac-Toe TypeScript/Vite builds pass. Both examples emit executable
  workers and valid WASM. The existing Tic-Tac-Toe Vite dev server also serves
  transformed worker modules and the WASM asset successfully.
- Mentor's production Next.js build, including TypeScript and emitted worker/WASM
  assets, and 11 existing tests across four session/workspace files pass against
  the installed registry release. Student and backend TypeScript pass. Scoped
  consumer lint/format and framework format checks pass.
- Supplemental Admin TypeScript remains limited by four pre-existing missing
  local exports: `adminDirectoryClaims`, `adminDirectoryCredentials`,
  `adminOrganizationV1`, and `adminSchoolV1`. Its imports and the local browser
  export module are unchanged from HEAD; its only session code change removes
  the worker callback. This existing application defect is outside this change.
- Migrated connected example/public authoring docs and removed unused authored
  worker entries. Standalone executable worker declarations remain unchanged.
- Preserved unrelated Mentor Mailbox work and existing backend/browser storage.
  The source base is committed `9.1.0` snapshot
  `14e8fb1aff83548409c052c3b3aada4cba4fac5b` on
  `codex/framework-owned-shared-worker`; the previous `main` remains untouched.

## Remaining work

None.
