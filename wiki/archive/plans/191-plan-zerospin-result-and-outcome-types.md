# Zerospin result and outcome types

**Date:** 2026-10-15

**Status:** Cancelled and archived on 2026-10-26 by maintainer approval. The proposed direct success/error union and recordedAt rewrite were not implemented. Current canonical command outcomes retain result: Success | Failure and finalizedAt.

## Archival disposition — 2026-10-26

The maintainer approved cancellation of this representation rewrite. [CommandOutcomeSchema](../../../packages/core/src/contracts/CommandOutcomeSchema.ts) retains outcome.result with Success/Failure branches and outcome.finalizedAt outside both branches. [IResult](../../../packages/error/src/types.ts) remains the result union. No runtime defect was established that requires the proposed replacement; this archival is not verified completion. The proposal below is historical.

## Problem and intended result

Current `IResult<S, F>` represents either `{ _tag: 'Success', success }` or `{ _tag: 'Failure', failure }`. The failure contains another tagged object, usually the existing `ZerospinError`. Meanwhile the private `Outcome<L, A>` in `makeRpcApi` means either an arbitrary callback return or that return wrapped with a span link. Command and external outcome schemas repeat recording metadata inside each union branch. These names obscure three separate facts: the result, when it was recorded, and the execution diagnostics attached for transport.

Create a canonical direct success/error union, a minimal outcome containing it, and explicit extensions for recording time and a causal link. Keep `commandOutcome` and `externalOutcome` as the established domain field names; change their value schemas deliberately.

Current evidence: [result/error types](../../../packages/error/src/types.ts), [runtime errors](../../../packages/error/src/ScopedError.ts), [public error encoding](../../../packages/error/src/encodeError.ts), [RPC conditional wrapper](../../../packages/system-worker/src/makeRpcApi/makeRpcApi.ts), [logger envelopes](../../../packages/logger/src/types.ts), [command observations](../../../packages/core/src/contracts/CommandOutcomeSchema.ts), [external observations](../../../packages/core/src/contracts/ExternalOutcomeSchema.ts).

## Proposed contract

The domain shapes are:

```ts
type IZerospinSuccess<T> = Readonly<{
  _tag: 'ZerospinSuccess';
  success: T;
}>;

type IZerospinResult<T> = IZerospinSuccess<T> | IZerospinError;

type IZerospinOutcome<T> = Readonly<{
  result: IZerospinResult<T>;
}>;

type IRecordedZerospinOutcome<T> = IZerospinOutcome<T> &
  Readonly<{ recordedAt: Date }>;

type ILinkedZerospinOutcome<T> = IZerospinOutcome<T> &
  Readonly<{ link: ISpanLinkRecord | null }>;
```

These examples omit the narrow error parameter for readability. Implementation must preserve each caller's error codes, declared business scope/extra and `never` failure inference. A success must remain distinguishable even if its payload resembles an error. Use `_tag: 'ZerospinSuccess'` as recommended above and keep the existing error tag `_tag: 'ZerospinError'`.

The error branch is the existing error value itself. Remove the extra `{ _tag: 'Failure', failure: error }` layer. Do not redefine runtime `IZerospinError` as a success/failure envelope, replace its class hierarchy, or widen typed failures to `unknown` to satisfy a generic.

Runtime errors and serialized errors remain distinct representations. Define wire results using the existing `ErrorJson<E>`/public-error codecs while retaining the same direct union shape. A serialized JSON error must not be cast to a runtime Error instance. Constrain any error generic to the existing common public Zerospin error fields so both representations can be expressed without admitting arbitrary error branches. Preserve scoped business codecs and local recognition rules.

## Metadata names and ownership

- **`IZerospinOutcome`:** exactly `{ result }`. No optional timestamp/link fields that every caller must interpret.
- **`IRecordedZerospinOutcome`:** `{ result, recordedAt }`, with recording time required for either result branch.
- **`ILinkedZerospinOutcome`:** `{ result, link }`, where null means no causal link was established. Prefer this to `ITelemetryOutcome`: the added fact is a link, and the name does not suggest an outcome of telemetry export.
- **Internal RPC:** retain its full `{ result, telemetry }` responsibility, expressing `IRpcEnvelope` through the common outcome representation. A complete telemetry batch is not interchangeable with the public span link. Keep telemetry types/codecs in logger; error/result types must not import logger.

When a caller genuinely needs both recording time and a link, compose those metadata fields on the same outcome. Do not wrap the result twice or invent a combined type before a caller needs it. Neither link nor full telemetry belongs in durable command/external observations.

Base result/outcome types and recorded-outcome primitives belong in the existing low-level error/result package. The linked specialization belongs in logger, where `ISpanLinkRecord` already lives. Share canonical codecs rather than copying success/error structs into core, Studio and logger. Use the supplied success/error codecs to preserve each interface's validation and JSON portability requirements.

## Recorded observations

**Command outcomes** become recorded outcomes whose success is the encoded contract result and whose error is the encoded public command error. Keep the first `recordedAt` sampled by the executing workflow after evaluation or retained refusal, alongside its durable outcome write. Original receipt delivery copies it unchanged. A different release's replay retains that release's own observation, without replacing the Chain's original one.

**External outcomes** become recorded outcomes whose success is validated/encoded with the external contract's response codec. Represent the recorded request failure through the existing typed `IZerospinError<'external-producer-failed'>` and its public encoding, replacing the separate `ExternalRequestFailure` wire branch. Preserve its meaning: no usable response was obtained, and the remote effect may nevertheless have occurred. This is not automatically a command business failure; the continuation may handle it and succeed. [Existing producer error](../../../packages/core/src/contracts/runExternalProducer.ts), [current observation recording](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts).

