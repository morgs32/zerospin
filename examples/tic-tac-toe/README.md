# Tic-Tac-Toe

Tic-Tac-Toe serves at <https://tic-tac-toe.zerospin.localhost/>.

## Browser peer spike

The experimental [peer spike](https://tic-tac-toe.zerospin.localhost/peer-spike)
uses two separate browsers or profiles on this computer. Start the normal dev
service, unlock the host with its passkey, and open its introduction
link in the guest browser. The guest creates its identity and sends an
introduction; the host copies the encrypted invitation into an email that the
user sends manually. Paste that invitation into the original guest tab and
approve the passkey challenge to exchange messages.

The host remembers admitted guests in local browser storage. Both parties need
the same passkey to recreate their identities after reopening the page; losing
access to it prevents restoring that identity. Identities created with the
earlier phrase-based derivation cannot be unlocked with this version; their
saved metadata is preserved. The local development
relay must remain running while the host tab restarts. This is an unreviewed
security experiment: use test data rather than real secrets. The
relay routes encrypted connections but may observe connection metadata.

The Game stores its board and an optional `computerMoveFailure` message. Move
guards and both application hosts derive the result and next turn from the
board. A handled computer-request Failure preserves the board and displays its
message; it schedules no retry. New game starts a separate Game identity.

The browser replaces its stored identity and reloads. The Native application
retains prior Game identities and reopens their sessions on relaunch, selecting
the newest Game for display.

## Saved positions and snapshot evolution

The browser's **Save position** captures the current Game board in an immutable
saved position. Saved boards appear newest first and survive reloads. Their next-turn label reads
the saved JSON; `null` means the position is finished. Later moves do not change
earlier saved boards. New game opens another Game and leaves earlier positions
stored with their original Game.

Game release 1 remains unchanged. Release/Actor 2 introduce saved-position model
and save-contract version 1; release/Actor 3 use their version 2 counterparts.
The current session selects release/Actor 3. The Game model and move/opponent
contracts retain their original versions.

```ts
// Both savePosition contract versions accept the same payload.
const payload = { gameId: 'gam_one', positionId: 'pos_one' };
// Version 1 records the board at this point in command history.
const savedV1 = { board: 'X........' };
// The newer writer reconstructs that position and adds its derived turn.
const savedV2 = { board: 'X........', turn: 'O' };
```

The V2 contract inherits the default identity `up` and supplies an explicit
identity `down`, because the payload did not change. Those adapters transform
command inputs, not saved JSON. The V2 program selects the V2 create operation
and writes the expanded content using `turn(board)`. Changing the model's JSON
schema alone would not transform an existing saved position.

First materialization in a newer release reevaluates retained commands through
that release's writer. Restoring an evaluation already retained by that same
release instead applies its frozen operations. Neither path rewrites the older
release's saved-position rows or requires a storage reset.

The [canonical Game replay test](../../packages/system-worker/tests/aggregate-adapter-failures/aggregate-adapter-failures.workerd.spec.ts)
uses these real releases: it saves after X, advances the Game, then replays into
release 3 and checks the earlier board plus persisted turn O, unchanged V1 JSON,
idempotence, and no additional external work. It also checks reverse replay,
finished positions, and unavailable Games.

| Area | Worker                    | Pure manifest           |
| ---- | ------------------------- | ----------------------- |
| Game | `src/game.node.worker.ts` | `gameSessionDefinition` |

## Development

```sh
pnpm --filter tic-tac-toe dev
```

## Portless

```sh
portless get tic-tac-toe.zerospin
```

## Zerospin backend

```sh
pnpm --filter tic-tac-toe zerospin:dev
```

Serves the backend on `ZEROSPIN_PORT` or `12003`.

## Local telemetry

The computer chooser logs its selected move index; playing X produces a real
trace and correlated application log for inspection.

Start [local Grafana](../../README.md#local-telemetry), then add
`ZEROSPIN_TELEMETRY=1` to this example's `.env.local` and restart its Zerospin
backend. A shell-only flag does not reach the Worker. If `.dev.vars` exists,
include the flag there too because Wrangler uses it instead of `.env` files.

Open <http://127.0.0.1:12300> to find traces and logs for `tic-tac-toe`. Local
telemetry is disabled when the flag is absent.

## iOS UI tests

`TicTacToeUITests` uses the real application and Session. Its two workflows
cover play/New game/selected-Game restoration and retained chooser Failure.
Use a dedicated simulator and keep its app and backend storage across the
intentional relaunches. The tests create new Games through the UI.

From the repository root, build the Native bundle and CLI:

```sh
pnpm nx run @zerospin/native:build
pnpm nx run @zerospin/cli:lib
```

Prepare a local backend configuration in a fresh directory. Its chooser stalls
only for the center-first board, exercising the real request timeout; other
boards use the normal first-empty-square choice. The System and released
contracts remain the application's declarations.

```sh
ios_verification_repo="$PWD"
ios_verification_dir="$(mktemp -d)"
cp examples/tic-tac-toe/package.json "$ios_verification_dir/package.json"
ln -s "$ios_verification_repo/examples/tic-tac-toe/node_modules" "$ios_verification_dir/node_modules"
cat > "$ios_verification_dir/zerospin.config.ts" <<EOF
import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { Effect, Layer } from 'effect';
import { ChooseComputerMove } from '$ios_verification_repo/examples/tic-tac-toe/src/chooseComputerMove.ts';
import { system } from '$ios_verification_repo/examples/tic-tac-toe/src/system.ts';
export default makeConfig({
  system,
  systemId: 'sys_tictactoe',
  layer: Layer.succeed(ChooseComputerMove, board =>
    board === '....X....' ? Effect.never : Effect.succeed(board.indexOf('.'))),
});
EOF
cd "$ios_verification_dir"
node "$ios_verification_repo/packages/cli/dist/cli.js" dev --port 14613
```

Wait for whole-SystemSpec acceptance, then run the standard test action from
the repository root in another terminal. Set `IOS_VERIFICATION_SIMULATOR_ID`
to the dedicated simulator's UDID. Retain the same backend directory for reruns.

```sh
xcodebuild test \
  -project examples/tic-tac-toe/ios/TicTacToe.xcodeproj \
  -scheme TicTacToe \
  -destination "platform=iOS Simulator,id=$IOS_VERIFICATION_SIMULATOR_ID" \
  -parallel-testing-enabled NO \
  -resultBundlePath "$(mktemp -d)/TicTacToe.xcresult" \
  CODE_SIGNING_ALLOWED=NO ZEROSPIN_API_URL=http://127.0.0.1:14613
```

The `ZEROSPIN_API_URL` build setting configures the existing Bundle API URL;
ordinary app builds retain `http://localhost:12003`.

## Declaration Board

From this example directory, run `pnpm studio` to open
`https://studio.tic-tac-toe.localhost` through the existing HTTPS Portless proxy.
Studio listens internally on `127.0.0.1:12031` and reads this example's
`zerospin.config.ts`. This command is separate from `dev:app`; it requires no
backend process or Zerospin secret.

For a direct local listener, use `pnpm exec zerospin studio --port 12031`.
