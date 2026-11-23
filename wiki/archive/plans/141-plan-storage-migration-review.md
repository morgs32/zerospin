# Storage migration review

Source README paths below are historical inventory. Their [pre-consolidation snapshot](https://github.com/morgs32/zerospin/tree/79c1824b1a0353f770211851c0bfe1cc54d0ba46/packages) remains available; current documentation lives in [Fragment](../../../docs/README.md) and [architecture](../../architecture/AuthoredSystem.md).

Status: Implemented and verified on 2026-10-12, following [the maintainer's PR review](https://github.com/morgs32/zerospin/pull/50#pullrequestreview-5495659715).

## Agreed behavior

1. Keep the existing Workerd harness. Refuse undeclared application triggers/views and column collations instead of silently accepting a different physical schema.
2. Remove the obsolete generic schema-policy factory and hook builder. Declare system ownership directly; retain system identity and accepted-definition admission before SQL, while each database resolver owns its release lookup.
3. Preserve forward-only checksummed history, synchronous SQL/stamp transactions, explicit durability confirmation, optional once-only bootstrap, the constructor gate and inherited base/alarm capabilities.
4. Review and simplify the complete PR's file organization and unnecessary options. Preserve standalone factory use without an application config module.

## Implementation and verification

1. Fix schema validation and inspect freshness, final-stamp ordering and failure/retry paths for consequent gaps.
2. Consolidate the concrete factory, place system admission under SystemRepo registration, remove duplicated checks and unused surfaces, and flatten migration helpers.
3. Extend the existing Workerd suites with concise regressions for schema refusal and durability. Create no new test files or runners.
4. Run the existing scoped Nx build, typecheck, lint and Workerd lanes. Review the final source again, then reconcile lifecycle docs, patterns, glossary and Explorer's generated snapshot. Governing storage policy remains [ADR 009](../../adrs/009-forward-only-framework-storage.md).
5. Record verification and archive this plan only after all requested work passes.

Planned files (`~` modify, `+` create, `-` remove):

```text
zerospin/
  ~ packages/core/src/drizzle/provisionDb/{validateDbSchema,validateTableSchema}.ts
  - packages/system-worker/src/makeDORepo/{makeDORepo,makeSystemRepoHooks,validateSystemRepoIdentity}.ts
  ~ packages/system-worker/src/makeMigratableDORepo/{makeMigratableDORepo,makeMigratableDORepoConfig,types,initializeMigratableSchema}.ts
  ~ packages/system-worker/src/makeMigratableDORepo/ migration/history helpers
  + packages/system-worker/src/SystemRepo/registerRepo/ configured identity and registration procedures
  ~ packages/system-worker/src/ nine concrete owner declarations and name-only callers
  ~ packages/system-worker/test/migratable-do-repo/ existing suites and workers
  ~ packages/system-worker/{package.json,env-types.d.ts}
  ~ packages/system-worker/src/makeMigratableDORepo/README.md
  ~ explorer/{scripts/capture-schema.mjs,src/data/schema-snapshot.json}
  ~ wiki/{architecture/AuthoredSystem.md,patterns/system-worker,glossary.md}
```

## Outcome and verification

1. Retained the harness and extended its five tests. Real Workerd passes upgraded-schema rollback for triggers/views/collations, refusal on cold reopen, refusal of unstamped view-only storage, SQL/stamp failure and identical retry, durable bootstrap across activation failure, retained scheduled alarms, and all nine production owners with receipts across restart. Workerd also refuses temporary triggers/views with `SQLITE_AUTH`.
2. Removed the single-caller storage-policy factory, generic hook builder, duplicate central release checks, unused initialization promise/config fields, database resolver storage access, no-op bootstrap wrapper and unused schema-ignore option. System admission now lives beside SystemRepo registration; name-only consumers use existing name utilities. Optional bootstrap remains supported and is confirmed before fallible activation.
3. Core and Worker library builds/typechecks, test typechecking and lint passed. Explorer typechecking passed after schema capture; its six existing warnings remain in unchanged UI files. Local checks succeeded despite Nx Cloud access warnings. Logs: `/tmp/zerospin-pr50-review-checks.log`, `/tmp/zerospin-pr50-review-final-checks.log`, `/tmp/zerospin-pr50-review-runtime-final.log`, `/tmp/zerospin-pr50-review-explorer-final.log`, `/tmp/zerospin-pr50-publish-lint.log`; the first two exposed fixture expectation mistakes corrected and rerun in the latter logs.
4. Two independent final source reviews found no remaining correctness gaps. Updated lifecycle documentation, source citations/hashes, glossary, patterns and Explorer snapshot. Scoped formatting and whitespace checks passed. Verification is local; no remote deployment was requested.

## Remaining work

None.
