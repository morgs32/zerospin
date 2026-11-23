# Tic-tac-toe game AggregateVersionRepo.game

**Reviewed:** 2026-10-17 against the source at review time, with independent column-design and lifecycle reviewers. Exactly the source AggregateVersionRepo.game context is reviewed. Actor projections, Nodes and browser/Native replicas remain separate owner/table reviews. Verification was deferred during that review; dated follow-ups below record later evidence.

**Original review verdict: retain the resource table; simplify seven SQL columns to five by removing stored `turn` and game `outcome`.** Both are deterministic board derivatives. Retain `id`, `createdAt`, `updatedAt`, `board` and nullable `computerMoveFailure`. Update the existing rule checks, computer scheduling and browser/Swift consumers to derive rule state from board. The native consumer also needs to display the existing computer-request failure instead of indefinitely reporting that O is thinking. This verdict was a recommendation at review time; its approved implementation is recorded separately below.

## Approved implementation follow-up — 2026-10-17

The maintainer approved the five-column model and Native failure-display repair
under [Plan 241](../../archive/plans/241-plan-tic-tac-toe-board-derived-state.md).
Implementation was written, with all verification deferred at that time:

1. Game SQL retains exactly `id`, `createdAt`, `updatedAt`, `board` and nullable
   `computerMoveFailure`. Existing Model/table codecs retain complete resource
   envelopes, including bound modelName/version, without custom adapters or
   compatibility readers.
2. Supported creation and moves no longer write `turn` or game `outcome`.
   Guards, computer scheduling, browser display and Native display derive both
   from board. Equal X/O counts mean X moves next on a playing board; one extra
   X means O. Winning/drawn boards have no next turn. Exact instance identity,
   stale-board equality and legal-empty-square checks retain their roles.
3. Native decodes nullable `computerMoveFailure` and displays a retained request
   failure with the existing New game action. The failed request leaves board
   unchanged and does not become a terminal session error. Successful computer
   moves still clear the failure observation.
4. AggregateVersionRepo still commits resource changes, materialization progress
   and complete pending publication synchronously. AggregateChain retains pending
   external requests and admits their observations; AggregateVersionChain retains
   evaluated commands. No resource transaction spans the remote computer request.
   No owner-wide singleton constraint, additional history, retry coordinator or
   storage abstraction is introduced.
5. Changed fixed schemas require empty affected storage under the pre-release
   policy. No reset, migration or deployment was authorized or performed. At that
   time Plan 241 remained active/unverified; its completion is recorded below.

## Verification follow-up — 2026-10-27

The approved five-field Game is now covered by seven stories in the existing
[computer-move.spec.ts](../../../examples/tic-tac-toe/tests/computer-move.spec.ts).
They establish board-derived rules, local/public and canonical owner guards,
exact X operation descriptions, applied O Success and handled request Failure,
stale continuation refusal, failure clearing and production optimistic replay
without another chooser call or command-ID allocation. The applied row has five
fields and the complete resource has seven; SQLite PRAGMA confirms the physical
columns are exactly `id`, `createdAt`, `updatedAt`, `board` and
`computerMoveFailure`. The scoped Nx test lane passed compilation and 13 runtime
cases across the Game spec and six existing shared replay stories.

The actual Browser application and SharedWorker also reached X win, O win and
draw, disabled every terminal move and retained unchanged `{ id, board, square }`
command payloads. New game created a separate empty Game; read-only
AggregateVersionRepo SQLite inspection confirmed that the prior completed Game
remained at its checkpoint with those same five columns. No model rows were
changed directly.

The existing Aggregate adapter fixture now also proves canonical retained Game
output restoration, original external preparation and replay into a parallel
release without new requests or command-ID allocation. All twenty-one Workerd
scenarios and the full test-program compiler pass, including existing Chain
tests that own immutable request identity and observation admission. The Browser
shows the real chooser timeout message on an unchanged board and retains it
through reload. Two standard XCTest UI workflows pass on the authorized unused
iPhone simulator for play/New game/selected-Game restoration and retained
Failure/restoration. Read-only Native SQLite records confirm three separate
owners and exact move payloads; UI presentation alone is not presented as
canonical admission or identity proof.

