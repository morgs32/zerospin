import * as sdk from '@zerospin/sdk/browser';
import * as Schema from 'effect/Schema';

import { gameModel } from './gameModel';

const GameMarkSchema = Schema.Literals(['X', 'O']);

export const game = sdk.makeModelVersion(gameModel, {
  version: 1,
  attributes: {
    board: sdk.primitives.text(),
    computerMoveFailure: sdk.primitives.text({ nullable: true }),
  },
  indexes: [],
});
export const claimsSchema = Schema.Struct({
  aggregateId: Schema.String,
  instanceId: Schema.String,
});
export const credentialsSchema = Schema.Struct({ instanceId: Schema.String });

export function outcome(board: string): 'playing' | 'X' | 'O' | 'draw' {
  for (const [a, b, c] of [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]) {
    const mark = board[a!];
    if (
      Schema.is(GameMarkSchema)(mark) &&
      mark === board[b!] &&
      mark === board[c!]
    ) {
      return mark;
    }
  }
  return board.includes('.') ? 'playing' : 'draw';
}

export function turn(board: string): 'X' | 'O' | null {
  if (outcome(board) !== 'playing') {
    return null;
  }
  const marks = [...board];
  const xCount = marks.filter(mark => mark === 'X').length;
  const oCount = marks.filter(mark => mark === 'O').length;
  if (xCount === oCount) {
    return 'X';
  }
  return xCount === oCount + 1 ? 'O' : null;
}
