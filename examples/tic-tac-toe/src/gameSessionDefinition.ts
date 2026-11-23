import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';

import { createGame } from './contracts/createGameV1';
import { playX } from './contracts/playXV1';
import { savePositionV2 } from './contracts/savePositionV2';
import { claimsSchema, game } from './gameV1';
import { savedPositionV2 } from './savedPositionV2';

/** Both hosts and the application worker import this one checked session definition. */
export const gameSessionDefinition = makeAggregateSessionDefinition({
  systemName: 'tic-tac-toe',
  sessionName: 'gameSession',
  aggregateName: 'game',
  aggregateVersion: 3,
  actorName: 'human',
  actorVersion: 3,
  models: { game, savedPosition: savedPositionV2 },
  contracts: { createGame, playX, savePosition: savePositionV2 },
  claimsSchema,
});
