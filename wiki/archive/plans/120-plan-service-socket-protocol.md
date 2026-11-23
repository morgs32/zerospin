# 120 — Explicit service session protocol and replay-to-live handoff

Status: Implemented and verified in the approved goal on 2026-10-11.

## Source evidence

1. [ServiceActorVersionChain.onMessage](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/onMessage.ts) decodes a push shape and otherwise treats an untagged object as initial resume. Server replay is an array, live publication is one untagged browser command, and control replies use tagged objects.
2. [Browser synchronization](../../../packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts) therefore manually parses JSON and branches on array/object/property presence. Admission and replay receipt schemas at358/388/436 use bare `Schema.Number`. [Service snapshot/browser schemas](../../../packages/core/src/serviceSession/ServiceSessionWireSchema.ts) require integer but not safe-integer positions.
3. [Broadcast](../../../packages/system-worker/src/ServiceActorVersionChain/ServiceActorVersionChain.ts) closes every replaying connection with `service-session-output-replay-raced` when output arrives. Under continued publication a reconnect can repeatedly lose replay progress. The replay loop follows a moving publication tip rather than delivering a bounded segment and joining live publication synchronously.
4. [Node outcome reader](../../../packages/system-worker/src/ServiceActorVersionChain/getNodeOutcomes.ts) reads the complete node history before truncating output. [Replay handling](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/onMessage.ts) rereads/redecodes rows to recover private completion ownership that its public page reader omitted.
5. The removed `pushServiceCommand` accepted a singleton receipt by ID without comparing all immutable input or requiring safe positive retained positions; [admitServiceSocketCommand](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/admitServiceSocketCommand.ts) now owns that complete receipt proof. [Connection admission](../../../packages/system-worker/src/ServiceActorVersionChain/onConnect/onConnect.ts) embeds the complete authored lock in hibernation state; aggregate sessions already store that large lock in SQLite and keep the attachment compact.
6. [Aggregate replay](../../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts) already implements fixed segments and a bounded synchronous join after Plan103. Preserve that design; do not wrap it in another generic callback protocol.

## Protocol contract

Add a shared core `ServiceSocketProtocolSchema.ts` alongside `ServiceSessionWireSchema.ts`, with explicit client and server tagged unions and schemas used by both browser and selected-view server. Decode a message once through its union; no array/single-row guessing or permissive JSON property dispatch remains.

Client messages:

1. `{ type: 'resume', nodeId, outcomeIndex, serviceIndex, dispositionHash }`.
2. `{ type: 'pushServiceCommand', command }`, with exact supported ordinary service command fields and no external observation field. Server admission still performs canonical envelope/domain validation; a browser protocol codec is not canonical authority.

Server messages:

1. `{ type: 'commands', commands: [...] }`, for both replay and live delivery, bounded to at most64 rows per message.
2. `{ type: 'replay-complete', serviceIndex, dispositionHash, outcomeIndex }`.
3. `{ type: 'serviceCommandAdmission', id, pushIndex, admissionIndex }` and `{ type: 'serviceCommandAdmissionFailed', id, failure }`.
4. `{ type: 'state-required' }` for a missing/conflicting durable checkpoint or invalid private prefix.

All positions are safe integers: nonnegative for cursors, strictly positive for admitted/command positions; exact ID/hash schemas are shared. `admissionIndex` is the retained service source position, while `pushIndex/outcomeIndex` describe the requesting producer's private command sequence. Do not infer either from the other. The version-journal plan removes confirmed `executedIndex/serviceHash`; use `serviceIndex/dispositionHash` outright in protocol, snapshots and Node metadata. No legacy arrays, bare live commands, untagged resume, duplicate cursor fields or fallback decoder.

## Connection, replay and admission ownership

Persist the admitted service lock under connection ID in SQLite. Keep a compact attachment union with `awaiting-resume`, `replaying` and `live` phases, bound identity/session, admitted producer identity, and optional pending command claim only in live state. Rehydrate/validate the retained lock before use; remove it on connection close. Ticket-derived owner and claims remain authoritative. The gateway reviewer owns ticket/capability admission changes.

On resume validate the public prefix hash and the private contiguous outcome prefix against the exact admitted actor version, session, claims and node. Capture one fixed durable journal tip. Page public occurrences and older privately owned outcomes independently through that fixed boundary. Old outcomes carry no resource changes already included in the snapshot and must not advance its public cursor again. All outcomes belonging to other producers/sessions/claims are redacted. Invalid gaps, impossible cursors or conflicting hash require a fresh snapshot and close; ordinary publication during replay does not.

