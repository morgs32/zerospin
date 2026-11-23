# Plan 272: Remove Actor origin and the session-origin union

Status: Complete on 2026-10-26. Implemented and verified in `codex/remove-actor-origin`, based on `79c1824b1a`. Runtime storage resets, publication, deployment, and sibling consumer adoption remain outside scope.

## Goal and scope

Delete `IActorOrigin`, `ActorOriginSchema`, `IAggregateSessionOrigin`, and `AggregateSessionOriginSchema`. Use explicit Actor fields where identity crosses a seam, and actual claims alone where the Actor is already bound and validated. Remove objects manufactured solely to transport or compare those same facts.

Preserve authenticated identity, full claims equality, selected projection identity, private completion ownership, exact session/Node attribution, and existing rejection behavior. This is a representation cleanup, not a change to authorization, command execution, history retention, or replay ordering.

Do not advance Plan 270, change canonical command envelopes or selected session locks, redesign Agent identity, change Service Actor connections, introduce a replacement principal abstraction, or add compatibility paths. Preserve unrelated WIP. No new tests, fixtures, runners, configuration, spec files, or ADRs are authorized. Runtime storage resets, publication, deployment, and sibling consumer adoption remain separately authorized work.

## Agreed shapes

1. An initialized Actor session retains `sessionDefinition`, decoded `claims`, and `encodedClaims`, with the existing defensive copying. Remove `origin`; Actor name/version already live in `sessionDefinition`.
2. Actor command construction takes flat `actorName`, `actorVersion`, and encoded `claims`. It continues to construct `kind: 'actor'` commands with the same canonical fields and Node/session provenance supplied by the existing execution path.
3. Actor snapshot responses expose flat `actorName`, `actorVersion`, and `claims` alongside their existing aggregate/session/checkpoint/resource fields. No nested `origin` or redundant Actor discriminator is needed on this Actor-only response.
4. Requests crossing between Durable Objects retain flat `actorName`, `actorVersion`, and `claims` when the receiving method currently checks caller Actor identity against its bound projection key. Flattening must not silently remove these checks. After validation, local procedures can use claims and the bound key without reconstructing an identity object.
5. Actor socket forwarding carries the selected session lock and `x-zerospin-claims`; Actor identity comes from the lock and is checked against the receiving projection key. Keep trusted header stripping and synthesis in `SystemRepo.forwardSessionSocket`.
6. Actor connection attachments retain actual `claims` plus the existing aggregate/session/Node/phase facts. The bound projection key supplies Actor name/version. Agent attachments need no claims or repeated Agent identity; the bound Agent key selects their protocol and context. Use explicit Actor and Agent connection schemas/types, with the existing phase variants; do not introduce another owner discriminator or nullable dummy claims.
7. Private completion data uses the existing nullable `ICommandResolution`: `nodeId`, `pushIndex`, `sessionName`, `claims`, and `failure`. The containing Actor projection supplies Actor identity. No `ownerOrigin` or reconstructed resolution identity is needed.
8. Keep `IAgentOrigin` and `AgentOriginSchema` for existing Agent-only snapshot/header consumers. Remove only their participation in the shared session-origin union. Keep Agent snapshot wire fields unchanged; adjust its reuse of snapshot fields so flat Actor fields cannot leak into Agent snapshots. Leave Service Agent headers and their decoder unchanged.

No new shared identity wrapper, general schema registry, or composition framework is planned. Use existing domain methods and owner-local schemas.

## Implementation sequence

### 1. Remove the initialized-session duplicate

- In `packages/core/src/aggregateSession/makeInitializedAggregateSession.ts`, remove the `origin` property, its construction and getter, and its import. Keep admitted Actor name/version validation against the session definition, session metadata checks, claims codec handling, and cloned getters.
- In `evaluateAggregateSessionCommandTx.ts`, read Actor name/version from `sessionDefinition` and encoded claims from the initialized session. Pass them directly to `stageCommand/makeSessionCommand/makeSessionCommand.ts`.
- Change `makeSessionCommand` to accept those flat fields and emit the same canonical Actor command. Do not change payload validation, command IDs, staging, savepoints, or transaction boundaries.
- Update existing construction/type assertions only where the removed property is actually referenced. Do not reshape replica/Node storage merely because an ephemeral initialized-session property disappears.

