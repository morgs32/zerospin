# @zerospin/machine

Effect-native scoped state machines. Define schema-bearing States with
`makeState`, bind their routes with `makeMachine`, and create an Actor with
`makeActor`. The application supplies the Actor's `ManagedRuntime` and owns
its start Fiber and runtime disposal.

State routes declare `actions` with a payload schema and program. Invoke an
action through the current Handle, such as `pending.actions.finish()`. The
Actor serializes action execution, validates the returned State, and commits
it before returning its new Handle. `onActivation` remains the automatic
program run when a State becomes active.

An admitted action runs in an Actor-owned Fiber. The caller owns waiting for
that invocation and canceling it; cancellation joins its cooperative finalizers
before releasing the transition permit. Actor shutdown marks Closing and cancels
that Fiber before waiting for the permit, so a suspended cooperative program
cannot prevent closure. Queued calls then refuse through the closed-owner boundary.
The transition stays outside the program Fiber and enters an uninterruptible
close/save/publish region. Shutdown waits for a transition already committing;
previous Handles remain visible until publication. Authored programs/finalizers
that never leave an uninterruptible region can still prevent shutdown. Action
failures retain their complete local Cause and the existing terminal policy for
activation/save/install/cleanup failures remains unchanged.

## Installation

Start Zerospin's persistent Verdaccio registry from the workspace root:

```sh
pnpm nx run zerospin:local-registry
```

Install the package in a consumer:

```sh
pnpm add @zerospin/machine@6.0.1 effect@4.0.2 --registry http://127.0.0.1:4873/
```

```ts
import { makeActor } from '@zerospin/machine/makeActor';
import { makeMachine } from '@zerospin/machine/makeMachine';
import { makeState } from '@zerospin/machine/makeState';
import type { IInferStateValue } from '@zerospin/machine/types';
```

`RouteContractViolation` and `StateInactive` are exported through matching
subpaths. This ESM package ships compiled JavaScript and declarations in `dist`;
Effect is a peer dependency (`^4.0.2`).

## Checks and local publication

From the Zerospin workspace root:

```sh
pnpm nx run-many -t lib ts lint -p @zerospin/machine
```

`lib` builds production files; `ts` checks the source without emitting output.

Use the ignored `tmp/local-registry/publish.npmrc` described in the root README:

```sh
NPM_CONFIG_USERCONFIG="$PWD/tmp/local-registry/publish.npmrc" node scripts/publish-machine.mjs --dry-run
NPM_CONFIG_USERCONFIG="$PWD/tmp/local-registry/publish.npmrc" node scripts/publish-machine.mjs
```

Nx rejects single-package CLI filters within a fixed release group. The script
uses Nx Release with a publication-only allowlist; it does not generate versions
or changelogs. The publish lifecycle rebuilds the package. Future versions follow Zerospin's
fixed release group; changed artifacts require a new version. Registry storage
must remain intact for consumers of already published versions.
