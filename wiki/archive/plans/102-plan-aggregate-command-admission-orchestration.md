# Aggregate command admission orchestration

Status: Implemented and verified in the approved goal on 2026-10-11.

## Problem and decision

`admitAggregateCommands` currently combines envelope validation, preliminary database lookups, declaration resolution, three origin policies, payload decoding, a batch-local `checked` set, error normalization, and a nested runtime runner. `admitAggregateCommandsTx` then looks up those IDs again, decodes envelopes again, recovers duplicates, checks node continuity, allocates indexes, and inserts rows. These passes make a single admission decision harder to understand and spread its ownership across two execution contexts.

Replace that machinery with the ideal method shape in [AGENTS.md](../../../AGENTS.md): establish inputs, call focused domain procedures in order, and return the result. The benchmark is the `makeSystem` example, not a line-count goal. Moving the existing conditional blob into one renamed helper does not complete this plan.

1. Validate each ordinary envelope and its bound aggregate identity once before opening the transaction. Return the sanitized encoded command values; preserve the original payload string and supported provenance fields.
2. Use one synchronous transaction to process occurrences in submitted order. For each occurrence, look up its retained ID and either recover the exact original receipt or validate, check node continuation, and append a new command.
3. Let earlier inserts in that transaction handle later same-batch duplicates. Remove the separate lookup pass and `checked` set.
4. Let the existing `makeTx` boundary supply the calling Effect context and own synchronization, cancellation, rollback, and commit. Remove the admission procedure's nested `managedRuntime.runSync` and the now-unused runtime arguments in its ordinary/direct-execution callers. Keep the shared class/config runtime and all unrelated runtime consumers.
5. Keep current authority, immutable retention, and receipt meanings. An exact retained retry bypasses current declaration and payload validation; it still passes the ordinary bound-envelope check.
6. Accept the explained ordering change: after envelope validation succeeds for the whole batch, the first failing occurrence inside the transaction wins. An earlier duplicate/provenance/order conflict can now win over a later declaration failure. Every failure still retains none of the new batch.
7. Classify asynchronous authored validation at the admission boundary after `makeTx` cancels suspension and rolls back. Current `makeTx` preserves the execution Cause after successful rollback; it does not normalize this defect. Map only a sole `AsyncFiberError` defect to `aggregate-admission-failed`. This intentionally replaces the old command-invalid classification for that programmer error. Preserve other defects, interruption and composite Causes unchanged. Invalid submitted data still returns `aggregate-chain-command-invalid`; no extra runtime runner or transaction-policy hook is added.
8. Keep RPC container validation in the two AggregateChain instance methods, but replace their full command-envelope decodes with shallow wrapper/array checks. `validateAggregateSubmission` becomes the sole ordinary command-envelope decoder across the complete call stack.

## Scope and related work

1. Ordinary AggregateChain admission, its direct-execution caller, their runtime-argument plumbing, and their current documentation are in scope. No new public RPC shape, database table, fixed schema, or domain failure code is proposed.
2. Async continuation admission, service admission, command materialization, node journals, socket authentication, projection policies, and delivery scheduling retain their present owners. Admission does not execute aggregate guards or contract programs.
3. Archived [Plan 069](069-plan-rpc-call-stack-cleanup.md) Iterations 4 and 5 record earlier completed admission cleanup. Preserve that evidence; link this plan as the new admission work rather than rewriting its completed history or reviving removed preparation/context APIs.
4. Completed [Plan 101](101-plan-remove-aggregate-server-staging.md) records the server-staging removal and its verification. Build upon its current direct-admission/projection boundaries and preserve its source changes. Do not reintroduce server staging.
5. [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md), [standalone authority ADR 004](../../adrs/004-standalone-authority-and-storage-scope.md), and [versioned agent views ADR 004](../../adrs/004-versioned-agent-selected-views.md) govern immutable originating order, synchronous execution, and exact agent-version ownership. [ADR 006](../../adrs/006-browser-speculation-and-confirmed-projections.md) and [ADR 005](../../adrs/005-ordered-original-execution-and-finalized-replay.md) govern canonical execution/projection and original-versus-replay authority. The repository currently has two ADR filenames with prefix 004; preserve those actual filenames. Use the existing glossary's aggregate, actor, agent, command, admission, and originating-position terms.
6. Do not create test files, fixtures, check runners, or their configuration. Use existing verification seams. Do not introduce `ALLOWED_CAST`, compatibility aliases, dual paths, fallback decoding, migrations, or automatic storage deletion.

