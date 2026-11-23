import * as Effect from 'effect/Effect';

import { replayCommand } from './replayCommand.js';

type IReplayProps = Omit<Parameters<typeof replayCommand>[0], 'command'> & {
  rows: readonly Parameters<typeof replayCommand>[0]['command'][];
};

/** Each replay occurrence commits its head and output before the next begins. */
const replayCommandRows = Effect.fn('ServiceVersionRepo.replayCommands')(
  function* (props: IReplayProps) {
    const { rows, ...replay } = props;

    for (const command of rows) {
      yield* replayCommand({ ...replay, command });
    }
  },
);

/** An empty delivery cannot invoke a command or acquire its services. */
export function replayCommands(
  props: Omit<IReplayProps, 'rows'> & { rows: readonly [] },
): Effect.Effect<void>;

export function replayCommands(
  props: IReplayProps,
): ReturnType<typeof replayCommandRows>;

export function replayCommands(props: IReplayProps) {
  return replayCommandRows(props);
}