### 2. Flatten Actor snapshots and snapshot requests

- Change `IAggregateSessionSnapshot` and `AggregateSessionSnapshotSchema` to the flat Actor response shape. This also removes the misleading Agent possibility from the Actor snapshot type.
- In `aggregateProjection/types.ts`, replace the shared snapshot request with explicit Actor and Agent request types. The Actor request keeps existing aggregate/session/Node facts plus flat `actorName`, `actorVersion`, and `claims`. The Agent request keeps its existing identity facts in the Agent-only shape; no Actor claims are added.
- Update `AggregateSessionApi.getSnapshot`, `AggregateActorVersionRepo.getSnapshot`, and projection snapshot capture. Compare request Actor name/version and aggregate identity against the bound key before reading resources. Preserve the claims-to-selected-projection check and exact captured checkpoint/publication verification.
- Route the validated Actor fields into `getResolvedThrough` without recreating `origin`.
- Update `AggregateAgentVersionRepo.getSnapshot`, `SystemApi.openAggregateAgentSession`, and the shared capture implementation only as required to remove the shared request/union. Preserve Agent name/version and session-name checks and its public-only snapshot semantics.
- Adapt `AggregateAgentSessionSnapshotSchema` so it retains its existing Agent-only `origin` and excludes the new Actor fields as well as `resolvedThrough` from reused snapshot fields.
- Update `fetchAggregateSessionSnapshot`'s decoder and `aggregateNodeNetwork`'s response checks. Preserve equality with the requested Actor name/version and session/aggregate release, and the later admitted aggregate-ID check.
- Update `resolveAggregateNode`, both snapshot authentication paths in `makeAggregateWorkerRuntime`, and `openAggregateNativeNodeOwner` to read `snapshot.claims`. Preserve expected-claims checks, Node definition verification, cancellation behavior, and offline discovery behavior.
- Keep `makeAggregateNodeBaseline` identity-free. No baseline or compact Node format change is implied by flattening the network response.

### 3. Remove the socket identity duplicate

- In `SystemRepo.forwardSessionSocket`, stop manufacturing an Actor `origin`. Forward actual claims in `x-zerospin-claims` and the unchanged aggregate session lock. Keep Agent-only forwarding intact.
- In `aggregateSessionChain/onConnect/onConnect.ts`, select the Actor or Agent path from the bound projection key. Actor decoding checks the lock's Actor kind/name/version against that key and decodes actual claims. Agent decoding continues to use `AgentOriginSchema` directly and retains the exact Agent context/lock and producer checks.
- Replace `connectionState.ts`'s shared origin field with explicit Actor/Agent attachment shapes. Select the appropriate decoder using the bound projection key; do not accept an arbitrary structurally valid attachment as evidence of the other connection family. Preserve phase transitions and existing aggregate/session/Node coordinates.
- Update `installConnection`, `readConnectionCapabilities`, `onMessage`, `replaySocketCommands`, and direct connection-state consumers. Protocol selection comes from the bound key; capability retention, cleanup on failed installation, and revalidation after attachment recovery remain in place.
- In `admitAggregateSessionCommand`, compare command Actor name/version against the bound Actor projection key and full command claims against admitted connection claims. Preserve every existing aggregate/release/session/Node, issued-Node, contract-version, and admitted-command equality check. Keep failure before canonical admission when any identity check fails.

### 4. Keep completion ownership in its existing representation

