# Plan 291 — Consistent contract-support refusals

Status: Complete.

## Agreed behavior

Use `aggregate-contract-unsupported` and `service-contract-unsupported` when an executing release cannot support a valid admitted command. Older releases retain their own failed outcome and continue replay for ordinary and recorded external commands. Validate source declarations, authority and input before a local support refusal. Invalid history, malformed input, kind mismatches and adapter failures remain distinct. Replay never repeats provider requests or changes the source release's outcome.

## Scope

Update aggregate/service execution, reviewed error defaults and Fragment's feature-adoption documentation. Preserve release registries, canonical selections, storage and unrelated changes. No package publication, consumer update or deployment.

## Implementation and verification

AggregateVersionRepo and ServiceVersionRepo normalize release-local support failures. Their existing refusal validation now checks frozen external payloads and observations against the source declaration; their replay execution retains the refusal without model operations and advances through the existing materialization transaction. Invalid provenance/input, kind mismatches and adapter failures keep distinct failure paths. No registries, canonical selections, schemas or stored data changed.

Fragment and the two affected execution workflow sections describe feature adoption, retirement and the implemented refusal behavior. Reviewed defaults and the changelog record the code changes.

- `system-worker:ts` and its declared dependency checks passed.
- Scoped runtime-source lint passed with no warnings or errors. The existing aggregate adapter spec reports five pre-existing curly-brace warnings outside the edited matrix; they were preserved.
- With explicit user authorization, updated only the two existing refusal matrices. Added valid missing-external and malformed-external-payload cases, checked that provider requests/programs do not run, and reused the existing next-command assertions to prove replay advances after refusal.
- The final scoped aggregate/service Workerd adapter run passed all 50 tests across two files. The Nx test target also completed its existing test TypeScript compilation and declared build dependencies. This is a scoped run, not a full-suite claim.
- Formatting and diff whitespace checks passed. No package publication, consumer adoption, deployment, registry change or storage reset occurred.

## Reconciliation verification — 2026-11-03

Integrated merged PRs #121, #122 and #123 on `codex/reconcile-zerospin-main`,
retaining the existing local 39.0.0/40.0.0 release metadata and declaration
documentation. The combined source passed `system-worker:ts` with its declared
dependencies, and the root Nx test target passed test TypeScript compilation
and 89 tests in six scoped files: aggregate/service adapter failures, service
replay, native SystemApi, Repo lifecycle and Repo names/SystemSpec metadata.
Formatting and diff checks passed. Scoped lint reported no errors and only the
same five pre-existing aggregate-spec curly-brace warnings. This is not a full
suite result. No packages were published and no consumers or storage changed.

## Remaining work

None.
