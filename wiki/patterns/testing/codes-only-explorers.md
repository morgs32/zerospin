# Method profiles

Use a sibling `*.profiles.ts` file with exactly one representative success profile
and one representative rejection profile when those outcomes exist. Choose cases
that demonstrate meaningful behavior; do not catalogue every error code or input
permutation.

The pilot is
`admitAggregateCommands.profiles.ts` (`packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommands.profiles.ts`, removed 2026-10-17):
mixed retry/new admission succeeds, and a late invalid payload rejects with
`aggregate-chain-command-invalid`.

Keep canonical declarations, seed rows, and lazy setup in that file. Each setup
Effect returns the production invocation Effect instead of executing it.
Use `makeProfileDb({ dbConfig, seed })` (`packages/system-worker/src/profileUtils.ts`, removed 2026-10-17)
for fresh scoped SQLite with production schemas and codecs. Seed table names and
decoded row types come from the supplied config; omitted tables stay empty.
The helper encodes seeds before inserting them in one synchronous transaction,
with foreign keys enforced at commit.

Export exactly one lazy `success` and one lazy `rejection` setup Effect when those
outcomes exist. Importing the file must not arrange storage or invoke the method.
`profileUtils.capture(setup)` owns the scope: run setup, capture its returned
invocation with the logger's `captureTelemetry`, then close storage. Provide
method dependencies on the returned invocation or around the complete capture.

Put outcome/span-tree inline snapshots in the sibling `*.profiles.spec.ts`:

```ts
const profile = await Effect.runPromise(profileUtils.capture(success));
expect(profileUtils.snapshot(profile)).toMatchInlineSnapshot();
```

The raw profile retains the native Exit and complete captured telemetry. Use
`makeFn` for named method helpers and `makeTx` for synchronous transactions.
Effect owns their spans and failure stacks; native locations may identify an SDK
adapter rather than the authored method. Do not require custom definition or
invocation source fields on successful spans.

Run diagnostic tests with `--mode profile` to record bounded, redacted function
arguments, results, and exits. Ordinary tests use the production annotator and
do not record these snapshots. Snapshot the outcome and ordered span hierarchy;
omit IDs, timestamps, and stacks. Setup spans stay outside capture.
Keep database-state and rollback assertions in behavioral specs rather than
profile cases.

Run an existing diagnostic spec through the current test task:

```sh
pnpm nx run zerospin:test -- --mode profile \
  packages/system-worker/tests/native-system-api/native-system-api.workerd.spec.ts
```