- In `applyEvaluatedCommandsTx`, keep the existing command Actor name/version and projection identity checks. Construct nullable `commandResolution` only after `ownsCompletion` succeeds.
- Pass that resolution directly into `commitProjectionTx` instead of `ownerOrigin` and separate nullable completion coordinates. Keep selected resources, pending delivery rows, and the materialization checkpoint committed in the same transaction. Do not change persisted resolution/outbox schemas.
- In `appendExposedCommands`, retain the existing resolution and pass it to broadcasts without reconstructing Actor identity. Replace `IAggregateProjectionBroadcast`'s repeated ownership fields with the nullable resolution and existing public output.
- In `AggregateSessionChain.broadcast`, require an Actor projection/validated Actor attachment, non-null resolution, matching full claims, session name, and Node ID before exposing a private failure. Agent connections continue to receive public output only.
- Flatten the caller identity fields in replay request definitions. Preserve cross-Repo caller name/version checks against the bound key before using claims-only comparisons locally. `getResolvedThrough` remains Actor-only and checks full resolution claims, session name, Node attribution, and contiguous push positions through the requested aggregate checkpoint.
- In `getBrowserCommands`, `validateNodeReplayPrefix`, and socket replay, preserve full claims equality for private completion selection, independent execution/push cursors, rejection of gaps, page limits, and redaction for other Nodes/sessions. Ordinary execution replay without private completion ownership must remain possible.
- Delete `commandResolutionOrigin` once these consumers no longer reconstruct a bundle.

### 5. Delete the superseded schemas and reconcile direct documentation

- Delete `contracts/AggregateSessionOriginSchema.ts` and all imports of its type/schema.
- Remove the Actor schema/type from `contracts/OriginSchema.ts`. Keep its Agent schema/type and Agent-only imports in place; do not rename the Agent module as part of this work.
- Remove obsolete exports/package entries only if they exist. Update actual callers rather than adding aliases or old-field decoders.
- Update directly affected module READMEs, current snapshot/socket architecture descriptions, relevant glossary entries, and existing expected-header/snapshot/attachment assertions. Do not rewrite unrelated plans or historical records to pretend this change was already implemented.

## Checks that must survive

1. Initialization rejects admitted Actor name/version or session identity that differs from the session definition/metadata; decoded and encoded claims retain their existing validation/copying semantics.
2. Cross-Repo snapshot and private-recovery requests reject mismatched caller Actor name/version before exposing resources or private completion information. Selected projection claim fields still match the bound Actor path.
3. Browser snapshot validation still rejects the wrong Actor release, aggregate/session selection, or expected claims. Native verification still constructs and verifies the Node definition using actual authenticated claims.
4. Socket forwarding strips caller-supplied trusted headers. Actor installation checks the lock against the bound Actor key and obtains claims only through trusted forwarding; Agent installation retains its exact identity/lock/producer checks.
5. Socket command admission requires exact Actor name/version, full claims, aggregate release, session and Node attribution, contract availability, and equality of the admitted command returned by canonical admission. Projection partition identity alone never substitutes for full claims equality.
6. Snapshot private-prefix recovery, replay completion selection, and live failure delivery preserve full claims/session/Node ownership. Same projection path with different additional claims must not expose private completion data. Other connections continue to receive public execution changes with private failure data redacted.
7. Agent snapshots, protocol selection, capability checks, and public replay remain claims-free. Actor field removal must not weaken Agent identity checks or add an Actor branch to Agent-only consumers.

## Storage and rollout

The definite retained-shape change is Aggregate session connection attachments: they no longer contain the session-origin bundle. Old attachments must not receive a fallback reader or translation. Runtime rollout requires separately authorized disposal of affected retained connection attachments/connections, or an explicitly approved fresh environment. Preserve the existing invalid-state rejection/connection disposal path.

Actor snapshots and trusted Actor headers change wire shape and require coordinated in-repo producer/consumer changes. They do not by themselves justify resetting resource rows, retained commands, retained resolutions, pending delivery rows, tickets, selected locks, browser Node/replica stores, or Native compact stores. Inspect actual persistence of changed values during implementation and record exact additional affected storage, if any, before rollout. Changed fixed storage requires empty affected storage with explicit authorization; no reset is authorized here.

## Verification when implementation is authorized