For both domains:

1. Keep pending as null outside the recorded-outcome union. A recorded success with a JSON-null payload remains an explicit success, distinct from no observation.
2. Put `recordedAt` once beside `result`, not on the success/error value itself. Decode as `Date`; preserve the existing date-string JSON encoding and precision.
3. Sample at the first durable observation and retain it atomically with the work that depends on it. Retries, lost acknowledgements and delivery recover the exact stored value rather than sampling a replacement.
4. Keep `executionStartedAt`, resource application times, span times and receipt time distinct. Do not use one as a substitute for recording time, and make no claim that `recordedAt` is an exact SQLite commit instant.
5. Do not add recording timestamps to ordinary RPC/HTTP outcomes merely because their type is an outcome.

This changes external continuation consumers from the old `_tag`/`failure` wrapper to `externalOutcome.result`. Remove the superseded public `IExternalRequestFailure` export and update in-scope SDK/type consumers; add no alias. Keep domain-specific `ICommandOutcome`/`IExternalOutcome` names only as meaningful specializations with their actual codec constraints, not compatibility copies.

## Implementation sequence and scope

1. **Canonical result types/codecs:** implement/export success, direct result, minimal outcome and recorded outcome from `packages/error`. Reuse error serialization and declared business codecs. Remove `IResult` after converting its first-party consumers; preserve narrow inference at runtime and wire interfaces.
2. **Telemetry and RPC:** update logger types, result/envelope schemas, `encodeRpcExit`, `makeRpcEnvelope`, `readRpcEnvelope`, `reportRpcTelemetry` and worker invocation encoding. Match the direct result branches. Merge remote telemetry before returning or failing, and preserve the domain result when diagnostic export fails. The current `ILinkedRpcEnvelope` is replaced by the canonical linked outcome rather than kept as an alias.
3. **Declared APIs and browser/Studio readers:** update ordinary payload `onSuccess` callbacks to construct `IZerospinSuccess`, and ordinary payload `onFailure` callbacks to return the serialized Zerospin error directly. Update SDK/browser/native/HTTP receivers and `fetchStudioJson` to the same schemas. Helpers returning a bare result should be named `encodeRpcResult`/`decodeRpcResult`, replacing the misleading `encodeRpcOutcome`/`decodeRpcOutcome`; envelope readers keep their concrete transport responsibility.
4. **Capability interfaces:** preserve Gateway/access methods whose callbacks return live success/refusal capabilities rather than result objects. Do not wrap RPC capabilities or plain worker values just to fit a domain outcome. Replace the private `Outcome<L, A>` name with a transport-return name such as `RpcReturn<L, A>` for its remaining conditional callback-return role. Linked ordinary payload methods use `ILinkedZerospinOutcome` with exactly one `{ result, link }` layer.
5. **Durable workflows:** convert command/external outcome schemas and all current writers, Chain receipt validators, execution packet/result consumers, projections, external continuation preparation and SDK declarations. Follow current source after concurrent ownership work; do not restore removed `asyncOperations` or retained history in resource-owning Repos. Only the result/observation representation changes here, not table ownership or delivery responsibilities.
6. **Checks and documentation:** update permitted existing checks/snapshots, glossary and relevant active patterns/architecture/READMEs. Replace superseded naming and examples in active guidance. Historical verification records remain historical. Coordinate with [Plan 143](../../plans/143-plan-optional-effect-telemetry.md) without changing its exporter/configuration work or claiming its remaining provider checks complete.

Effect's own `Exit`/`Result` success/failure tags and Causes are library contracts, not obsolete Zerospin result envelopes. Do not perform a blind repository-wide `_tag` replacement. Keep defects, interruption, composite Causes and rejected transport promises outside the ordinary typed result union. Preserve the external producer's already-defined observation boundary without generalizing it to other workflows.

For disposition hashes, adapt field access to the new recorded result while preserving the existing domain tuple and hash coverage. A change in wrapper shape is not a reason to change hash preimages, add an input fingerprint or claim stronger output integrity.

## Verification and completion

Use the current Nx project graph to select existing scoped type/lint and applicable runtime checks for error, logger, core, browser/SDK, worker and Studio consumers. No new tests, fixtures, test/check runners or configuration are authorized. This planning turn runs document checks only.

Required evidence in existing seams:

- Direct success/error narrowing, retained literal error-code/scoped-extra inference, runtime/public-error codec round trips and explicit JSON-null success.
- Plain outcomes, required recorded metadata, linked outcomes with both present and null links, and internal full-telemetry envelopes. No extra nested result wrapper or diagnostic fields in durable observations.
- Exactly-once observation recording with unchanged timestamp on retry, transaction rollback, original/refusal receipts, replay-local observation time, and external failure handled by a successful continuation.
- Command/external payload/result codecs and privacy remain enforced. Encoded failures retain public fields and scope without exposing private stack/cause.
- Existing capability-returning interfaces and raw worker returns keep their behavior. Typed failures, defects, interruption, composite Causes and transport rejection remain distinct. Telemetry export success/failure does not alter the domain result.
- Update API/protocol and disposition-chain-hash assertions together. Search in-scope owned interfaces for obsolete `IResult`, old Failure wrappers, old linked alias and copied local outcome schemas; do not flag Effect's own tags as migration failures.

Hard cut over all in-scope producers and consumers together. Changed fixed persisted representations require empty affected storage and rejection of old shapes: no compatibility aliases, dual protocols, fallback decoder, translation migration or automatic reset. This plan authorizes no reset, deployment or propagation to other repositories.

Record actual verification and remaining limitations, then archive this plan only when implementation and required checks finish. Preserve unrelated concurrent WIP.

## Remaining work

None under this archived plan.
