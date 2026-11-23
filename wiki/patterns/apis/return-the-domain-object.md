# Return the domain object

Return the domain object appropriate to the operation so its real fields are the
result. Admission returns the retained command and its admission coordinates.
Execution returns its retained `ICommandOutcome` directly:
`{ result: Success | Failure, finalizedAt }`. Do not echo the command or wrap its
outcome in an execution receipt.

```ts
interface IRetainedCommand {
  id: string;
  payload: string;
  aggregateIndex: number;
}

export const admit = (retained: IRetainedCommand): IRetainedCommand => retained;
```

Rejected shapes:

- Return `{ commandId, position, command }` and rename `aggregateIndex` or `serviceIndex` to "position".
- Add `command` beside a receipt that already repeats `command.id` as `commandId`.

A repeated command ID is a retry. Admission recovers the retained original only
after its immutable input and provenance match. Reusing an ID for different
input is an identity conflict; it must not expose another Actor's outcome.

An execution retry returns the first retained outcome and `finalizedAt`. A
finalized business rejection remains in `outcome.result`; API/framework failures
use the Effect/RPC failure channel. Success remains JSON; callers use the authored
contract codec when they need a typed business result. Execution does not wait for
later external work.