## Current source evidence

1. [Ordinary admission](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommands.ts) currently owns the preliminary ID query, `checked` set, dynamic fresh-command schema, discarded decode results, and outer `managedRuntime.runSync`.
2. [Transactional retention](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommandsTx.ts) currently owns immutable field comparison, repeated command-envelope decoding, node progress, aggregate-tip allocation, and full-row insertion.
3. [Command envelope schema](../../../packages/core/src/contracts/CommandSchema.ts) and [origin schema](../../../packages/core/src/contracts/AggregateCommandOriginSchema.ts) define the supported encoded fields. Unknown envelope/origin fields are ordinarily ignored; actor claims remain a record for later strict authored validation.
4. [Transaction boundary](../../../packages/core/src/drizzle/make/makeTx.ts) captures the current Effect context, runs the body synchronously, cancels suspended fibers before rollback, and preserves the complete execution Cause after successful rollback. SQL/rollback infrastructure failure becomes `drizzle-transaction-failed`, retaining any captured execution Cause as diagnostic context.
5. [AggregateChain](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts) owns shared runtime execution and the outbox producer lease. Its ordinary-admission and direct-execution RPC methods currently also decode complete command envelopes before calling the inner admission procedure; replace that repetition with container validation. [Direct execution](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts) forwards the admission runtime argument and uses the retained release for result recovery.
6. [AggregateChain database config](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts) owns the table codecs, nullable response/finalization/diagnostic fields, command-ID uniqueness, and unique node/push position. This plan changes none of that storage schema.

## Proposed method shapes

The snippets show responsibility and sequencing; implementation must preserve inferred Effect services and errors rather than force these sketches through casts.

```ts
const admitAggregateCommands = Effect.fn(function* (props: AdmissionInput) {
  const { commands: submittedCommands, db, key } = props;
  if (submittedCommands.length === 0) return [];
  const commands = yield* validateAggregateSubmission(submittedCommands, key);
  return yield* admitAggregateCommandsTx(db, { commands, key }).pipe(
    Effect.catchCause(classifyAggregateAdmissionFailure),
  );
});
```

`validateAggregateSubmission` returns the supported encoded envelope fields from its one decode. It does not return payload-schema transformations. Ignore unsupported excess envelope/origin fields consistently at this boundary, matching the encoded schema's default behavior. Compare duplicates against that normalized envelope, eliminating the current inconsistency between sanitized validation/retention and raw-input retry comparison. This does not ignore extra actor claims that the authored claims schema rejects.

The public methods retain their inline RPC wrapper schemas, using `Schema.Struct({ commands: Schema.Array(Schema.Unknown) })` for batch admission and `Schema.Struct({ command: Schema.Unknown })` for direct execution. Preserve their invalid-input mapping and original public TypeScript signatures. This validates the container before destructuring or using the batch length; the submitted command contents are admitted by the single bound-envelope decoder. A malformed direct command is wrapped as one occurrence and rejected there. Do not replace the existing boundary checks with unchecked property access or casts.

