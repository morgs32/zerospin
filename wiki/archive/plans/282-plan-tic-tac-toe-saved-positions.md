# Tic-Tac-Toe saved positions and snapshot evolution

**Status:** Complete. **Approved:** 2026-10-29. **Verified:** 2026-10-29.

Delivered in [PR 108](https://github.com/morgs32/zerospin/pull/108), based on
current main with the merged framework fix from PR 107.

## Summary

Add a visible **Save position** action and read-only saved boards. Use two snapshot
versions to demonstrate historical commands replaying through a newer writer while
preserving the older release's data.

```ts
// V1 captures the position when the save command executes.
const savedV1 = { board: 'X........' };
// V2 replays that same command using its newer writer.
const savedV2 = { board: 'X........', turn: 'O' };
```

## Implementation

1. Add an immutable `savedPosition` model, ID prefix `pos`, containing `gameId`
   and JSON `content`. V1 content requires `board`; V2 additionally requires
   `turn: 'X' | 'O' | null`, computed with existing `turn(board)` logic.
2. Add `savePosition` contract versions 1 and 2 with the same payload
   `{ gameId, positionId }`. Each checks the claimed Game and reads its current
   board before recording creation. V2 explicitly binds the V2 model/create
   operation and writes expanded JSON. Keep implicit identity `up`; provide
   explicit identity `down` for reverse replay.
3. Preserve Game release 1 and Human Actor 1 unchanged. Release/Actor 2 introduce
   snapshot model/contract V1; release/Actor 3 select V2. Register all releases,
   make release 3 canonical, and bind the shared session definition to
   release/Actor 3. Existing Game models, moves and opponent retain their versions.
4. Add the browser Save position button whenever a Game exists, including
   finished games. Generate a fresh position ID per save. List that Game's saved
   boards newest first, with deterministic ID ordering for timestamp ties.
   Display the persisted turn; null means finished. Reuse existing errors and
   board styles. New game continues creating a separate Game identity.

## Planned files

`+` creates files; `~` modifies files. Brace groups are separate concrete files.

```text
zerospin/
  examples/tic-tac-toe/
    + src/savedPosition{Model,V1,V2}.ts
    + src/contracts/savePositionV{1,2}.ts
    + src/humanActorV{2,3}.ts
    + src/gameAggregateReleaseV{2,3}.ts
    ~ src/{app.tsx,style.css,gameSessionDefinition.ts,system.ts}
    ~ README.md
  packages/system-worker/tests/aggregate-adapter-failures/
    ~ system.ts
    ~ aggregate-adapter-failures.workerd.spec.ts
  wiki/
    + plans/282-plan-tic-tac-toe-saved-positions.md
    ~ glossary.md
```

## Verification and delivery

1. Replace the Workerd fixture's synthetic Game V2 with real example releases.
   Extend canonical replay using source release 2 and fresh destination release 3.
   Save after X's first move, then advance the live board. Replay retained history;
   assert the same saved ID retains its earlier board, gains turn O and decodes
   through V2. V1 JSON stays unchanged, repeated replay is idempotent and replay
   produces no additional external work. Compare each release's snapshot
   operations separately: model versions and content intentionally differ.
2. Verify a new V2 save replays into release 2 through down, producing board-only
   JSON. Cover finished-game turn null and refused unavailable Game.
3. Run Tic-Tac-Toe type/lint checks, existing example tests and the affected
   Workerd suite. Browser-check save, subsequent moves, reload persistence and
   New game using isolated development data.
4. Update the example README and existing glossary after implementation. No ADR
   is expected. Deliver a separate example-focused PR based on the tested
   framework fix. Browser controls are in scope; Native bindings remain
   compatible through the shared definition. Framework API changes, package
   publication, QRK storage migration and storage resets are excluded.

## Implementation and verification

1. Added the two saved-position schemas and save-contract versions, explicit
   release/Actor 2 and 3 bindings, shared session version 3, and browser controls.
   Original Game release 1, Human Actor 1, Game model and move declarations are
   unchanged. Updated the example README and existing glossary.
2. `pnpm nx run-many -t ts lint -p tic-tac-toe` passed, including the shared
   Native session binding. Rechecked after rebasing onto current main, which
   includes the merged framework fix from PR 107.
3. The focused example and Workerd suites passed: 33 tests across 2 files.
   They prove forward/reverse replay, frozen output, preserved V1 content,
   idempotence, no extra external work, finished positions and Game refusals.
   The final-main rerun reused matching Nx test outputs. Nx Cloud artifact
   upload reports an unrelated workspace-access 401; local checks succeeded.
4. Started the real backend in a fresh temporary directory with a deterministic
   chooser and received whole-SystemSpec acceptance. Existing development
   storage has not been reset or modified by this isolated runtime.
5. Browser verification passed at `http://127.0.0.1:12101`: saved the empty
   board, played X and received O, saved again, and reloaded. Both saved boards
   remained in newest-first order with their persisted turn labels. Finished
   the Game, saved its winning board, and reloaded again: the three saved boards
   remained unchanged and the latest label read Finished. New game returned to
   Start game; starting it produced an empty board with no positions belonging
   to the prior Game. Captured screenshot evidence locally. Restarting the
   isolated frontend after dependency builds cleared Vite's initial negative
   resolution cache without source or configuration changes.

## Remaining work

None.