After a fixed segment, inspect the current durable tail. If its public range exceeds64, start another fixed segment with a captured tip and continue bounded paging. If the remaining public/private tail fits a bounded page, synchronously read/filter/send it, send the complete public+private checkpoint, and mark the connection live in **one JavaScript turn with no await/RPC/Effect suspension between those operations**. Publication is committed before broadcast. A connection marked replaying receives no live broadcast; its rows remain durable. A connection marked live after the join receives subsequent postcommit publication. This closes the lost-publication window without an in-memory replay buffer or race-induced disconnect. Scope cancellation/late continuations are handled by the browser lifetime plan.

Only live connections may submit. Claim the submitted command before any awaited canonical admission RPC. Validate exact service/release/actor/session/claims/node and ordinary command binding. Submit the unchanged singleton supported input to ServiceChain. Compare the returned retained command's complete immutable identity and positive safe source position before replying. Release the pending claim on success, typed failure, defect or interruption; a reply cannot be sent through an obsolete/closed connection attempt. A retained matching retry is acknowledged with its old source position. Failure to observe a reply is uncertainty, not evidence to create a replacement command ID. Canonical admission order/authority belongs the separate [Plan121](121-plan-admission-authority.md).

## Parent method shapes

```ts
const onServiceMessage = Effect.fn('onServiceMessage')(function* (props) {
  const admitted = yield* readServiceConnectionAdmission(
    props.db,
    props.connection,
  );
  const message = yield* decodeServiceSocketClientMessage(props.message);
  if (message.type === 'resume') {
    yield* validateServiceResumePhase(props.connection);
    return yield* replayServiceSocketCommands({
      ...props,
      admitted,
      resume: message,
    });
  }
  yield* validateServiceLivePhase(props.connection);
  return yield* admitServiceSocketCommand({
    ...props,
    admitted,
    command: message.command,
  });
});

const replayServiceSocketCommands = Effect.fn('replayServiceSocketCommands')(
  function* (props) {
    let cursor = yield* validateServiceResumeCheckpoint(props);
    setServiceConnectionReplaying(props.connection, cursor.nodeId);
    for (;;) {
      const boundary = readServiceReplayTip(props.db);
      cursor = yield* sendFixedServiceReplaySegment(props, cursor, boundary);
      const joined = joinServiceReplayToLiveSynchronously(props, cursor);
      if (joined !== undefined) return joined;
    }
  },
);

const admitServiceSocketCommand = Effect.fn('admitServiceSocketCommand')(
  function* (props) {
    const claim = yield* claimServiceSocketCommand(props);
    return yield* Effect.gen(function* () {
      const input = yield* validateServiceSocketCommand(props, claim);
      const retained = yield* admitCanonicalServiceCommand(input);
      const receipt = yield* validateServiceAdmissionReceipt(input, retained);
      yield* sendServiceAdmissionReceipt(props.connection, claim, receipt);
      return receipt;
    }).pipe(
      Effect.ensuring(
        releaseServiceSocketCommandClaim(props.connection, claim),
      ),
    );
  },
);
```

`joinServiceReplayToLiveSynchronously` is a synchronous local DB/socket procedure with no Promise/Effect yield; do not express it as an async callback and hope it completes immediately. Failure to send closes that socket while leaving history intact. Every async page loop checks current admitted replay phase/connection generation after resumption. The browser decoder dispatches the union into `receiveCommands`, `retainAdmission`, `retainFailure`, or `completeReplay`; replay completion validates both public and private cursor/hash rather than only a Number-typed execution cursor.

## Files and consumers

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/core/src/serviceSession/
    + ServiceSocketProtocolSchema.ts
    ~ ServiceSessionWireSchema.ts
    ~ types.ts and filterServiceBrowserCommand.ts (single cursor/hash + private owner)
  packages/system-worker/src/ServiceActorVersionChain/
    ~ ServiceActorVersionChain.ts (compact attachment, retained locks, close cleanup, tagged broadcast)
    ~ serviceActorVersionChainDbConfig.ts
    ~ onConnect/onConnect.ts
    ~ onMessage/{onMessage.ts,pushServiceCommand.ts}
    + onMessage/{replayServiceSocketCommands.ts,admitServiceSocketCommand.ts}
    + connectionState.ts
    + readServiceBrowserCommandPage.ts
    ~ getNodeOutcomes.ts and getBrowserCommands/getBrowserCommands.ts (consolidate scoped bounded readers)
    - decodeServiceBrowserCommand.ts (if replaced completely by exact shared codec)
  packages/browser/src/ServiceNode/
    ~ ServiceNodeSynchronization.ts
  packages/core/src/ServiceNode/
    ~ ServiceNode.ts,serviceNodeTables.ts,types.ts
