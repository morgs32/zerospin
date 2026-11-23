# Unified Agent Node definitions and query-owned behaviors

**Date:** 2026-10-21. **Status:** The row-subject proposal in the original research
was rejected and replaced by the command-payload hard cutover. This document
records that correction and the retained Agent design. [Plan 249](../archive/plans/249-plan-aggregate-agent-backend-node.md)
tracks Agent backend implementation and its remaining verification.

## Corrected finding

Keep one canonical, versioned Agent Node definition with query-owned behaviors.
Each behavior declares its visible query and optional ordinary commands. The
constructor derives schema, selections and capabilities; a live Node does not
replace the static registry. Query-only behaviors remain valid.
[Definition](../../packages/core/src/agent/makeServiceAgentNodeDefinition.ts),
[behavior compilation](../../packages/core/src/agent/compileAgentBehaviors.ts),
[registration](../../packages/core/src/system/make/makeSystem/validateAgentNodeDefinitions.ts).

Keep command inputs entirely in the ordinary contract's payload. A named domain
ID such as `reservationId` is an input; the contract declares readable `models`,
queries the current row and checks its business conditions inside evaluation.
`resourceId` identifies an individual recorded model operation, not a command
subject. Neither the selected row nor framework-injected row context replaces the
current database read. [Release contract](../../examples/shopping/src/zerospin/services/promotion/ReleaseUncommittedReservationV1.ts).

Browser Agent Sessions are observers: they own no originating command journal,
optimistic replay or timer. The System automatically hosts registered timed
definitions, and the durable Backend Node owns deadlines and delivery. Studio
provides selected-row inspection without command controls.

For a timed action, the behavior explicitly selects the complete command payload:

```ts
wakeAt: ({ row }) => row.expiresAt,
onWake: {
  contract: releaseUncommittedReservationV1,
  payload: ({ row }) => ({ reservationId: row.id }),
},
```

The selector freezes the inputs when creating the command. Admission and delivery retry preserve those inputs. Ordinary connected
sessions may optimistically replay unresolved inputs; Agent browser observers do not. The ordinary
contract then reads the current reservation; a selected snapshot is neither
authoritative execution state nor an implicit payload binding map.
[Reservations definition](../../examples/shopping/src/zerospin/agents/reservationsAgentNodeDefinition.ts),
[shared reconciliation](../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts).

Authoritative `exposedDelta` applies recorded resource changes. Reconciliation
reevaluates only unresolved original command inputs against the changed baseline;
it does not rerun finalized contracts to reconstruct their deltas.
[Parallel models](../../packages/sdk/skills/zerospin-parallel-models/SKILL.md),
[submission boundaries](../../packages/sdk/skills/zerospin-submit-commands/references/completion-boundaries.md).

## Historical rejected proposal

Everything below preserves the original investigation and pinned source evidence.
Its row-subject API, command `resourceId`, Agent binding and browser execution
proposals are rejected historical context, not current authoring instructions.
The payload contract above replaces them without a compatibility shape.

**Integer V1 cutover:** Shopping now registers only revision `1`; see the
[current Node definition](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/agents/reservationsAgentNodeDefinition.ts) and
[current registry](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/agents.ts). The earlier declaration
citations below are pinned to the inspected source snapshot and preserve the
research's historical design context.

## Historical finding

Keep one canonical, versioned Agent Node definition and remove the separate authored `AgentRelease`/`{ agent: release }` layer. Let behavior/query entries own their queries and explicitly declare any manual actions or timed command; derive the canonical selected graph instead of listing those queries again in a top-level `selections` record. Timing and actions are optional: query-only and manual-only entries are legitimate declarations. The model/schema context is derived from the queries and contract dependencies, so the Node definition also needs no authored `db` field. The projection graph, exact Agent/owner/version registration and command capabilities still exist in the compiled definition. A live Node instance does not replace that registry. [Current canonical responsibilities](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/agent/types.ts), [current registration checks](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/system/make/makeSystem/validateAgentReleases.ts), [current selected projection owner](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/ServiceAgentVersionRepo/README.md).