[Plan 241's final verification record](../../archive/plans/241-plan-tic-tac-toe-board-derived-state.md#verified-completion--2026-10-27)
owns the detailed commands, source-call-path reuse and runtime evidence. The
plan is complete and archived. Game logic and schemas are unchanged during this
verification pass; the iOS API URL uses a normal build setting with its original
default. No existing store is reset or deployed. These checks do not complete
Plan 151's other physical storage-context reviews or provider proof.

The remaining sections preserve the original seven-column source-review evidence
and then-current consumers. Historical source links are pinned to
`1dce8c79d8e7d0cc548d27506c933346b66dc69b`, the committed parent before the
five-field Game change. That snapshot retains the seven fields, the separate
`playXServerV1` program and the old Swift decoder; its browser entry is
`src/main.tsx`. It is not an exact snapshot of the reviewed working tree: the
review also saw uncommitted integer-version changes, while the pinned source
still declares version `'1.0.0'`. Numeric version facts below describe that
review-time WIP, not the pinned snapshot. These are historical findings, not a
current-source audit or evidence that every acceptance check passes.

## Ownership and representation

The [System](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/system.ts#L5-L8) binds Aggregate game@1.0.0, and its [release](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/gameAggregateReleaseV1.ts#L14-L20) owns Model game@1.0.0, declared with abbreviation gam in [gameV1](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/gameV1.ts#L6-L18). The reviewed integer-version WIP's physical AggregateVersionRepo key is `(systemId, aggregateId, aggregateName='game', aggregateVersion=1)`. [Release resolution and database composition](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L60-L85) select that exact release's models beside materializationHead and complete pending aggregateVersionChainOutbox publication.

[Model construction](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/core/src/models/make/makeModelVersion.ts#L332-L400) gives this table **seven SQL fields** and the complete resource **nine fields**. Bound modelName='game' and the declaration version (integer `1` in the reviewed WIP; `'1.0.0'` in the pinned snapshot) are resource-envelope identity, omitted from SQL. [encodeResource](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/core/src/models/encodeResource.ts#L9-L37) restores and validates that identity through the existing codec. At review time this read the then-current Plan 236 WIP; it did not verify it or propose another storage adapter.

One row represents one game's current board and its current computer-request failure observation. Completed games remain business resources. This is not a move log, command history, checkpoint or delivery queue. Removing the table would relocate the board and current failure responsibility rather than eliminate it.

## Every column and constraint

| Column                | Meaning, nullability and writers/readers                                                                                                                                                                                        | Finding and removal consequence                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | Required gam-prefixed text primary key. createGame supplies it; move payloads, continuations and the human Actor selection identify this exact resource. Stable throughout its lifetime.                                        | Retain. The admitted instanceId is independent of bound aggregateId; multiple instances can exist under one Aggregate. The clients' prefixed-token convention is not an enforced identity equation. Removing id would change public resource identity and selection, not remove redundant owner metadata.                                                                              |
| `createdAt`           | Required Date stored as integer milliseconds. Generic create application uses the materializing command's finalizedAt. No later writer replaces it.                                                                             | Retain the common resource creation time. Neither the board nor bound owner/release identifies when this resource was created. Do not replace a direct resource fact with Chain-history lookup or a Game-specific envelope exception.                                                                                                                                                  |
| `updatedAt`           | Required Date stored as integer milliseconds. Initialized at creation and advanced by board or computerMoveFailure updates.                                                                                                     | Retain the common resource mutation time. A computer-request failure changes the resource without changing board, so a board-derived time is insufficient. It is not a move count or proof of pending work.                                                                                                                                                                            |
| `board`               | Required text. Creation writes nine empty positions; legal X/O updates replace exactly one empty position. Exact retained-board equality rejects stale moves and computer observations. Browser and Native display its squares. | Retain the authoritative current game state. No owner identity, external request row or derived result reconstructs the nine positions. Keep the compact string representation; no cell table, nine-column expansion or move-history dependency is needed.                                                                                                                             |
| `turn`                | Required enum text, X or O. Creation writes X; each X move writes O and each O move writes X, even on terminal boards. Guards and UI currently read it alongside game outcome.                                                  | Remove the stored copy. On a reachable playing board, equal X/O counts mean X moves next; one extra X means O. No skip, pass or independent turn assignment exists. Derive next mark only while playing; terminal turns have no independent meaning. Existing readers require the rule, not another durable field.                                                                     |
| `outcome`             | Required enum text, playing/X/O/draw. Creation writes playing; move writers compute it from the resulting board. Guards and UI use it to stop play and announce results.                                                        | Remove the stored game-result copy. The existing outcome(board) evaluates all eight winning lines and full-board draws. There is no resignation, timeout or independent adjudication fact. Derivation preserves behavior while eliminating contradictory board/result combinations. Admitted command outcome remains its separate canonical `{ result, finalizedAt }` value.           |
| `computerMoveFailure` | Nullable text. Creation supplies null. The O continuation records externalOutcome.failure.message without moving, or clears it when O successfully moves. Browser status and alert read it.                                     | Retain the current request observation. The same O-turn board can mean a request has not returned or its request failed. Null means no retained request-failure message, including before any request; it does not prove successful delivery. Removing this field would lose refresh-visible failure status. No error-history table or extra request-state discriminator is justified. |

[gameV1](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/gameV1.ts#L10-L16) declares no defaults, foreign keys, secondary indexes, additional uniqueness, TTL or SQL CHECK constraints. computerMoveFailure is the only nullable field, explicitly initialized null. [Primitive mapping](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/shapes/src/primitiveMaps.ts#L145-L199) stores text/enums as TEXT and dates as millisecond INTEGER. [Descriptor codecs](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/shapes/src/compileDescriptor.ts#L171-L186) check string/Date/enum/ID types; enum literals are not SQLite CHECK constraints. The primary key supports exact resource lookup; existing access establishes no need for another index.

There are no JSON column members. Board's structured content is nine row-major positions: 0/1/2 in the first row, 3/4/5 in the second, 6/7/8 in the third; each is '.', 'X' or 'O'. Its plain text codec does not separately enforce length, alphabet, legal counts or terminal-state consistency. Supported creation and moves establish those invariants: start with '.........', require the exact retained board, then replace one empty square at integer index 0–8. This is not evidence of malformed boards entering through current authored commands. Preserve that closed transition rule when deriving turn/result; add no speculative board-storage framework.

## Identity, lifecycle and retention

1. **The resource ID is not an Aggregate singleton key.** The [browser](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/main.tsx#L12-L16) conventionally prefixes its owner token to produce id. However, [human authentication](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/humanActorV1.ts#L18-L24) accepts supplied instanceId alongside bound aggregateId, and its [selection](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/humanActorV1.ts#L30-L33) filters by that instanceId. The [ordinary-contract evaluator](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts#L41-L62) gives createGame the Actor-scoped database, whose [CTE binds that selection](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/core/src/contracts/make/makeActorContractReadDb.ts#L98-L118). Consequently, [createGame.guard](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/contracts/createGameV1.ts#L23-L28) rejects an existing selected Game, not every Game within the Aggregate. Another instanceId can create another row. The release's canonical [guard map](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/gameAggregateReleaseV1.ts#L21-L40) defines only playX. No owner-wide singleton requirement is documented, so this is a cardinality fact, not a demonstrated defect or reason to add a singleton field.
2. **Creation establishes the initial board.** [createGame](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/contracts/createGameV1.ts#L16-L41) requires payload.id to match claims.instanceId, refuses an existing selected resource, and records the initial board, X turn, playing result and null failure. The source transaction and primary key prevent a duplicate resource ID; another Actor instance remains a separate resource.
3. **X commits its move with the O request description.** [playX](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/contracts/playXV1.ts#L28-L54), the canonical release guard and [isValidMove](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/isValidMove.ts#L12-L20) require exact identity/board, X turn, ongoing play and an empty square. [playXServerV1](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/contracts/playXServerV1.ts#L17-L34) records that mutation and emits computer work only when outcome(newBoard) remains playing. Terminal boards schedule no O request. Removing duplicated columns must preserve these rules and emission timing.
4. **O applies only to the board that requested it.** [playExternalOMove.guard](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts#L35-L54) checks instanceId, existing resource, exact frozen board, O turn and playing state; a successful response must also identify a valid empty square. A stale observation cannot overwrite a newer board. Its [program](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts#L58-L79) either records the request's failure message and returns normally, or applies O and clears the message. Request failure does not invent a move or turn. The browser uses the existing New game action; this review proposes no retry/coordinator machinery.
5. **The row survives completion and New game.** No deleteGame, reset-in-place, expiry or soft-delete path is registered. Browser [New game](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/main.tsx#L108-L115) removes the local owner token and reloads into a fresh identity; it does not delete the old AggregateVersionRepo row. Native [new/restore behavior](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/ios/TicTacToe/TicTacToeApp.swift#L67-L81) retains prior identities so unresolved work can resume. There is no authored row-deletion condition to invent here. Command publication acknowledgement deletes pending messages, not the game or retained Chain history.
6. **Privacy follows the selected instance.** The human Actor exposes only the matching resource; mutation guards check that same instance. The [documented anonymous identity](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/README.md#L18-L18) intentionally grants play to someone who knows it. No extra SQL owner/credential field is needed. Bound aggregateId and admitted Origin retain their existing responsibilities outside this Model row.

## Transaction and recovery boundary

1. [materializeCommandTx](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts#L14-L43) reads ordered admitted input, executes it, constructs IEvaluatedCommand and retains its output in one synchronous transaction. [executeAggregateCommandTx](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts#L38-L66) evaluates guards/program and applies authored operations inside the business savepoint. A refusal does not leave a partial board change or external-operation description.
2. [applyAggregateOperationsTx](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/system-worker/src/AggregateVersionRepo/utils/applyAggregateOperationsTx.ts#L21-L48) applies model members in authored order using the logical finalizedAt. [Resource create/update](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/core/src/contracts/applyOperationTx.ts#L154-L215) sets the common timestamps. [retainEvaluatedCommandTx](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/system-worker/src/AggregateVersionRepo/utils/retainEvaluatedCommandTx.ts#L16-L40) commits materializationHead and the complete pending publication with those resource writes. No Game-specific transaction, checkpoint or history table is required.
3. AggregateChain owns external request dispatch and later observation admission under the settled Aggregate flow. AggregateVersionRepo never holds its resource transaction across ChooseComputerMove. X's board and emitted request description are one local commit; O's later admitted continuation is another. Retaining computerMoveFailure is a business observation of that request, not retained execution history inside the resource owner.
4. [prepareAggregateOutput](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/packages/system-worker/src/AggregateVersionRepo/utils/prepareAggregateOutput.ts#L23-L39) preserves model operation positions and suppresses external re-emission on replay. Current guards/writers maintain board, turn and result together; no reachable writer drift was established. The recommendation eliminates redundant durable state, rather than claiming current gameplay has been observed to corrupt it. Deferred implementation verification remains separate from this architectural finding.

## Bounded cleanup recommendation

1. Remove turn and game outcome from the Model and create/update attributes. Reuse the existing outcome(board) rule and a small next-mark calculation for playing boards across guards, O scheduling and display. Derive from current board, not command history or pending outbox membership. Preserve exact identity/board comparison, completed-game checks, empty-square validation and failure recording.
2. Update browser and Native consumers together. The [Swift Game decoder](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/ios/TicTacToe/TicTacToeApp.swift#L4-L9) currently reads turn/outcome but omits computerMoveFailure. [GameController.status](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/ios/TicTacToe/TicTacToeApp.swift#L46-L53) therefore still returns “O is thinking…” when a request failure has committed with unchanged board/O turn/playing result. The [browser](https://github.com/morgs32/zerospin/blob/1dce8c79d8e7d0cc548d27506c933346b66dc69b/examples/tic-tac-toe/src/main.tsx#L66-L106) already renders that durable failure. Add the nullable message to the native consumer and display it; ordinary external request failure must not be treated as a terminal session failure. This concrete consumer omission is supported by source, with no runtime reproduction claimed.
3. Preserve full resource envelopes using existing Model/table codecs and the current transaction/publication/replay boundaries. Proposed SQL is exactly id/createdAt/updatedAt/board/computerMoveFailure, with bound Model name/version still present in complete resources. No new discriminators, counters, tables, compatibility readers or storage adapters are needed. A later approved schema cutover requires empty affected storage; this review authorizes no reset.

## Reviewer reconciliation and limits

Both reviewers recommend retaining current business state and removing the two deterministic copies. They agree that computerMoveFailure is independent current request-observation state and that no present writer mismatch was demonstrated. The lifecycle review identified the Native failure omission. An initial interpretation of createGame.findFirst as an owner-wide singleton was corrected after tracing the ordinary contract's selected database: the check is instance-local. This strengthens the need for explicit id and does not justify a new singleton policy.

Only this finding and Plan 151 change. No implementation, tests, fixtures, runners, configuration, reset, migration, deployment or deletion is performed. All verification remains deferred, including type/lint/test/build/acceptance, formatting, documentation/link/citation/whitespace checks, source-range/hash refresh and preservation comparisons. Source reading and independent table review support this finding only; they do not verify Plan 236, Plan 239 or any other implementation. Other owner/table findings and inventory totals are not revalidated. Explorer verification is prohibited.

**Queue update (2026-10-17):** The maintainer removed Explorer's authored chat System and its Message model before Message review. Message has no review finding. The seven remaining application models have source-owner findings; select the next distinct physical storage context in [Plan 151](../../plans/151-plan-storage-table-review.md) before continuing. Other ownership contexts and deferred implementation verification retain their separate status.
