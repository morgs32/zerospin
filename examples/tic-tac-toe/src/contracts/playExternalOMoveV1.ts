/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeAggregateExternalContractRelease } from '@zerospin/core/contracts/make/makeAggregateExternalContractRelease';
import { findFirst } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { ChooseComputerMove } from '../chooseComputerMove';
import { game, turn } from '../gameV1';
import { isValidMove } from '../isValidMove';

import { playExternalOMoveDefinitionV1 } from './playExternalOMoveDefinitionV1';

export const applyComputerMove = makeAggregateContractRelease(
  defineAggregateContract('applyComputerMove'),
  {
    version: 1,
    payload: {
      ...playExternalOMoveDefinitionV1.payload,
      square: sdk.primitives.integer({ nullable: true }),
      requestFailure: sdk.primitives.text({ nullable: true }),
    },
    models: {
      game: {
        model: game,
        fields: ['createdAt', 'updatedAt', 'board', 'computerMoveFailure'],
      },
    },
    failures: {
      invalidMove: sdk.ContractError.schema({ code: 'invalid-move' }),
    },
    guard: Effect.fn('applyComputerMove.guard')(function* ({
      payload,
      db,
      failures,
    }) {
      const current = yield* findFirst({
        db,
        model: db.models.game,
        where: { id: { eq: payload.id } },
      });
      if (
        current === undefined ||
        current.board !== payload.board ||
        turn(current.board) !== 'O' ||
        (payload.square !== null &&
          !isValidMove(
            current.board,
            { board: payload.board, square: payload.square },
            'O',
          ))
      ) {
        return yield* failures.invalidMove.make({ extra: null });
      }
    }),
    operations: { updateGame: game.operations.update },
    program: ({ payload, operations }) => {
      if (payload.square === null) {
        return operations.updateGame({
          resourceId: payload.id,
          attributes: {
            computerMoveFailure: payload.requestFailure,
          },
        });
      }
      const { square } = payload;
      const board =
        payload.board.slice(0, square) + 'O' + payload.board.slice(square + 1);
      return operations.updateGame({
        resourceId: payload.id,
        attributes: {
          board,
          computerMoveFailure: null,
        },
      });
    },
  },
);

export const playExternalOMove = makeAggregateExternalContractRelease(
  playExternalOMoveDefinitionV1,
  {
    request: ({ payload }) =>
      ChooseComputerMove.use(choose => choose(payload.board)),
    onSuccess: {
      contract: applyComputerMove,
      payload: Effect.fn(function* ({ payload, response }) {
        return { ...payload, square: response, requestFailure: null };
      }),
    },
    onFailure: {
      contract: applyComputerMove,
      payload: Effect.fn(function* ({ payload, failure }) {
        return { ...payload, square: null, requestFailure: failure.message };
      }),
    },
  },
);