Replace generic **AgentContract `bind`** with a declared `row` model and a retained `resourceId` invocation context, separate from any extra `payload`. Canonical execution loads the current nullable row inside its execution transaction. This is a concrete proposed contract extension, not the current ordinary contract interface. It uses neither field-name/ID guessing nor whole-row snapshots. Current `modelId({ model })` records only the ID kind and abbreviation; it does not supply this new row-subject declaration. This conclusion concerns Agent row-to-payload maps, not JavaScript method binding or compiled SQL selection bindings. [Current Agent binding](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/agent/makeServiceAgentContract.ts), [current model ID implementation](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/modelId.ts).

Selection membership supplies eligibility for reservation expiry; no `stateField`, `states`, `initial` or private `waiting/releasing/finished` graph is needed. The Agent remains a query/capability view rather than a mutually exclusive state. Domain state changes remain ordinary commands and replay. [Existing reservation predicate](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/agents/reservationsAgentRelease.ts#L22-L35), [domain provenance](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/sdk/skills/zerospin-parallel-models/SKILL.md#L19-L54).

## Historical inspected source evidence

| Current source fact                                                                                                                                                                                                                                                                                                                                                | Design consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `makeServiceAgentContract` describes itself as row-form metadata without changing the canonical execution contract; its `bind` maps arbitrary compatible row fields into payload fields. Aggregate binding has the same role. Studio uses it for autofill/locked fields; it is not a generic canonical selected-row-membership or bound-value authorization check. | A dedicated row-action interface can remove this adapter without inventing a replacement for nonexistent binding authorization. Existing payload/contract validation and authoritative domain checks remain. [Service declaration](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/agent/makeServiceAgentContract.ts#L12-L98), [Aggregate declaration](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/agent/makeAggregateAgentContract.ts), [form projection](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/studio/src/AgentSelectionBrowser.tsx#L270-L340), [canonical Service evaluation](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/ServiceVersionRepo/utils/evaluateServiceCommand.ts), [canonical Aggregate evaluation](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts). |
| Reservations maps `id -> id`; Purchases maps `purchaseId -> id`. Studio's edit fixture also maps `capturedAt` and `metadata`, while `note` remains editable.                                                                                                                                                                                                       | Removing `bind` everywhere affects identity mapping and deliberate snapshot/form inputs. Decide which inputs are freshly loaded row context and which observations/edits are explicit command payload; do not silently drop or invent them. [Reservation binding](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/agents/reservationsAgentRelease.ts#L30-L35), [Purchase bindings](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/agents/purchasesAgentRelease.ts#L30-L40), [fixture inputs/bindings](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/studio/src/fixtures/agents.ts#L85-L145).                                                                                                                                                                                       |
| `modelId` emits `kind: Id`, abbreviation and scalar options; it does not retain the model name or declare which payload field is the action's subject.                                                                                                                                                                                                             | Model-ID type metadata alone cannot justify automatically putting the current row ID into `purchaseId`, especially when several fields share the same ID type. [Implementation](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/modelId.ts#L5-L32).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The release command accepts `{ id }`, loads the current canonical reservation, checks its status/Purchase binding and records `released`.                                                                                                                                                                                                                          | A row action should retain selected-row identity and load current authoritative context at execution. An observed whole-row payload cannot replace these checks. [Release command](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/services/promotion/ReleaseUncommittedReservationV1.ts#L12-L47).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Agent selection capture currently expects one query under each canonical model key and returns frozen captured `ISelection` descriptors.                                                                                                                                                                                                                           | Behavior-owned query derivation requires an explicit capture/union design; removing the top authoring record does not make the runtime graph unnecessary. [Capture](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L428-L466), [captured descriptor](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L399-L407).                                                                                                                                                                                                                                                                                                                                                                                          |
| The Purchases Agent exposes paid Purchases and all PurchaseItems, while its shown ordinary contracts use Purchase. Studio fixture commands declare both Item and Flag models.                                                                                                                                                                                      | Support independent inspection graphs and genuine multi-model command reads. Neither command model dependencies nor automatic actions alone fully describe the intended visible rows. [Purchases Agent](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/agents/purchasesAgentRelease.ts), [tracking contract models](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/aggregates/user/contracts/createTrackingLabelV1.ts#L14-L18), [fixture graph](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/studio/src/fixtures/agents.ts#L55-L145).                                                                                                                                                                                                                                            |
| Canonical Agent construction/registration validates exact owner/version/models, captured selection provenance and permitted ordinary contracts. Backend projection/retained stream use that canonical graph.                                                                                                                                                       | The unified constructor retains these checks and derives its graph/capabilities statically before any Node runs. Query derivation cannot silently select every row of a command's declared models. [Construction](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/agent/makeServiceAgentRelease.ts), [registration](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/system/make/makeSystem/validateAgentReleases.ts), [Repo](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/ServiceAgentVersionRepo/README.md), [Chain](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/ServiceAgentVersionChain/README.md).                                                                                                                                                                                                |

## Rejected row-action proposal

The proposed contract `row: promotionReservationV1` declares its subject model. The admitted command retains `resourceId` separately from `payload: {}`; callers cannot supply the authoritative row snapshot. Canonical execution loads nullable `row` in the same transaction as its checks and operations. The `row` declaration adds that model to the effective execution model graph, so it is not repeated in `models`; any additional read models still need explicit declaration. Existing ordinary commands without a row subject keep explicit payloads.

This replaces the current release contract's `{ id }` payload/read boilerplate. The following API is proposed, including `row`, derived model registration and the runtime invocation context. It is not runnable against the current factories.

```ts
export const releaseUncommittedReservationV1 = sdk.makeServiceContractVersion(
  sdk.defineServiceContract('releaseUncommittedReservation'),
  {
    version: 1,
    row: promotionReservationV1,
    payload: {},
    failures: {
      notReleasable: sdk.ContractError.schema({
        code: 'promotion-reservation-not-releasable',
      }),
    },
    operations: {
      updateReservation: promotionReservationV1.operations.update,
    },
    program: Effect.fn('releaseUncommittedReservationV1.program')(function* ({
      row,
      failures,
      operations,
    }) {
      if (
        row === null ||
        row.status !== 'reserved' ||
        row.purchaseId !== null
      ) {
        return yield* failures.notReleasable.make({
          message: 'The reservation must be reserved and have no Purchase.',
        });
      }
      yield* operations.updateReservation({
        resourceId: row.id,
        attributes: { status: 'released' },
      });
    }),
  },
);

const promotionQueries = makeQueryDbVersion({
  models: { promotionReservation: promotionReservationV1 },
});

export const reservationExpiryBehavior = makeAgentBehavior({
  query: promotionQueries.query.promotionReservation.findMany({
    where: {
      status: { eq: 'reserved' },
      purchaseId: { isNull: true },
    },
  }),
  wakeAt: ({ row }) => row.expiresAt,
  onWake: releaseUncommittedReservationV1,
});

export const reservationsAgentNodeDefinition = makeServiceAgentNodeDefinition({
  agentName: 'reservations',
  agentVersion: 1,
  systemName: 'shopping',
  sessionName: 'reservations',
  serviceName: 'promotion',
  serviceVersion: 1,
  behaviors: {
    reservationExpiry: reservationExpiryBehavior,
  },
});
```

The query builder remains an authoring tool. It is not an additional Node input or host storage connection. The Node-definition constructor derives the canonical graph and automatic contract capabilities from these cold declarations, validates owner/version/model identity and registers the resulting definition under `agents.reservations[1]`.

A complete removal of Agent `bind` must update actual callers/forms/spec projection around explicit row identity and additional inputs. Current tracking contracts use `{ purchaseId }`, and the Studio edit fixture deliberately copies `capturedAt`/`metadata` in addition to identity. Decide whether each such value is current canonical row context or an explicit edit/recorded observation; do not silently discard those semantics. This proposed row contract does not authorize a compatibility binder or an implicit snapshot of the whole selected row. [Current tracking input/read](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/aggregates/user/contracts/createTrackingLabelV1.ts), [current fixture inputs](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/studio/src/fixtures/agents.ts#L85-L145), [current form construction](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/studio/src/AgentSelectionBrowser.tsx#L322-L340).

## No authored db on the Node definition

A query already owns its authoring model context. `makeQueryDbVersion` creates a private `AuthoringSession` with frozen canonical models; `QuerySelection.prepareRead` compiles using that session's models. Its capture currently receives `db`, `model` and `key` again, checks schema/root-table provenance, and emits a descriptor carrying its canonical model plus the query DB's model registry. That is evidence for deriving the Node's context, not a reason to require callers to repeat `db` on the new definition. [Authoring model ownership](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L39-L44), [query compilation](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L117-L136), [builder construction](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L346-L379), [current capture inputs](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L185-L208), [captured model context](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L293-L314).

The unified constructor should capture each query against its own source context first, then combine their checked model contexts with declared contract subjects/dependencies. Do not construct a merged query DB and pass it to current capture: its exact schema/root-table provenance check would reject that different context. Distinct authoring query DB objects can be valid when each referenced model name resolves to the exact canonical owner-release model object; reject model/version conflicts rather than require incidental source-DB identity. Existing selection model validation provides this canonical-identity precedent. The current `capture({ db, model, key })`/provenance interface needs redesign to expose/retain its source context internally, since simply omitting its required argument would not implement the proposal. [Capture provenance](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/make/makeQueryDbVersion.ts#L185-L208), [canonical model validation](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/models/makeSelection.ts#L10-L20).

Model/schema availability is different from visible row populations. A query source may know several models so it can compile relations or predicates. Do not infer that all rows of every source model are selected; visible populations come only from the explicit behavior/query entries. Additional model dependencies do not silently grant query visibility or command capabilities.

## Behavior-owned queries and the canonical graph

For this reservation behavior, author the existing predicate once inside the behavior: `status === 'reserved' && purchaseId === null`. Its deadline is the recorded `expiresAt`; its wake action is the ordinary release row action. The unified Node definition consumes the named behavior record and derives the selected graph/allowed automatic command references. There is no separate top-level repeat of the same query or private status dispatch. These are proposed constructor responsibilities, not capabilities implemented by current `makeServiceAgentRelease`.

The general interface should handle these cases explicitly:

- **Manual/inspection-only Agents.** A passive behavior/query entry declares visible rows and optional manual actions with no timing hook. A supporting data-only query entry declares just its visible population. Neither requires a dummy timer. Canonical command capabilities are derived from explicitly declared manual actions and timed commands, not from mere query visibility.
- **Multiple query scopes and model graphs.** A command may need additional selected models, which must have explicit query entries. Keep one authored query per model in the initial design; reject conflicting same-model query scopes rather than silently choosing one or broadening to all rows. An explicit union/scoped representation for several queries over the same model is a future design decision. The canonical visible graph must contain exactly the authored populations, while automatic eligibility follows its own declared query.

The necessary invariant is one explicit source for visible populations and capabilities, statically compiled into one canonical versioned definition. A second user-authored `selections` list containing the same queries adds no domain meaning. The exact manual-action signature and any future query-union representation remain under discussion; the concrete row-action sketch above is proposed, and no runtime implementation is authorized by this research.

The definition remains cold and portable. Preserve Agent name/version, exact owner and session identity, derived schema/model authority, canonical selection capture, contract validation, system registration and discovery. Both chosen hosts instantiate the same definition. This removes authored duplication, not the registered selected snapshot/stream or permission facts. [Current root schema](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/agent/ServiceAgentReleaseSchema.ts), [current system registry](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/system/make/makeSystem/decodeSystemProps/decodeSystemProps.ts), [exact projection lookup](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/serviceAgentProjection/resolveServiceAgentView.ts), [portable spec projection](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/system/make/makeSystemSpec.ts).

`wakeAt` is an absolute timestamp or null; null disables the deadline. `reservePromotion` already writes `expiresAt = now + promotionDuration`, where `promotionDuration = 10 * 60 * 1000`. A row observed after its deadline is immediately due after reconciliation; observing/restarting does not begin another ten-minute delay. [Creation](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/services/promotion/ReservePromotionV1.ts), [duration](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/services/promotion/promotionPolicy.ts).

## Execution and persistence

1. Bootstrap/reconcile the chosen Node's authoritative selected graph. For each selected reservation, derive its current `expiresAt`. Backend reconstruction restores its committed checkpoint and pending responsibilities; a new browser lifetime has transient storage/timers.
2. Keep a cancellable deadline while the row is selected. Do not invoke `onWake`, stage the command or allocate its producer position before the deadline. A changed row recomputes the deadline; membership loss cancels obsolete unsent work.
3. On wake, catch up the retained selected stream through a fixed published boundary outside SQL. Recheck current membership and deadline in the Node transaction. An early wake submits nothing. Stream pages and duplicate alarms must not generate extra command identities.
4. When still due, retain the selected row ID as `resourceId` in the proposed invocation context, freeze one command identity with `payload: {}`, and retain its pending responsibility. Current source instead uses `{ id }`; the new context requires implementation across admission/execution/replay. The chosen Node's transaction owns selected progress, scheduling decisions and new pending input; network submission occurs outside it.
5. `ServiceChain` admits the ordinary command. `ServiceVersionRepo` loads/checks the current canonical reservation and applies its model operation. Admission acknowledgement alone is not canonical execution or private final exposure. The selected stream installs the command-derived change; successful release makes the row leave this selection.
6. Preserve exact command correlation while admission/execution is uncertain, even if the row leaves selection. Retry the same frozen command, not a new release on every alarm or reconstruction. Exact owned completion settles that responsibility. `promotion-reservation-not-releasable` stops/reconciles the attempt rather than starting an endless series of new commands.

The bootstrap, transaction, source-checkpoint, pending-delivery and one-alarm-registry requirements are the existing backend design, not implemented guarantees of `makeAgentBehavior`. Browser behavior must observe authoritative selected state rather than its own optimistic changes. [Planned stream consumption](../archive/plans/249-plan-aggregate-agent-backend-node.md#startup-and-scheduling), [planned admission/retry](../archive/plans/249-plan-aggregate-agent-backend-node.md#runtime-responsibility--revised-by-plan-151), [planned scheduler](../archive/plans/249-plan-aggregate-agent-backend-node.md#startup-and-scheduling), [current Node baseline/optimism distinction](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/ServiceAgentNode/README.md).

Removing authored machine state does not remove Node runtime bookkeeping: current deadlines, frozen pending input, producer progress, stream checkpoint and exact owned completion still have durable/transient responsibilities. They are not another domain status or an append-only attempt log. A resource-owning Backend Node must not retain command/execution/audit/projected history; complete pending delivery and current checkpoints remain distinct. [Repository ownership rule](../../AGENTS.md), [current producer responsibility](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/core/src/ServiceAgentNode/README.md#L12-L26).

The existing release command deliberately has no expiry guard, so early manual release remains valid. The automatic behavior owns the ten-minute timing policy. Canonical command execution rechecks status and Purchase binding: if commitment wins first, the stale release refuses; if release wins, commitment refuses. Current commitment also refuses at or after expiry even before cleanup. [Release guard](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/services/promotion/ReleaseUncommittedReservationV1.ts#L30-L47), [commit guard](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/services/promotion/CommitPromotionV1.ts).

## Domain state and host choice

All authoritative domain transitions remain ordinary commands and replay. No behavior hook directly changes `status` or an invented `stateName`. A future workflow needing additional shared business state should declare that actual model and its commands; this deadline policy does not justify a generic machine runtime. Source command replay must not regenerate the timer action; the chosen Node's independent due event requests the new release command. [Parallel-model rule](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/sdk/skills/zerospin-parallel-models/SKILL.md#L19-L54), [Service materialization](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/ServiceVersionRepo/materializeCommandTx.ts#L16-L54), [retained restoration](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/ServiceVersionRepo/utils/restoreServiceResultTx.ts).

The same cold shared Node definition runs on `ServiceAgentNode` or `ServiceAgentBackendNode`, with exactly one chosen host per logical Node instance. Host-specific application layers/dependencies, storage, scheduling and executor choice remain external composition. Browser producer/timers are transient; backend producer/deadlines durable. The selected stream remains `ServiceAgentVersionChain` with `serviceIndex` and `dispositionChainHash`. This design adds no distributed lease, automatic failover or cross-host transfer; changing hosts must settle the previous executor's pending responsibility. [Shared-host design](../archive/plans/249-plan-aggregate-agent-backend-node.md#runtime-responsibility--revised-by-plan-151), [selected stream owner](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/packages/system-worker/src/ServiceAgentVersionChain/README.md).
