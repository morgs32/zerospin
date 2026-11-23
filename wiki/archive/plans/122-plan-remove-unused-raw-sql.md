# 122 — Delete the unused raw SQL command-state query API

Status: Completed and verified on 2026-10-11. The unused raw SQL API and every direct reference were removed.

## Evidence and decision

[AggregateVersionRepo.executeSelectQuery](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionRepo/executeSelectQuery/executeSelectQuery.ts) accepts caller-authored SQL, delegates read-only classification to core `checkSqlQuery`, splits SQL on every `?`, interleaves Drizzle parameters and executes it against authoritative business storage. String matching cannot establish SQLite read-only execution, and splitting raw text also mistakes placeholders inside comments/literals. The current implementation can reject valid read queries while its apparent read-only boundary provides no actual read-only execution capability.

An exhaustive current authored-source search finds no Studio, browser, SDK, CLI or example caller. The only path is [SystemApi.executeSelectQuery](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/SystemApi/executeSelectQuery/executeSelectQuery.ts) to this method, its failure stub, repository service declaration, unused core `IEncodedQuery`, and lint RPC list. Stale graft entries are not callers. Existing authored aggregate selection queries and named service query capabilities serve actual product callers; SystemApi inspection has a separately bounded table-row API owned by the API reviewer.

Delete this raw SQL API outright rather than adding a parser, native authorizer, SQL sandbox, new connection or hypothetical future-query protocol. No forwarding alias, unsupported stub or dormant implementation remains. If a later actual caller needs ad hoc SQL, that requires an explicit read-only storage capability and a new bounded design; this plan does not prebuild it.

## API/error/transaction changes

Remove `SystemApi.executeSelectQuery`, `SystemApiFailure.executeSelectQuery`, `AggregateVersionRepo.executeSelectQuery`, and their declared public types. Remove all query-parser/placeholder/read-only/execution-error codes emitted solely by this removed path. No existing authored query behavior, schema or transaction changes. There is no new parent orchestration to invent: the surviving parent methods should contain no raw SQL dispatch step.

The supported domain path remains an explicit authored query call, schematically:

```ts
const executeServiceQuery = Effect.fn('executeServiceQuery')(function* (props) {
  const query = yield* resolveAuthoredServiceQuery(props);
  yield* progressServiceVersion(query.owner);
  return yield* runAuthoredServiceQuery(query);
});
```

This snippet illustrates the surviving capability; this deletion does not add a query to aggregate authoring or change current service query execution requirements. No remote inspection API becomes an arbitrary SQL substitute.

## File tree and exact consumers

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    - AggregateVersionRepo/executeSelectQuery/executeSelectQuery.ts
    - AggregateVersionRepo/executeSelectQuery/queryExecutionFailureMessage.ts
    - SystemApi/executeSelectQuery/executeSelectQuery.ts
    ~ AggregateVersionRepo/AggregateVersionRepo.ts (remove import and RPC)
    ~ SystemApi/SystemApi.ts (remove registered method/import)
    ~ SystemApi/SystemApiFailure/SystemApiFailure.ts (remove failure stub)
    ~ repoServices/AggregateVersionRepos.ts (remove Pick method)
  packages/core/src/
    ~ system/types.ts (remove now-unused IEncodedQuery)
    - drizzle/checkSqlQuery.ts (root must first confirm no remaining caller)
  scripts/lint/
    ~ zerospin-plugin.mjs (remove retired RPC inventory entry)
```

Root source review owns the core checker deletion after exhaustive imports are confirmed. The SystemApi reviewer owns its entrypoint/failure registration integration. Historical archived plans and stale graft documents remain historical; regenerate an actively maintained generated inventory through its documented generator rather than hand-editing stale symbol pages. Update only current API/module documentation that still promises this capability.

## Implementation order and verification

Current Nx project metadata was inspected read-only. Required meaningful implementation gates are core `lib`/`lint`/`tsc:typecheck` and browser/system-worker/dev-worker/production-worker `lib`/`ts`/`lint`, scoped to affected projects through `pnpm nx run <project>:<target>`. Inspect the resolved command before execution: an inferred `tsc:typecheck` disabled as an echo is not verification. Existing inferred dependencies remain governing. No build, lint, typecheck or test ran during this review.

1. Repeat exhaustive `rg` over current authored source for `executeSelectQuery`, `IEncodedQuery`, `checkSqlQuery`, and the local failure-message helper to catch concurrent newly added callers; resolve a real new caller before deleting rather than supplying a compatibility path.
2. Delete worker dispatch, method/stub/service declarations and local helper files. Delete unused core type and checker in coordination with root; remove lint inventory entry.
3. Run existing configured Nx core/system-worker lint/typecheck and affected consumer typecheck targets. Verify no active import/method reference remains. No behavioral test or fixture is needed for an unreachable reversible API deletion, and none is authorized/created. No tests/checks were run during this review.
4. Update current API docs/glossary only where a removed term exists. No ADR is justified for deleting an unused API unless the maintainer chooses a broader read-only authority decision. Archive after implementation and scoped required checks.

## Limits

The absence claim covers current authored repository files, not undocumented external clients. This prerelease repository explicitly requires hard cutovers; no external compatibility promise is inferred. The current checker was read by the root reviewer; this draft does not duplicate its implementation review or claim a successful exploit.

## Coordinated plan dependencies

1. [Plan110](110-plan-sqlite-execution-and-commit-observation.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.

## Implementation progress — 2026-10-11

1. Exhaustive authored-source search confirmed the raw SQL path had no actual caller; removed dispatch, failure stub, repo service declaration, core type/checker, local helper and lint inventory entry. No new test files, fixtures, runners, or configuration were created.

### Integration update — 2026-10-11

Unused raw SQL inspection types, checkSqlQuery, VersionRepo method, SystemApi method and failure wrapper are deleted. Registration-based table inspection remains the supported bounded boundary. Exhaustive production source search found no remaining retired raw-query surface.

## Completed verification — 2026-10-11

1. Exhaustive current authored-source search finds no `executeSelectQuery`, `IEncodedQuery`, `checkSqlQuery` or retired failure helper; no caller, API stub, export, binding or compatibility path remains.
2. Final affected core/system-worker/browser/worker library/type/lint gates passed in `/tmp/zerospin-goal-quality-5.log`; actual core `tsc:typecheck` passed in `/tmp/zerospin-goal-core-typecheck-3.log` with `--skipSync` for existing unrelated project-reference drift. Changed native, Shopping and TicTacToe build/type/lint gates passed. Nx Cloud401 did not block local checks.
3. Current API/workflow/glossary citations are reconciled. This unreachable API deletion requires no behavioral fixture or runtime test; none was created.

## Remaining work

None.
