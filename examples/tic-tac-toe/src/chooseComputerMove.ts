import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

/** Replace this provider with an external chooser without changing game commands. */
export class ChooseComputerMove extends Context.Service<
  ChooseComputerMove,
  (board: string) => Effect.Effect<number>
>()('ChooseComputerMove') {}

export const deterministicComputerMove = Layer.succeed(
  ChooseComputerMove,
  board => {
    const moveIndex = board.indexOf('.');
    return Effect.logInfo('Computer move selected').pipe(
      Effect.annotateLogs({ moveIndex }),
      Effect.as(moveIndex),
    );
  },
);