```ts
const admitAggregateCommandsTx = makeTx('admitAggregateCommandsTx')(function* (
  tx: ITx,
  props: AdmissionTxInput,
) {
  const { commands, key } = props;
  const system = yield* System;
  const admitted = [];
  let aggregateIndex = readLatestAggregateIndex(tx);
  for (const command of commands) {
    const retained = readRetainedCommand(tx, command.id);
    if (retained !== undefined) {
      admitted.push(yield* readRetainedCommand(retained, command));
      continue;
    }
    yield* validateNewAggregateCommand(command, system, key);
    yield* validateNodeContinuation(tx, command);
    const receipt = yield* appendAggregateCommand(tx, command, aggregateIndex);
    aggregateIndex = receipt.aggregateIndex;
    admitted.push(receipt);
  }
  return admitted;
});
```

The two reads are simple synchronous Drizzle expressions and may remain inline. Do not create forwarding wrappers solely to match the schematic names. `readRetainedCommand`, fresh authority/payload validation, node continuation, and append each own a coherent invariant.

## Responsibility contracts

| Procedure                     | Inputs and output                                                                                                                                    | Owned checks and failures                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateAggregateSubmission` | Submitted encoded-command array and bound `{ systemId, aggregateId, aggregateName }`; returns a sanitized encoded-command array in occurrence order. | One composed array/envelope schema owns command structure, origin structure, supported node-metadata forms, positive push positions, bound aggregate ID/name, and absence of an ordinary async response. Schema failures retain `aggregate-chain-command-invalid`, the existing invalid-input prefix, and useful field paths. No database or declaration lookup.                                                                   |
| `readRetainedCommand`      | Complete retained SQL row and sanitized submitted command; returns the retained encoded command plus its original `aggregateIndex`.                  | Exact immutable-field comparison, including raw payload-string equality and structural origin/response equality. Normalize absent submission response to `null` for comparison. A changed immutable input or provenance is `node-admission-identity-mismatch`. Decode the stored row with its owning table codec and project supported command fields; do not consult current System declarations or decode the submitted payload. |
| `validateNewAggregateCommand` | Sanitized fresh command, configured System, and bound aggregate key; succeeds without replacing input.                                               | Resolve the submitted aggregate release, dispatch its actor/agent/system authority policy, resolve the exact submitted contract version, and validate its JSON payload. All ordinary declaration/authority/payload refusals remain `aggregate-chain-command-invalid`. No SQL, state-dependent guards, node-index allocation, or receipt construction.                                                                              |
| `validateActorCommand`        | Fresh actor-origin command, selected aggregate release, and aggregate ID; returns its selected authored contract.                                    | Registered actor name/version, strict authored claims schema, claims aggregate-ID agreement, and actor-owned ordinary contract selection. Claims decode is validation only: retain the original supported claims, not transformed claims. Actor commands may have null node metadata or the complete originating node tuple permitted by the envelope schema.                                                                      |
| `validateAgentCommand`        | Fresh agent-origin command, selected aggregate release, and System; returns its selected authored ordinary contract.                                 | Registered exact agent name/version; exact aggregate name/release and session binding; aggregate ordinary contract availability; agent allowlist and exact ordinary/permitted contract version. No actor claims, actor authentication, or authorization callbacks.                                                                                                                                                                 |
| `validateSystemCommand`       | Fresh system-origin command and selected aggregate release; returns its selected authored ordinary contract.                                         | Aggregate ordinary contract selection and null node/session/push metadata. No actor or agent identity resolution.                                                                                                                                                                                                                                                                                                                  |
| `validateSubmittedPayload`    | Exact submitted contract declaration and original encoded payload string; succeeds without replacing input.                                          | Parse JSON and validate `makeEffectSchema(submitted.payload)` against the submitted version, including a declared previous version where allowed. Decode once and discard the transformed value. Invalid JSON/schema is command-invalid. Authored validation that suspends follows `makeTx` cancellation/rollback and admission-failed classification.                                                                             |
| `validateNodeContinuation`    | Active transaction and fresh encoded command; succeeds without a write.                                                                              | Null node metadata needs no continuity query. Otherwise read the latest row for that `nodeId`; require `pushIndex === (prior?.pushIndex ?? 0) + 1`, and preserve its session name, aggregate release, and structural origin. Wrong position is `node-admission-index-mismatch`, retaining `expectedPushIndex` and submitted `pushIndex`; changed retained provenance is `node-admission-identity-mismatch`.                        |
| `appendAggregateCommand`      | Active transaction, fresh sanitized command, and current aggregate tip; returns the newly retained encoded command with its assigned index.          | Increment once and reject unsafe integers with `aggregate-input-index-exhausted`; encode the full row through `aggregateChainDbConfig.tables.commands`, insert once, retain `finalization: null` and `lastDeliveryFailure: null`, and return the original encoded input with response normalized to `null`.                                                                                                                        |

1. `validateNewAggregateCommand` must itself read as named domain steps. Keep the origin dispatch local and explicit. The three origin procedures return existing authored declarations, not a new resolver context, metadata registry, preparation result, or compatibility model.
2. Common fresh-command checks belong once in `validateNewAggregateCommand`: configured system-name agreement, known aggregate release, available non-external contract, supported submitted version, and administrative rejection of claims-bearing contracts. Check both the selected contract and its `mapping.original` where the current code does so.
3. Actor and system commands can validate an authored previous contract version. Agents require the exact ordinary contract version and their permitted version. Preserve `getVersion` declaration semantics; map its unsupported-version failure into the existing command-invalid boundary instead of leaking a new code.
4. Keep strict fresh-command authority validation (`onExcessProperty: 'error'`) and sequential decoding where the current authored claims/payload schemas require it. Supported extra claims rejected by an authored claims schema must not become silently accepted during consolidation.
5. One structural schema does not own database facts. Duplicate identity, node continuation, aggregate-index exhaustion, and atomic rollback remain explicit transaction responsibilities. Condensing these into a schema would hide their read/write ownership and ordering.

## Runtime, transaction, and retained-input rules

1. `admitAggregateCommandsTx` receives the active transaction directly through `makeTx`, with `{ commands, key }` as its explicit arguments. `System` remains an Effect service supplied by the existing class/config runtime; no new Db/Tx Context service or retained admission runtime is introduced.
2. All fresh declaration and payload validation runs in the same synchronous transaction as duplicate recovery, node checks, index allocation, encoding, and insertion. A validation failure after earlier inserts must roll back those inserts and leave no hole in later aggregate indexes.
3. `makeTx` already cancels a suspended fiber before rollback. Keep that cancellation guarantee: a schema refinement cannot resume after rejection and write through the abandoned transaction.
4. Deliberately use existing `makeTx` cancellation/rollback and full-Cause propagation. `classifyAggregateAdmissionFailure` maps a sole `AsyncFiberError` Die reason to `aggregate-admission-failed` and a sole typed storage/unexpected failure to the existing retention failure. Known domain Fail reasons keep their codes. Every other Die, Interrupt or composite Cause is re-failed unchanged. The suspended fiber has already been fenced, cancelled and flushed by the transaction before classification. This replaces the old outer-runner `aggregate-chain-command-invalid` suspension classification. Do not add a transaction-policy hook, local sync runner, custom decoder runner, serialized-text detection or compatibility path. Shared `makeTx` and every other caller retain their current behavior.
5. Sole typed non-domain storage/transaction failures become `aggregate-admission-failed` with the existing retention message/cause, including `drizzle-transaction-failed` from native transaction infrastructure. A synchronous statement read/insert that throws inside the generator remains its original Die Cause after rollback; do not infer SQL origin or add per-statement wrappers to convert it. Keep deliberate admission Fail reasons as their existing domain errors. Envelope-schema failures already use command-invalid and occur outside the transaction.
6. Retain the exact original payload string, submitted `contractVersion`, aggregate release, supported origin/claims, and node/session/push metadata. Validation transformations are evidence of validity, never replacement retained input. SQL response remains nullable; both fresh and recovered receipts preserve the existing explicit null normalization.
7. A retained duplicate returns its complete original command and index once for each input occurrence. It allocates no new aggregate index and does not advance node order. A finalized retained row still returns an admission receipt, without adding finalization/delivery bookkeeping to that receipt.
8. Keep `executeCommandOutbox.drainAfter` around admission/direct execution at the Durable Object boundary. The producer lease and post-admission recovery scheduling remain in their existing asynchronous owner; no network call, outbox acquisition, or drain belongs inside the synchronous transaction.

## Planned files

Legend: `+` create, `~` modify, `-` delete. Only coherent domain procedures get new files; delete any superseded in-scope helpers discovered during implementation instead of retaining duplicate paths. The current two admission files remain and are rewritten.

```text
zerospin/
  packages/system-worker/src/AggregateChain/
    ~ AggregateChain.ts
    ~ README.md
    admitAggregateCommands/
      ~ admitAggregateCommands.ts
      ~ admitAggregateCommandsTx.ts
      + validateAggregateSubmission.ts
      + classifyAggregateAdmissionFailure.ts
      + readRetainedCommand.ts
      + validateNewAggregateCommand.ts
      + validateActorCommand.ts
      + validateAgentCommand.ts
      + validateSystemCommand.ts
      + validateSubmittedPayload.ts
      + validateNodeContinuation.ts
      + appendAggregateCommand.ts
    executeAggregateCommand/
      ~ executeAggregateCommand.ts
  wiki/
    ~ architecture/server/admitAggregateCommands.md
    ~ architecture/server/executeAggregateCommand.md
    ~ glossary.md                         # reconcile after implementation only
    ~ archive/plans/069-plan-rpc-call-stack-cleanup.md
    ~ plans/102-plan-aggregate-command-admission-orchestration.md
