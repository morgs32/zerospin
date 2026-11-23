# 121 — Service and recorded-continuation admission authority

Status: Implemented and verified in the approved goal on 2026-10-11.

Original review context — 2026-10-11: Ordinary aggregate admission is already approved in Plan102; this approved plan complements it rather than reopening its one-envelope/one-transaction design. Coordinates with the SystemApi retained-command routing proposal.

## Source evidence and problem

[Service admission](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts) builds a checked-ID Map, performs retained-row reads and authored declaration checks before [a second transaction](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommandsTx.ts) rereads/redecodes the same retained input. The current release is resolved at55 before retained retry lookup at71, so a historical matching retry can fail when declarations disappear. A nested managedRuntime.runSync at146 creates another synchronous runner around an already synchronous transaction. The class [admission semaphore](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts) extends over queue drainage instead of leaving admission as one local transaction.

Service continuation admission proves retained producer reconstruction before calling ordinary admission with [trustedAsync:true](../../../packages/system-worker/src/ServiceChain/admitAsyncCommands/admitAsyncCommands.ts). That flag suppresses payload policy but still requires [the initiating actor's ordinary contract allowance](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts). [Service execution binding](../../../packages/system-worker/src/ServiceVersionRepo/utils/bindServiceExecution.ts) also discovers an external contract via source actor.contracts. An owner-authored mapper emission is authorized by the owner external declaration and recorded producer evidence; it is not a fresh browser command requiring that external name in the actor's ordinary submission catalogue.

[Service output preparation](../../../packages/system-worker/src/ServiceVersionRepo/utils/prepareServiceOutput.ts) maps null caller to null origin, while [producer preparation](../../../packages/system-worker/src/asyncOperations/prepareAsyncOperation.ts) rejects original null origin. [Child reconstruction](../../../packages/system-worker/src/asyncOperations/readPreparedAsyncCommand.ts) always constructs an actor caller. This prevents a valid administrative service command from producing async work. Shopping currently uses an actor caller for checkout and its mapper emits external work; it is not evidence of system-origin production. The null-caller exclusion is structurally verified, but no actual current system-origin async caller has been found. There is no authored service restriction limiting external emissions to actors.

[Aggregate continuation admission](../../../packages/system-worker/src/AggregateChain/admitAsyncCommands/admitAsyncCommands.ts) separately reproduces the checked set, preliminary row lookups, dynamic schema construction and nested runner. It should use the approved aggregate retention boundary with recorded-continuation authority rather than preserving a second admission architecture.

Recorded child preparation also [resolves/validates current external definitions](../../../packages/system-worker/src/asyncOperations/readPreparedAsyncCommand.ts) after an observation has already been validated and committed. The emitted owner, payload, original authority and recorded response are durable evidence. Delivery recovery must not need the initiating mapping or reexecute an external producer after a missing-definition failure.

## Decision

Keep separate explicit ordinary and recorded-continuation public entrypoints. Decode the complete supported ordinary envelope once before admission recovery/transaction; preserve submitted payload string and all immutable supported fields. Ordinary public submission still forbids a response/observation field. Decode recorded ingress without replacing its supplied objects before exact equality with the producer's retained reconstruction, so a forged extra field cannot disappear during validation.

For an ordinary page, one synchronous transaction processes occurrences in order: bound owner check; retained ID lookup/decode and exact immutable equality; return retained receipt when present; new-command origin-specific current declaration/claims/payload validation; node continuity and identity validation; safe source-index allocation; insert immutable command with pending finalization. A prior insert in the same transaction handles repeated IDs; no checked-ID cache or preliminary retained pass is needed. Matching retained retries skip fresh declarations and payload checks. Changed immutable input or producer position rolls back the whole page. This includes a retained release omitted from the current deployment: bound service identity and exact retained input still govern receipt recovery. A new ID requires a currently deployed release and its ordinary declaration authority. Receipt recovery does not promise execution of a still-pending original after its release disappears, or model-state access without the authored release; those remain explicit unavailable-owner errors. The administrative caller routes by the retained receipt.serviceVersion and must not preempt this recovery with an outer current-contract/wrapper-release lookup.

For recorded continuations, verify the full page against each producing VersionRepo's recorded child reconstruction outside the local transaction. Then enter one local page transaction: retained equality recovery first; for a new child validate exact retained emission owner/version, external-contract declaration and observation semantics under that producing owner, not the actor's ordinary browser allowlist; continue/append through the same focused domain retention procedures. No remote RPC is permitted inside the local transaction. Implement explicit ordinary and async transaction parents with shared **retained lookup/equality, continuity and append procedures**, not a generic callback-validator framework or `trustedAsync` boolean. The public async entrypoint cannot accept a caller-supplied proof marker.

Make a service system command's production origin explicit `{kind:'system'}`; null caller remains the ordinary service command wire representation. Reconstruct a system continuation with `caller:null`, an actor continuation with its frozen actor/claims and null node/push/session, and reject service-inapplicable agent provenance. Do not invent an actor solely to carry system authority. Aggregate actor/agent/system producer provenance stays as currently supported. Original-only production and replay-only immutable emission remain unchanged.

Resolve service continuation contracts from the exact owner external registry, and then the execution version's corresponding external definition, as aggregate execution already does. Validate source/owner lineage and original observed response; do not infer external kind from an actor allowlist. Authored actor policy still governs new ordinary actor commands and session admission. The root makeSystem/registry review owns declaration validation and must preserve this distinction.

After response recording, prepared-child proof and queue retry reconstruction use the retained immutable payload/response/owner/origin plus fixed owner key, **once the retained producing VersionRepo can be opened**. Remove redundant current mapping/external-contract declaration lookup from this already-recorded reconstruction. This does not guarantee RPC proof retrieval when the producing owner's entire authored release is omitted: its version resource/schema owner still needs authored model definitions under Plan126 and can fail explicitly as unavailable. Do not invent a model-free fallback Repo, serialized executable schema or substitute current release. Producer startup still resolves its exact external definition before running or observing a response; definition absence before recording is an explicit recoverable diagnostic. No source-command lookup or new mapping replay is added. Retain ADR001's emission/lifecycle table and atomic observation+child queue boundary; no extra producer work table.

## Portable synchronous codec boundary for production

1. Delete the unused exported `isAsyncRunSyncFailure` from [error construction helpers](../../../packages/error/src/makeZerospinError.ts). Exhaustive current first-party package/example/source lookup finds only its declaration; the error barrel indirectly exports that file, while SDK barrels do not reexport this helper. Diagnostic text search for AsyncFiberException is not classification authority. Remove the export without an alias and reconcile the stale error README during documentation work; actual precise domain classifiers remain at their owning boundaries.

`asyncOperations/makeAsyncOperations.ts:120` currently enters the shared managedRuntime again merely to finish portable payload and response codecs. It also catches a thrown AsyncFiberError without explicitly stopping/flushing the suspended fiber. Keep the external producer on the normal inherited runtime with its services; isolate only portable input/response codecs with `Context.empty()` and run each stage through one feature-local synchronous boundary using `Effect.runSyncExitWith`, not managedRuntime reentry.

Before an external request, complete frozen-payload decoding once. After a request, complete response type validation, response encoding and JSON validation together in one portable synchronous boundary, then enter `recordResponse`'s existing atomic observation/child-enqueue transaction. A portable codec has no System or SQL services; missing services fail rather than borrowing producer runtime authority. If a codec suspends, interrupt its AsyncFiberError fiber and flush its dispatcher before returning to producer retry handling. Only a sole recognized suspension is classified as `program-must-be-synchronous`; preserve other typed failures, defects, interruption and composite Causes with `Effect.failCause`. The producer's existing catchCause then records its recoverable diagnostic/deadline; it must never record an observation from a codec that was still running.

```ts
const runPortableCodec = <A, E>(program: Effect.Effect<A, E>) =>
  Effect.suspend(() => {
    const exit = Effect.runSyncExitWith(Context.empty())(program);
    if (Exit.isSuccess(exit)) return Effect.succeed(exit.value);
    for (const reason of exit.cause.reasons) {
      if (Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)) {
        reason.defect.fiber.interruptUnsafe();
        reason.defect.fiber.currentDispatcher.flush();
      }
    }
    const reason = exit.cause.reasons[0];
    if (
      exit.cause.reasons.length === 1 &&
      reason !== undefined &&
      Cause.isDieReason(reason) &&
      Cause.isAsyncFiberError(reason.defect)
    ) {
      return Effect.fail(makeZerospinError('program-must-be-synchronous'));
    }
    return Effect.failCause(exit.cause);
  });

const produceAndRecord = Effect.fn('produceAndRecord')(function* (work) {
  const contract = yield* resolveOriginalExternalDefinition(work);
  const payload = yield* runPortableCodec(
    decodeFrozenProducerPayload(contract, work.payload),
  );
  yield* retainProducerDeadline(work, contract.external.timeoutMs);
  const response = yield* runExternalProducer({
    external: contract.external,
    payload,
  });
  const json = yield* runPortableCodec(
    encodeRecordedExternalResponse(contract.external, response),
  );
  yield* recordResponse(db, work.asyncCommandId, json, new Date(now()));
});
```

The actual producer still applies its existing timeout that interrupts and waits for finalizer settlement, reschedules failed work and starts independent child delivery. Remove the now-unused managedRuntime dependency from `makeAsyncOperations` and its two VersionRepo constructors. Keep the actual outer `run`/background dependencies needed to launch producer recovery. Remove its no-caller `settle`/`activeCount` return members after an exhaustive consumer check; do not build a generic runtime registry or move this external observation policy into core transaction primitives.

## Ordering, errors and lifecycle

1. Public envelope failure precedes all transaction work. Inside the transaction, errors follow submitted occurrence order: an earlier retained mismatch or new-command declaration failure wins over a later one. This intentionally replaces the prevalidation-pass error order.
2. Preserve public typed domain codes for malformed envelope, service mismatch, unsupported new release, forbidden actor, payload/claims, immutable identity, producer continuity, exhausted source index and recorded-proof mismatch. Keep public response forbidden even for retries through ordinary ingress. Service's recognized synchronous suspension remains `program-must-be-synchronous`; ordinary aggregate follows Plan102's explicit admission code policy. Implement recognition at each owning admission boundary with catchCause, only for the sole recognized suspension reason; preserve other defects, interruption and composite Causes after rollback. Root core makeTx already preserves full Causes; do not add an admission policy hook to it.
3. Remove service admission's semaphore if its sole invariant is local admission serialization: synchronous SQL transactions already provide that boundary. Queue recovery leases/lifecycle are independent, acquired before a producer can commit delivery work; they do not justify holding an admission permit while waiting on a downstream drain. Coordinate the exact shared outbox API with root queue review.
4. Keep array receipts and exact retained source version/index. SystemApi must route result recovery by that retained receipt; the API reviewer owns predeclaration removal and wrapper-versus-command identity binding there.
5. Preserve immutable producer response evidence and the child ID across delivery failure/rejection. Do not run the external effect again merely because canonical admission refuses a child. Preserve structured cause details in the existing `async-admission-failed` facade instead of reducing every error to `String(error)`; do not normalize authored defects/interruption into public refusal.

## Parent shapes

```ts
const admitServiceCommands = Effect.fn('admitServiceCommands')(
  function* (props) {
    const commands = yield* decodeBoundServiceEnvelope(
      props.commands,
      props.key,
    );
    return yield* admitOrdinaryServiceCommandsTx(props.db, commands, props.key);
  },
);

const admitOrdinaryServiceCommandsTx = makeTx('admitOrdinaryServiceCommandsTx')(
  function* (tx, commands, key) {
    const receipts = [];
    for (const command of commands) {
      const retained = yield* readRetainedServiceReceiptTx(tx, command, key);
      if (retained !== undefined) {
        receipts.push(retained);
        continue;
      }
      yield* validateNewOrdinaryServiceCommand(command, key);
      yield* validateServiceProducerContinuityTx(tx, command);
      receipts.push(yield* appendServiceCommandTx(tx, command));
    }
    return receipts;
  },
);

const admitServiceAsyncCommands = Effect.fn('admitServiceAsyncCommands')(
  function* (props) {
    const delivered = yield* decodeRecordedServicePage(props.rows, props.key);
    const commands = yield* verifyRecordedServiceChildren(delivered, props.key);
    return yield* admitRecordedServiceCommandsTx(props.db, commands, props.key);
  },
);

const admitRecordedServiceCommandsTx = makeTx('admitRecordedServiceCommandsTx')(
  function* (tx, commands, key) {
    const receipts = [];
    for (const command of commands) {
      const retained = yield* readRetainedServiceReceiptTx(tx, command, key);
      if (retained !== undefined) {
        receipts.push(retained);
        continue;
      }
      yield* validateRecordedServiceContinuation(command, key);
      receipts.push(yield* appendServiceCommandTx(tx, command));
    }
    return receipts;
  },
);

const makePreparedServiceCommand = Effect.fn('makePreparedServiceCommand')(
  function* (work, key) {
    yield* validateRecordedServiceWork(work, key);
    const caller = makeRetainedServiceCaller(work.origin);
    return yield* encodePreparedServiceCommand(work, key, caller);
  },
);
```

`verifyRecordedServiceChildren` returns only commands proven equal to the retained producer reconstruction; validation does not authorize arbitrary decoded external responses. The explicit aggregate async parent follows the same domain order while using aggregate owner fields and approved aggregate retention procedures. Keep tiny null/shape checks inline; extract meaningful declaration/retention responsibilities only.

## Files and consumers

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    ~ ServiceChain/{ServiceChain.ts,admitServiceCommands/**,admitAsyncCommands/**}
    + ServiceChain/admitServiceCommands/{validateNewOrdinaryServiceCommand.ts,
        readRetainedServiceReceiptTx.ts,validateServiceProducerContinuityTx.ts,appendServiceCommandTx.ts}
    + ServiceChain/admitAsyncCommands/{validateRecordedServiceContinuation.ts,admitRecordedServiceCommandsTx.ts}
    ~ AggregateChain/admitAsyncCommands/** (reuse Plan102 retention phases, remove independent runner/prepass)
    ~ checkAdmission.ts (ordinary authored payload/claims check only, no generic trust switch)
    ~ ServiceVersionRepo/utils/{bindServiceExecution.ts,prepareServiceOutput.ts}
    ~ ServiceVersionRepo/{getPreparedAsyncCommand/**,ServiceVersionRepo.ts}
    ~ AggregateVersionRepo/{getPreparedAsyncCommand/**,AggregateVersionRepo.ts}
    ~ asyncOperations/{makeAsyncOperations.ts,prepareAsyncOperation.ts,readPreparedAsyncCommand.ts,asyncOperationsDbConfig.ts}
    + asyncOperations/runPortableCodec.ts
  ~ packages/error/src/makeZerospinError.ts (delete unused isAsyncRunSyncFailure export)
  ~ packages/error/README.md (remove obsolete static/serialize examples)
```

Affected retained-producer queue prepare/getPreparedAsyncCommand callers are the two VersionRepo classes and the two Chain async entrypoints. Ordinary service callers are `ServiceActorVersionChain/onMessage/pushServiceCommand.ts`, `SystemApi/executeServiceCommand/executeServiceCommand.ts` plus System app dispatch; canonical receipt routing is the API review. Shopping's marketplace mapped checkout and appWorker demonstrate the actor/owner-emission workflow. System-origin async behavior is an explicit proposed authority correction rather than a verified current product caller. Core `AsyncCommandSchema`, service command/provenance types and System declaration validators must agree with system-origin service continuation; do not introduce a wire origin field if `caller:null` already represents it. No client-facing async admission SDK is added.

## Implementation order and verification

Current Nx project metadata was inspected read-only. Required meaningful implementation gates are core `lib`/`lint`/`tsc:typecheck` and browser/system-worker/dev-worker/production-worker `lib`/`ts`/`lint`, scoped to affected projects through `pnpm nx run <project>:<target>`. Inspect the resolved command before execution: an inferred `tsc:typecheck` disabled as an echo is not verification. Existing inferred dependencies remain governing. No build, lint, typecheck or test ran during this review.

1. Finish approved Plan102 ordinary aggregate admission and coordinate root makeSystem/transaction/queue decisions. Establish ordinary versus recorded external authority in the actual service registry and source/execution binding.
2. Move service retained recovery and new validation into the synchronous page transaction; delete checked Map, prelookup/predecode, nested runner and redundant admission permit. Preserve exact supported input bytes and whole-page rollback.
3. Rework aggregate/service async ingress to exact recorded proof outside the transaction and explicit recorded-continuation transaction parents. Remove trustedAsync and ordinary-actor external-name checks. Keep proof validation before any local commit.
4. Retain service system origin on original emissions, generate caller-null system children, and decouple already-recorded proof/queue reconstruction from current definitions. Replace captureCodec with the isolated synchronous/cancelling portable codec boundary, preserving producer timeout/settlement/retry and atomic response recording. Coordinate SystemApi retained receipt routing and registry rules; external request behavior and business idempotency requirements remain unchanged.
5. Discover existing configured Nx core/system-worker and Shopping lint/typecheck/check targets; use existing authorized contract/RPC/Workerd seams. Required cases: unchanged retry after declaration removal, same-page repeated IDs and mismatch rollback, exact raw payload retention, producer index/identity conflicts, later-envelope failure versus earlier transaction failure, sole suspension versus composite Cause, forged recorded response, owner mismatch, a valid system-origin service external emission where such an authored contract exists, actor emission absent from browser allowlist, replay without production, recorded-response delivery without a current mapping/external-contract lookup once the producing owner can be opened, explicit unavailable-owner proof refusal after entire producing release omission, and lost child acknowledgement. No new test files/fixtures/runners/config or runtime probes are authorized. Review performed no checks.
6. Update glossary with ordinary admission versus recorded continuation authority and service system provenance. Record a qualifying ADR only for an actual authority decision not already in ADR001/005; preserve their original-only production and frozen continuation rules. Update README/error-order docs and archive after implementation and required existing verification.

## Limits

The current source demonstrates the administrative async exclusion and actor-allowlist coupling. This review has not executed Shopping checkout or established an actual current system-origin service async caller. Recorded-child recovery is conditional on opening its retained producing owner. Removing a redundant declaration lookup does not make an omitted authored release/model schema available; proof RPC and delivery can still fail with the explicit unavailable-owner outcome. Current registered external declarations may deliberately repeat an actor binding for browser-authored lookup; removing that redundancy from authoring itself belongs the root registry review, not a speculative expansion here. No fallback authority, compatibility decode or retained-row translation is proposed.

## Coordinated plan dependencies

1. [Plan105](105-plan-immutable-authored-declarations.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
2. [Plan107](107-plan-contract-evaluation-phases.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
3. [Plan108](108-plan-model-operation-codecs.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
4. [Plan110](110-plan-sqlite-execution-and-commit-observation.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
5. [Plan118](118-plan-version-result-owner.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.

## Implementation progress — 2026-10-11

Ordinary service admission has one whole-page decode and one ordered retry-first transaction. Recorded aggregate/service continuations verify every producer-owned frozen child outside SQL before a distinct synchronous retention transaction. Source-owner external authority is separate from ordinary actor allowlists. Portable codecs run without producer service context, cancel suspension before classification and preserve full mixed Causes. System-origin service children retain caller null. Unused managed-runtime capture and settle/activeCount surface are removed.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Verified ordinary admission bytes — 2026-10-11

Ordinary actual actor/service submissions retain exact raw payload bytes: [Plan102](102-plan-aggregate-command-admission-orchestration.md) verifies the genuine `createGame` input and finalized retry; [Plan130](130-plan-administrative-execution.md) verifies a retained `createProduct` input and final result. Reusing either ID with one additional leading whitespace byte returns the exact typed identity-mismatch refusal even though decoded JSON is equal. All inspected journal/resource rows remain unchanged. A fresh genuine aggregate Node's skipped push index also returns its exact typed refusal without retention. Those bounded facts were verified before the complete controlled authority/provenance matrix below.

### Verified configured aggregate continuation — 2026-10-11

The existing authorized TicTacToe human actor submitted two genuine mapped `playX` commands. Each retained an original `asyncPlayO` emission; the configured computer producer recorded its actual response and the frozen child finalized under the retained aggregate owner and actor provenance. [Plan118](118-plan-version-result-owner.md) records both source/result identities, responses1/3, all six public hashes including the subsequent ordinary guard failure, and durable physical retention. The browser session declaration/lock includes `createGame` and `playX`, while `asyncPlayO` is absent from that selected lock. The authored human actor's full contract registry does include `asyncPlayO`; this establishes continuation outside the selected browser lock, not absence from the actor's ordinary contract registry. System-origin service production, altered frozen proofs, callback-free replay and controlled recovery were still unrun at that point and are verified below. The source/type/consumer gates after the Node replay correlation repair pass as recorded in [Plan116](116-plan-node-command-journal-and-subscriptions.md).

### Completed ordinary/recorded authority verification — 2026-10-11

The human authorized disposable controlled verification fixtures. Current-output ordinary admission runs in [Plan102](102-plan-aggregate-command-admission-orchestration.md) verify aggregate/service exact raw bytes, retry before disappeared/currently refusing declarations, whole-page repeated-ID/mismatch rollback, full producer identity including serviceVersion, safe order/allocation, whole-envelope versus transactional error precedence, and sole suspension versus composite Cause. `/tmp/zerospin-framework-goal-server-qvh4z87h/external-results.log` verifies genuine system-origin service production, caller-null frozen children, altered recorded response/payload/owner/extra-field refusal, and execution-version replay that retains immutable emissions without new producer calls.

The controlled actor2 declaration exposed the old actor-local requirement that every mapped external dependency also appear in its ordinary registry. The focused repair gives exact external registration to the owning release: local actors still validate canonical/key/model/claims facts, and release composition validates every mapped external capability against its exact owner registry. Missing owner registration still refuses. Original release1/2/agent1 specifications remain equal; `authored-extensions-final.log` passes 9 assertions. The changed source compiles/typechecks/lints through the coordinated 21-task graph and actual core 4-task typecheck (`/tmp/zerospin-framework-goal-root-20261011/121-authority-{gates,core-typecheck}.log`).

`scoped-authority.log` passes 52 actual API/socket assertions. Genuine aggregate and service actor2 mapped originals produce frozen children while `externalSet` is absent from each actor's ordinary registry and present as the exact owning-release capability. Original/child IDs are aggregate `cmd_DDZywYN_JddqUC7bNpKdt`/`cmd_TwIavatYR-UtZnIyfuJiR` at7/8 and service `cmd_W8zwejk9k7onEJAQeSmtn`/`cmd_fybGxDStV6-eKEoTwhQUD` at11/12. The response is 85; child provenance retains actor2 and exact full claims, with Node/session/push null. Recorded authority preserves the producing release and canonical proof; it does not borrow browser ordinary permission.

`recorded-reconstruction.log` passes 35 assertions with unmodified real producer rows copied into real SQL.js. Production getPrepared and production outbox preparation reconstruct the exact frozen child under a canonical caller System with no authored definitions, then deliver it to the actual producing Workerd owner's proof/retained-receipt path. An explicit temporary transport-queue seed, plain RpcTarget base and alarm callbacks control only delivery/lifetime; they supply no command, result or receipt authority. The actual outbox commits acknowledgement and clears its delivery row. Actual recorded ingress recovers copied canonical Chain rows under that empty caller System using the real remote producer proof, with no table change. Omitting the producing release instead fails the production fixed-owner availability gate with `aggregate-version-unavailable`/`service-version-unavailable`; outer ingress returns `async-admission-failed` before the local transaction. Program/producer counters remain19/1/4/1 before/after. This proves the retained reconstruction and acquisition boundary; it does not claim an actual deployment was changed. First admission of a new recorded child still validates its owning external declaration inside the recorded transaction, as required above.

`/tmp/zerospin-framework-goal-data-core-UAv4C2/recorded-child-lost-reply.log` passes after discarding each genuine already-retained child admission reply at the client, then resending the unchanged child. Receipts recover the same aggregate8/service12; complete addressed Chain/VersionRepo framework rows, schema and bootstrapped identities remain exact, each source/result count stays1, and program/producer counters do not change. Host-private `_cf_*` row contents are excluded because actual SQLite forbids reads; earlier attempts to inspect them failed before submission. This is loss/retry of a retained child's reply, not an invented first-admission outcome. Other temporary callback-shape/transport setup failures occurred before successful overall assertions and are not product evidence.

Together these final checks cover every listed ordinary/recorded authority criterion. Matching module, architecture, glossary and ADR documentation is reconciled; no permanent verification fixture or compatibility path was added.

## Remaining work

None.