```

The selected-view plan may relocate service history readers but owns their storage, not this wire contract. Its snapshot and ticket gateway consumers must use the new schema/cursor. Exact source-index/hash callers are enumerated by the [Plan118](118-plan-version-result-owner.md). Browser lifetime code and wire code edit the same synchronization file during eventual implementation; coordinate a single final integration instead of restoring another worker's old loops.

## Implementation order and verification

Current Nx project metadata was inspected read-only. Required meaningful implementation gates are core `lib`/`lint`/`tsc:typecheck` and browser/system-worker/dev-worker/production-worker `lib`/`ts`/`lint`, scoped to affected projects through `pnpm nx run <project>:<target>`. Inspect the resolved command before execution: an inferred `tsc:typecheck` disabled as an echo is not verification. Existing inferred dependencies remain governing. No build, lint, typecheck or test ran during this review.

1. Agree/land shared strict protocol/cursor types with server and browser in one hard cut. Adopt the root bound-operation codecs and canonical version journal contract.
2. Install retained service connection locks and phased attachments; delete lock duplication and add close cleanup. Retain existing forwarded-ticket validation and bound identity checks.
3. Implement bounded scoped page reading, fixed replay segments and synchronous final join. Delete moving-tip race close and untagged publication. Validate independently recoverable historical private outcomes.
4. Implement canonical input/receipt comparison and finally-released live submission claim. Integrate the browser union decoder and complete replay checkpoint checks with its scoped connection attempt lifecycle.
5. Use existing configured core/browser/system-worker lint/typecheck targets and permitted Shopping server/RPC/Workerd workflows; use the Tic-tac-toe seam for browser reconnect behavior. Shopping application browser verification is prohibited by its AGENTS guidance. Required behavior checks: invalid/unsafe cursor rejection, ordered bounded replay, concurrent publication during replay, send failure repaired on reconnect, private outcome recovery below snapshot boundary, other-session redaction, duplicate/lost admission acknowledgement, a close during admission and interruption/defect claim release. No new test files, fixtures, probes/runners/config are authorized and no runtime check occurred during this review. Sustained-publication fairness is a verification requirement, not a measured claim.
6. Update protocol/cursor glossary and workflow docs, plus module READMEs. Record a qualifying ADR only if not already governed by the coordinated journal/selected-owner successor decision; avoid an ADR for a mere helper extraction. Archive after implementation and existing required verification. Existing sockets reconnect; affected fixed browser/DO storage follows the coordinated empty-storage cutover.

## Coordinated plan dependencies

1. [Plan111](111-plan-connected-worker-ownership.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
2. [Plan112](112-plan-agent-session-owners.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
3. [Plan113](113-plan-session-replica-bootstrap.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
4. [Plan116](116-plan-node-command-journal-and-subscriptions.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
5. [Plan117](117-plan-session-reconciliation-and-evaluation.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
6. [Plan118](118-plan-version-result-owner.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
7. [Plan119](119-plan-selected-view-owner.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
8. [Plan121](121-plan-admission-authority.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.

9. Shopping application browser verification is prohibited by its AGENTS guidance. Verify this service wire through permitted server/Workerd seams or the Tic-tac-toe browser seam; do not treat Shopping application browser use as an authorized gate.

## Implementation progress — 2026-10-11

The strict shared union, safe cursors, retained SQL lock, compact phases, exact receipt claim, bounded fixed replay and synchronous replay-to-live join are implemented with their direct browser consumer. Scoped source lint passed with zero warnings/errors. Supplementary disposable SQL/protocol checks passed malformed/unsafe union refusal, bounded public/private pages, exact historical full-claims equality, private gaps/redaction and seventy-one-row replay with concurrent local publication. A supplementary actual socket/snapshot procedure check preserved encoded NumberFromString claims and refused a wrong actor partition. These isolated checks created no files and are not the plan's required existing host acceptance gates.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Verified real aggregate replay below a captured baseline — 2026-10-11

The existing TicTacToe human@1.0.0 declaration and canonical session lock authorized the genuine retained owner `acct_ba36661779d14154bbd4d6bc24eb3d44`. A normal ticket opened the actual aggregate route with HTTP101. The real owning Node `node_k2KSRxZyZGM2wnVRCzT8N` sent only the canonical resume frame with public aggregateIndex6/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049` and outcomeIndex0. The server recovered exactly the four retained private finalizations at public positions1,2,4,6, with original command IDs, followed by replay-complete at the unchanged public6/hash and outcomeIndex4. Using the other actual Node `node_sUUfZO0yUQ45tsBnKkxdZ` under the same authorized actor returned no private finalizations and replay-complete outcomeIndex0 at that same public6/hash. The actual production JSON codec decoded every received frame, including its Date transformations. Both sockets closed normally with1000 and joined. Evidence: `/tmp/zerospin-goal-headless-socket-private-baseline.log`.