```

Shared `makeTx` needs no modification. No new storage or verification configuration file belongs in this tree.

## Ordered implementation

1. Re-read the admission files, direct-execution callers, table codec, and relevant active WIP before editing. Record the scoped baseline and retain unrelated edits. Use the implementation skill; keep this plan current as the concrete method contracts are implemented.
2. Implement `validateAggregateSubmission` as the single sanitized bound-envelope decode. Keep raw encoded payload strings and supported provenance unchanged, ignore unsupported envelope/origin fields consistently, and retain strict actor-claims validation in the later fresh-command phase. Adopt the documented existing-transaction suspension classification when removing the outer synchronous guard.
3. Implement focused fresh-command authority procedures and payload validation. Give the parent the clear order: known System/release, origin policy and authored contract, submitted contract version, payload validation. Eliminate the original large inline schema-construction/ternary block rather than transferring it whole.
4. Implement duplicate recovery, node continuation, and append procedures using explicit transaction arguments and owning table codecs. Reuse current immutable-field semantics; remove duplicate envelope decoding. Keep uncomplicated SQL lookups inline in the transaction orchestrator.
5. Rewrite `admitAggregateCommandsTx` to the single ordered occurrence loop. Put fresh validation after retained recovery and before node continuation/insertion. Maintain the aggregate tip only after a fresh successful append; use the transaction's own earlier rows for same-batch retries.
6. Rewrite `admitAggregateCommands` to empty guard, bound-envelope validation, and transaction admission/error mapping. Delete `checked`, preliminary retained reads, the nested evaluation/context/Exit runtime machinery, and imports/types that no longer serve the replacement.
7. Replace complete per-command decoding in both `AggregateChain.ts` RPC methods with the shallow container schemas above, retaining invalid-input mapping and safe array/property handling. Remove the unused `managedRuntime` props from `executeAggregateCommand` and the ordinary/direct-execution calls. Preserve public signatures, class `runPromise`, `config.managedRuntime`, async-admission runtime arguments, queue/activation lifetimes, and retained-version direct-execution routing.
8. Run the existing checks and behavior seams below. Review the complete changed call stack, including inferred services and failures, against the responsibility table. A short parent with a hidden monolith or duplicate validation is unfinished work.
9. After implementation and verification, reconcile current module/architecture documentation, its diagrams/citations/hashes where source changed, the existing glossary, and archived Plan 069's historical evidence and successor link. Reconcile implemented terms without creating new terminology solely for helper names. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and involves a real trade-off; routine orchestration extraction does not qualify automatically.
10. Record actual checks, runtime evidence, and limitations in this plan. Archive it under `wiki/archive/plans/` only when implementation and required verification are complete; preserve its filename and repair links. Do not mark unrelated Plan 101 verification complete on the strength of this plan's checks.

## Behavioral acceptance criteria

1. Empty input returns the same plain empty admission array without reading System or opening a transaction.
2. Every occurrence passes bound aggregate identity, ordinary response restriction, origin/envelope structure, and node-metadata-form validation, including retained and same-batch repeats. Unsupported envelope/origin fields do not appear in receipts and do not create a false immutable-input conflict on an otherwise identical retry. Extra actor claims still undergo the strict authored claims schema for fresh commands.
3. Fresh actor, agent, and system commands preserve their existing distinct authority rules. Actor claims match the bound aggregate; agents use exact authored release/session/contract bindings; system commands have null originating metadata. Claims-bearing administration and external contracts are rejected.
4. Exact previous submitted contract versions remain valid for actors/system where declared; agents remain restricted to their current ordinary/permitted version. Malformed JSON, payload-schema failure, unknown declarations, and rejected claims remain command-invalid.
5. An exact retained retry still works when its current aggregate/actor/agent/contract declaration has disappeared. Differing payload bytes, supported response, authority, source release, or node/session/push metadata fail identity recovery; no retry rewrites retained history.
6. Exact duplicates within one batch produce the same retained command and index for each occurrence. Mixed retries/fresh commands preserve input occurrence order and allocate dense aggregate indexes only for fresh commands.
7. First node push is `1`; later fresh pushes are consecutive. A new command ID cannot reuse/skip a position or change retained node session, source release, or origin. A null-node actor/system occurrence follows its permitted authority rule without a continuity query.
8. A failure in any later fresh validation, node check, encode/insert, index exhaustion, or synchronous-suspension path rolls back every fresh row in the batch. The next valid batch starts from the last committed tip. Previously retained commands remain unchanged.
9. The error chosen after whole-batch envelope validation is the first transactional failing occurrence. Explicitly exercise an earlier identity conflict with a later fresh payload/declaration failure; the identity conflict wins under the approved new order.
10. Sole validation suspension is admission-failed, its fiber is cancelled before rollback, and it cannot resume writes. Invalid submitted JSON/schema/declarations remain command-invalid. Sole typed non-domain storage/transaction failures become admission-failed; unwrapped statement throws remain full original defects after rollback. Deliberate node/index errors retain their codes, and mixed/interrupted Causes remain unchanged.
11. Fresh and recovered receipts retain the same encoded domain fields and aggregate index, with response null normalization. They expose neither table finalization nor delivery diagnostics. Direct execution still selects the receipt's retained aggregate release.
12. Existing socket producer leases, direct execution, and async continuation admission still compose correctly. Source search finds no obsolete ordinary-admission runtime argument, preliminary lookup pass, `checked` set, or repeated envelope decoding in the new admission call stack.
13. Malformed RPC wrappers, non-array batches, and malformed ordinary command envelopes return command-invalid without a transaction or downstream execution. Container validation remains at the public instance methods; complete ordinary command-envelope decoding occurs once in `validateAggregateSubmission`.

## Verification and limits

1. The currently resolved `system-worker` Nx configuration has `lib`, `ts`, and `lint` gates. Run one explicit dependency graph: `pnpm nx run-many -p system-worker -t lib,ts,lint`. Keep declared dependency builds and caching. Record unrelated concurrent dependency failures precisely; do not repair their owners' WIP or claim these gates passed if they were blocked.
1. Run the root `format:check` script with only in-scope changed files after checking the formatter's supported file arguments, then scoped `git diff --check` and changed-file review. Search ordinary admission/direct-execution callers for removed arguments and forbidden compatibility/cast additions. Do not use a broad formatter over generated `.wrangler`/`dist` or unrelated edits.
1. This checkout currently has no `system-worker` test, explorer-check, or aggregate-administration-check task, and no existing worker admission fixture suite. The earlier Plan 069 gates are historical evidence, not commands available now. Do not recreate a runner, catalogue, fixture, or test configuration to substitute for an absent seam.
1. Use an existing application/RPC seam where its actual commands and configured declarations permit the acceptance criteria. TicTacToe is an available integration application; inspect its current Nx configuration before choosing its build/serve commands. Shopping's local guidance prohibits application browser verification. Preserve the existing Chrome session/login for any permitted browser use.
1. Record which behaviors were actually exercised and which were checked only against current source. Runtime coverage must include actor/agent/system success where authored, immutable retry, node-order rejection, batch rollback, original input retention, and direct execution recovery when those existing seams provide them. If a needed scenario cannot be reached without creating a prohibited test fixture/runner, report that limitation and keep its verification requirement explicit rather than inventing evidence.
1. Review the new named-step parents and transaction order against AGENTS.md, current schema behavior, and the governing ADRs. Verify a single retention transaction, no network/suspending work inside it, original payload/provenance retention, and no declaration validation on retained duplicates. Do not translate fewer parent branches into a claim that domain scenarios have disappeared.

## Implementation progress — 2026-10-11

1. Ordinary admission now decodes the whole batch once, then recovers retained receipts or validates and appends fresh occurrences in transaction order. Nested runtime, preliminary lookups, checked IDs and repeated envelope decoding are removed. Direct RPC wrappers remain shallow; Plan130 owns the coordinated command-only administrative request cutover.

### Integration update — 2026-10-11

Ordinary aggregate admission decodes the complete original envelope once and retains ordered occurrences in one synchronous transaction. Exact retained receipt recovery precedes fresh declaration authority; producer continuation decodes retained rows and checks safe contiguous allocation. Sole supported failure classification occurs after rollback and cancellation.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Verified real public actor admission — 2026-10-11

The existing already-built TicTacToe backend ran on port3006 using retained current-schema verification storage, without a clean, reset or rebuild (`/tmp/zerospin-goal-125-backend.log`). The inline client reused the actual native smoke's account/instance and the app's existing `pk_local` credentials configuration, existing `gameSessionDeclaration`, canonical lock and actual Gateway aggregate admission/authorization APIs. It called the same public `stageAggregateSessionCommand` used by native Start game and the existing session/initialized-session/lifetime constructors. A real SQL.js-backed AggregateNode allocated its own genuine node ID and retained the actual accepted original at nodeIndex1/pushIndex1; no coordinates, receipts, SQL results, host capabilities or authored bindings were manufactured. Its sqlite-proxy adapter executed each operation with SQL.js `prepare`, `bind`, `step`, `get` and `free`.

Exactly one real `createGame` command was sent through an authorized live socket. The committed receipt was `cmd_Q88V-TD0DnfcYPxFAm6nD`, producer `node_3-MKupQVMVxyT_GOZEFlR`, pushIndex1 and aggregateIndex1. The actual server finalized it as `{ _tag: 'ZerospinSuccess', result: null }`. Its owning Table decoded the public retained-row inspection and proved exact original input/provenance; the authorized snapshot showed exactly one game at the actual native instance ID, board `.........`, turn `X`, outcome `playing`, and producer resolvedThrough1 (`/tmp/zerospin-goal-102-tictactoe-retained-result.log`, `/tmp/zerospin-goal-102-tictactoe-result-assertions.log`, exit0).

The adjusted continuation passed all assertions through actual Node `ws` clients (`/tmp/zerospin-goal-102-tictactoe-continuation.log`, exit0):

1. Retrying that genuine finalized retained input returned its exact original command ID, admissionIndex1 and pushIndex1. The complete authorized snapshot stayed identical.
2. Adding exactly one leading whitespace byte to its original payload string returned `node-admission-identity-mismatch`, despite equivalent parsed JSON. The complete snapshot stayed identical.
3. Another genuine factory-created Node initialized from the actual current snapshot and staged/accepted the first-party `playX` command. Its actual output had nodeIndex1/pushIndex1. Changing only its submitted pushIndex to2 returned `node-admission-index-mismatch`, with expectedPushIndex1/submittedPushIndex2. The board, resources, dispositionHash and public checkpoint stayed identical.
4. The complete before/after public AggregateChain table inspection, including columns and raw rows, was identical across retry and refusals. The sole retained original still held its exact original encoded payload and producer provenance; the refused playX command retained no server occurrence. Its real local Node retained that unresolved command in the same pending journal until owned disposal.

These checks submitted one game creation and no other server domain mutation. All successful sockets closed and joined; the in-memory session/Node/SQL.js owners disposed. No original native SQLite was changed. The initial inline WASM adapter incorrectly finalized an iterator-owned statement and failed before Node initialization/staging, providing no product evidence. The first successful createGame run then used an incorrect assertion field (`finalization.kind` rather than the actual `_tag`), providing no successful overall-run claim; the later actual retained-row/result assertions and continuation supply the completed evidence. Neither setup/assertion mistake required a production change. In-memory SQL.js supplies real local SQL behavior, while these ordinary remote calls prove their observed Workerd outcomes; they do not prove native host or Worker interruption/cancellation behavior.

The owned existing backend stopped through SIGINT with Nx dev task exit0 after verification. Port3006, owned CLI/Workerd processes and its generated config were gone. The17 prior generated configurations and protected56-file original backup remained exact against their manifests (`/tmp/zerospin-goal-125-cleanup.log`).

### Completed controlled admission matrix — 2026-10-11

The human authorized disposable verification fixtures under `/tmp`. The final current-output runs use the production admission procedures, canonical authored capabilities and real SQL.js statements. `/tmp/zerospin-framework-goal-server-qvh4z87h/fresh-final-admission.log` passes 46 assertions across aggregate/service receipt recovery with an empty current System, dense ordered allocation, same-page identical retries and conflicting-byte rollback, producer push/session/full-claims/release continuity, and full mixed Cause preservation. `fresh-final-admission-boundaries.log` passes 46 assertions for empty input with no System/database, whole-envelope precedence and sanitization, ordinary response refusal, earlier transactional conflict before later payload failure, unsafe allocation, actual SQLite insertion-trigger rollback and original statement defects, and cancelled suspension with zero late writes. Mixed suspension plus cleanup defect remains a full Cause.

`fresh-final-admission-policy-change.log` proves exact retained recovery skips a canonical payload codec that now refuses fresh input: the retained row stays exact and the validation counter advances only for the new refusal. `fresh-final-admission-historical.log` passes 39 assertions: actual previous contract versions remain valid for actor/system with their exact original payload bytes; agents require the current bound ordinary version/session; strict claims and claims-bearing administration refuse; seven malformed actual Workerd RPC wrappers return command-invalid and leave all three source rows unchanged. [Plan130](130-plan-administrative-execution.md) supplies actual retained-version result routing, empty/failure results and lost-response recovery. The actual actor/agent/administrative and recorded-continuation flows in [Plan112](112-plan-agent-session-owners.md) and [Plan121](121-plan-admission-authority.md) establish direct composition without a second ordinary validation path.

Independent acceptance review matched every thirteen-point criterion to those final runs, earlier genuine TicTacToe/public administrative evidence, and the current single-decode/ordered-transaction source. Shared final source gates pass; the later owner-authority repair also passes the coordinated 21-task library/type/lint graph and actual core 4-task typecheck (`/tmp/zerospin-framework-goal-root-20261011/121-authority-{gates,core-typecheck}.log`). These are bounded SQL.js/actual Workerd checks; they make no additional native/browser interruption claim. Original application storage/configuration preservation remains as recorded above. No permanent verification files were added to the repository.

## Remaining work

None.
