# Aggregate and service release terminology

## Agreed behavior

1. An aggregate/service registry maps exact version strings to authored releases for one named owner. A release is an authored definition, whether deployed or not.
2. Rename authored types, factories, schemas, private classes, locals, and authored-object parameters consistently to release terminology. Remove old APIs outright without aliases.
3. Keep system.aggregates/system.services, release name/version fields, serialized fields, persistent identities, and version-owned Repo names unchanged. Model, actor, and contract terminology remains outside scope.
4. Preserve pre-existing authorization changes and historical archive documents.

## Implementation

1. Replace IAuthoredAggregate/IAnyAuthoredAggregate with IAggregateRelease/IAnyAggregateRelease and IService/IAnyService with IServiceRelease/IAnyServiceRelease.
2. Rename factory files and SDK exports to makeAggregateRelease/makeServiceRelease; rename declaration schemas, props schemas, and private instance classes consistently.
3. Reuse IAggregateRegistry/IServiceRegistry in system signatures while preserving literal-key inference. Rename version maps to aggregateRegistry/serviceRegistry and selected definitions to aggregateRelease/serviceRelease through helpers and callers.
4. Reconcile the glossary, active architecture/pattern examples, and source links after implementation. No ADR is needed.
5. Add one authorized memory correction note requesting removal of stale active systemRelease versus authored system-version guidance while preserving historical rollout evidence.

## Planned hierarchy

Legend: + create, ~ modify; directories group affected callers.

```text
zerospin/
├── packages/
│   ├── core/src/{aggregate,service}/ ~ types, factory filenames, helpers
│   ├── core/src/system/             ~ registries and release consumers
│   └── {sdk,system-worker,cli,studio}/ ~ callers and exports
├── examples/{shopping,tic-tac-toe}/  ~ declarations
├── explorer/                        ~ release declaration, callers, lint override
└── wiki/
    ├── plans/066-plan-owner-release-terminology.md +
    ├── glossary.md                  ~ implemented definitions
    └── {architecture,patterns}/      ~ examples and links
```

## Verification

1. Build core declarations and SDK exports; run scoped Nx TypeScript tasks for system-worker and affected consumers, including both examples, Explorer, and Tic Tac Toe's real ts task.
2. Run available lint checks, changed-file formatting checks, and git diff --check.
3. Search source and active docs for obsolete APIs and misleading registry locals; verify imports and documentation links.
4. Verify name/version inference, registry-key validation, and declaration instance checks remain intact. Add no test infrastructure.

## Outcome and verification

Implementation and required verification completed 2026-10-08, including the user-authorized Tic Tac Toe repair.

1. Renamed authored release types, factories/files, schemas/classes, registry locals, and release parameters across core, SDK, workers, CLI, Studio, Shopping, Tic Tac Toe, and Explorer. Updated named example declaration exports/files and Explorer's filename-specific backend lint override. Preserved existing authorization work, serialized identity fields, and durable VersionRepo names.
2. SDK lib build passed. Core, system-worker, CLI, Studio, and Shopping TypeScript checks passed. Explorer's real typecheck passed. Tic Tac Toe's ts, lint, and production build passed after its authorized repair. Scoped lint passed for all seven affected projects.
3. Temporary runtime checks passed for canonical aggregate/service release instance validation, rejection of plain object copies, retention of registry/release identity, unchanged serialized version fields, and rejection of mismatched owner-name/version registry keys.
4. Temporary compile-time checks against generated declarations passed for literal name/version inference, precise registry value inference, and rejection of mismatched aggregate version and service name keys. No test infrastructure was added.
5. Changed-file formatting checks and git diff --check passed. Searches found no obsolete APIs or misleading registry locals in current source/active docs; renamed documentation links resolve. Generated Graft indexes and historical archive documents remain historical evidence, not current source.
6. Saved the authorized memory correction note at /Users/morgs32/.codex/memories/extensions/ad_hoc/notes/2026-10-08-owner-release-terminology.md. Requested removal of obsolete current guidance, preserving the historical rollout.
7. Nx Cloud reported an access warning (401); local task results above are available independently.

## Authorized verification repair

On 2026-10-08 the user authorized resolving the Tic Tac Toe blocker. Replace removed machine/operator/service-operation references with the current mapped external-contract flow: public playX schedules asyncPlayO on the same actor; the backend chooses an empty square and validates retained state before applying O. Model operations return void and emit through the operation sink. Preserve browser contract names and tab-independent backend execution.

## Repair outcome and verification

1. Removed obsolete computerOperations/operator/machine-service imports and dead service registration. Added chooseComputerMove support, asyncPlayOV1, and mappedPlayXV1. The human actor registers the mapped playX and its exact external asyncPlayO contract; browser sessions keep the public playX declaration.
2. createGame and playX now emit model operations through the current sink and return void. Authoritative mapped playX emits one asyncPlayO only while the resulting board is playing. The mapped result is JSON null; the public void result remains unchanged.
3. The external chooser defaults to the first empty square and remains replaceable through the system layer. Before applying O, its guard validates retained board, turn, outcome, square, and claims.instanceId. Updated example documentation and the opponent label.
4. Temporary contract checks passed for creation, X scheduling exactly one async O, deterministic selection, final X wins/draws scheduling nothing, O wins, invalid/occupied squares, stale/duplicate replies, wrong identity/turn/outcome, and public-contract filtering. Also exercised makeOperations for createGame, mapped playX, and asyncPlayO, including JSON result encoding and makeSystemSpec serialization. These are contract-seam checks; no live backend/browser journey was run.
5. pnpm nx run-many -t ts lint build -p tic-tac-toe passed with its dependency graph. Changed-file formatting and git diff --check passed. No unresolved verification remains.

## Remaining work

None.