No domain command was sent. Complete native-owner source/results/output/resources/checkpoint/history row sets remained exact through the final public inspection and read-only physical SQLite inspection after the owned backend exited0. All five retained TicTacToe owners and the unchanged Shopping13/13/12 baseline matched their earlier complete domain row sets. The CLI released its sole generated configuration; all17 prior TicTacToe configurations and56 protected original files remained exact. Evidence: `/tmp/zerospin-goal-headless-final-native-owner-preservation.log`, `/tmp/zerospin-goal-headless-final-stopped-provider-journals.log`, `/tmp/zerospin-goal-headless-tictactoe-cleanup.log`. An initial type-only decoding assertion incorrectly rejected transformed wire Dates; it was replaced with the actual production JSON codec before the terminal replay assertions and is not product evidence.

This proves the aggregate branch's bounded private recovery below a captured public baseline and redaction for another existing Node. It does not prove the service protocol, other-session identity, sustained-publication fairness, send-failure repair, hibernated locks, lost acknowledgement or claim release during interruption/defect.

### Authorized actual service socket matrix — 2026-10-11

The human authorized disposable verification under `/tmp`. The root's independent Workerd on port62495 uses current production factory-authored service declarations, Gateway/session APIs, the actual ServiceChain/ServiceVersionRepo/selected service owner, and wholly separate retained storage. Temporary bundle controls hold or fault the real transport procedures without fabricating admission receipts or authoritative output. The installed Node `ws` client decodes every actual frame with the production JSON union.

`/tmp/zerospin-framework-goal-service-120/socket-matrix-final.log` passes ten cases and joins exit0. Two genuine actor originals finalize at public1/2. Exact retry returns the original admission index with every selected-history row unchanged. Reconnecting from the public2 snapshot with private0 recovers precisely both own finalizations with empty resource deltas and completes at private2/public2. The same claims and Node under another genuinely authorized session receive private0 and redacted finals.

A real admission reply is withheld after canonical retention; closing its actual socket loses that reply. Reconnect and exact retry recover source index3, retaining only one original/result. Closing another actual socket while admission waits before its RPC allows accepted work to finish while preventing an obsolete reply. A controlled native defect and interruption of the actual managed admission Fiber each release the real pending claim. The interruption preserves its complete terminal Cause; the next valid command occupies the unused producer position.

Seventy-five genuine durable occurrences establish a multi-page replay. Holding its first bounded page while five more commands commit yields exactly ordered positions1–80 in pages64/11/5 and a successful synchronous live join, without a race disconnect. A postcommit send failure closes only the affected socket with1011. The other connection receives the committed public81 occurrence; reconnect repairs that suffix without any journal changes. Removing only the affected connection's retained SQL lock forces its compact attachment to close with4003 on the next public82 publication, while the other connection continues. An unsafe resume cursor is rejected by the actual strict server union with state-required/4003. Terminal public82/private5 and the unchanged five exact originals are recorded in `terminal.json`.

`hibernation.log` separately passes and joins exit0. Fourteen seconds of idle time causes actual Workerd owner reactivation2→3 while the same open WebSocket ID, compact attachment, retained SQL lock and complete history remain exact. Bootstrap remains once. The next genuine public83 publication reaches that same socket, proving attachment/lock rehydration and validation across actual idle hibernation. Normal close then removes precisely its connection lock.

All matrix sockets, Node client runtimes and readers close/join. The isolated provider remains separately owned for subsequent goal verification and will be joined at cleanup. The final affected source graph and actual core typecheck pass. An independent criterion audit confirms every protocol/replay/admission/hibernation requirement is covered; no additional browser UI gate is implied.

## Remaining work

None.
