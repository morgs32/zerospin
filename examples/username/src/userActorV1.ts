import { makeAggregateActorRelease } from '@zerospin/sdk';

export const userActorV1 = makeAggregateActorRelease(
  { name: 'user' },
  {
    version: 1,
    // TODO Expose updateUsername on the hosted user session.
    // See examples/tic-tac-toe/src/humanActorV1.ts for the actor declaration.
    // TODO authorize: read userId. If missing, call
    // executeCommand({ commandName: 'createUser', contractVersion: 1, payload: { id: userId } }).
    // Grant the session after creation or immediately when the row already exists.
  },
);
