/**
 * Export one complete checked session definition per named file. Import canonical model and
 * contract versions directly and list them explicitly, preserving limited projections. Keep the application layer
 * in its own module. A definition owns configuration, never a store or resource lifetime.
 * The tab and application worker import the same pure checked session definition
 * directly from its defining module. Do not derive it from server actor or aggregate
 * releases, which can import authorization and other server-only implementation.
 * Concrete constructors take the pure definition, tab layer, credentials and worker factory separately.
 * The worker registers that session definition with its independent projection layer.
 *
 * Construct independent instances with the concrete browser constructor outside React. Bind
 * credentials and resource selection at construction; initialize() starts that
 * same identity and dispose() revokes readiness synchronously before teardown.
 *
 * In React, call a concrete managed hook with (definition, optionsOrResolver),
 * then publish its handle with SessionProvider. Gate only readers and commands
 * with SessionReady definition={definition}; useSession(definition) reads that
 * ready session and useSessionState(definition) observes availability elsewhere.
 * Mock hooks use the same declaration and consumers with local seeded state.
 * Internal identity replacement must preserve the public provider subtree.
 *
 * Use standalone stage/validate/model-ID functions; they own session execution.
 * General Effects use runSync/runPromise and resolve the current private lifetime.
 *
 * @bad Export a module-level live session shared by independent React owners.
 * @bad Build a sessions.ts factory that declares multiple definitions together.
 * @bad Export *SessionDefinitionProps and spread them into a constructor elsewhere.
 * @bad Export a plain satisfies-only object instead of calling the checked constructor.
 * @bad Put a definition behind a one-entry session registry.
 * @bad Spread an existing definition into a different connected or story declaration.
 * @bad Attach systemName after makeServiceSessionDefinition returns.
 * @bad Hide individual declarations in shared models/contracts spreads.
 * @bad Re-export definitions through a barrel instead of importing their owner.
 * @bad Derive a browser declaration by importing server actors or aggregate releases.
 * @bad Expose a ManagedRuntime or initialize a session during render.
 * @bad Use Suspense as the session-readiness gate.
 * @bad Key the public app subtree merely to change the session identity.
 * @bad Dispose a React-owned session from a module HMR callback.
 * @bad Add a UI declaration module between readers and their pure session definition.
 */
// gameSessionDefinition.ts
import { makeAggregateSessionDefinition } from '@zerospin/browser';

import { createGameV1 } from './contracts/createGameV1';
import { playXV1 } from './contracts/playXV1';
import { claimsSchema, gameV1 } from './gameV1';

export const gameSessionDefinition = makeAggregateSessionDefinition({
  systemName: 'tic-tac-toe',
  sessionName: 'gameSession',
  aggregateName: 'game',
  aggregateVersion: 1,
  actorName: 'human',
  actorVersion: 1,
  models: { game: gameV1 },
  contracts: { createGame: createGameV1, playX: playXV1 },
  claimsSchema,
});

// An owning async scope constructs, initializes and releases one concrete session.
import { makeConnectedAggregateSession } from '@zerospin/browser/makeConnectedAggregateSession';

import { applicationLayer } from './applicationLayer';
import { credentialsSchema } from './credentials';
import workerUrl from './game.node.worker?sharedworker&url';

async function runGame(aggregateId: string) {
  // 1. Domain declaration and host dependencies remain distinct inputs.
  const session = makeConnectedAggregateSession({
    definition: gameSessionDefinition,
    credentialsSchema,
    layer: applicationLayer,
    sharedWorkerUrl: workerUrl,
    aggregateId,
    getCredentials,
  });
  try {
    // 2. The owner starts the cold facade before domain work.
    await session.initialize();
  } finally {
    // 3. Disposal releases this facade's work and application runtime.
    await session.dispose();
  }
}

// catalogSessionDefinition.ts: service identity is captured by the same checked call.
import { makeServiceSessionDefinition } from '@zerospin/browser';

import { productV1 } from './services/marketplace/models/product/ProductV1';

export const catalogSessionDefinition = makeServiceSessionDefinition({
  systemName: 'tic-tac-toe',
  serviceName: 'marketplace',
  serviceVersion: 1,
  actorName: 'catalog',
  actorVersion: 1,
  sessionName: 'catalogSession',
  claimsSchema,
  models: { product: productV1 },
  contracts: {},
});