- Inspect resolved Nx targets for the actually changed Core, System Worker, Browser, Native and SDK consumers once; run the smallest explicit project graph and required dependencies for library output, type checks, and lint. Never verify Explorer. No checks run as part of writing this plan.
- Adapt only existing tests/assertions and inline inputs affected by the shape changes. Do not create test files, fixture declarations, runners, or configuration. Use the smallest existing scenarios proving the preserved checks above; if a required behavior has no existing seam, record the gap instead of silently authorizing new test infrastructure.
- Run focused existing `pnpm nx run zerospin:test -- <existing paths> --maxWorkers=2` selections after consulting current test instructions. Prioritize native SystemApi trusted forwarding, Actor socket admission/prefix/replay, Agent Aggregate connections, and affected browser/Node verification scenarios. Compilation checks the complete test program; do not broaden runtime coverage without a concrete need.
- Search current production source, exports, and in-scope consumers for the four deleted symbols, reconstructed command-resolution identity objects, and Actor uses of `x-zerospin-origin`. Keep legitimate Agent-only origin usage. Check that Actor snapshots cannot decode as Agent snapshots and vice versa through their actual existing decoders.
- Report source/type/runtime evidence separately from browser/Native host evidence and runtime rollout. Preserve unrelated failures as explicit blockers without broad cleanup.

## Completion

Implementation is complete only when the deleted symbols and redundant objects are gone, in-scope callers/docs use the agreed shapes, preserved checks have the scoped verification evidence available through existing seams, and remaining evidence gaps are explicit. Archive this plan only after all agreed implementation and required verification/documentation are finished, or explicit cancellation/supersession. Runtime storage handling and rollout remain separately authorized operations.

## Implementation and evidence

- Deleted the four Actor/session-origin symbols and the reconstructed command-resolution identity procedure. Initialized sessions, Actor snapshot producers/consumers, trusted Actor headers, attachments, cross-Repo replay requests, and projection transactions use the shapes above. Agent-only snapshot/header shapes and all retained SQL schemas are unchanged.
- `NX_NO_CLOUD=true pnpm nx run-many -t lib ts lint -p @zerospin/core system-worker @zerospin/browser @zerospin/native @zerospin/sdk` passed, including required dependency builds. Existing unrelated lint warnings remain; no Explorer checks ran. Native's configured type target also ran its required bundle build; this is not Native host runtime evidence.
- `NX_NO_CLOUD=true pnpm nx run zerospin:test -- packages/system-worker/tests/native-system-api/native-system-api.workerd.spec.ts packages/system-worker/tests/agent-node-aggregate/agent-node-aggregate.workerd.spec.ts packages/system-worker/tests/aggregate-history-fanout/aggregate-history-fanout.workerd.spec.ts packages/browser/tests --maxWorkers=2` passed the complete test-program compiler and all 21 runtime tests across 5 selected files.
- Existing native SystemApi assertions prove flat authenticated Actor snapshot identity, wrong Actor-version cross-Repo refusal, trusted claims-header synthesis and spoofed header removal, full additional-claims equality in private recovery, private failure replay for the owning Node and redaction for another Node, and a real Actor WebSocket resume followed by rejection of a forged additional-claims command. Production Repo methods with unknown-valued RPC envelopes use the existing `runInDurableObject` test convention; no casts or production RPC typing changes were added.
- Existing Aggregate Agent tests prove the claims-free attachment/public observer behavior and exact binding after the representation change. Browser tests cover existing authentication/network lifecycles. Source review confirms canonical Actor and Agent snapshot shapes require distinct identity fields through their existing decoders and preserve full claims getters' cloning.
- Independent source review found no lost identity, claims, completion attribution, Agent protocol, checkpoint, or transaction checks. A source/export search found no remaining deleted symbols or Actor resolution identity reconstruction in packages.
- No new test file, fixture declaration, runner, configuration, compatibility path, storage reset, browser session, Native host session, publication, or deployment was introduced. The definite rollout concern remains the changed retained connection attachment shape, requiring separately authorized empty affected state; compact Node stores and retained command/resolution rows did not change.

## Remaining work

None.
