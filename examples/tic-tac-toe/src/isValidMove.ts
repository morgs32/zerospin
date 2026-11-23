import { turn } from './gameV1';

/** Shared rule used by browser admission and authoritative aggregate guards. */
export const isValidMove = (
  board: string | undefined,
  payload: Readonly<{ board: string; square: number }>,
  mark: 'X' | 'O',
) =>
  board !== undefined &&
  board === payload.board &&
  turn(board) === mark &&
  Number.isInteger(payload.square) &&
  payload.square >= 0 &&
  payload.square <= 8 &&
  payload.board[payload.square] === '.';
