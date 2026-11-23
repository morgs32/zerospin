import * as Effect from 'effect/Effect';

import { replayCommand } from './replayCommand.js';

type IReplayProps = Omit<Parameters<typeof replayCommand>[0], 'command'> & {
  rows: readonly Parameters<typeof replayCommand>[0]['command'][];
};

/** Preserve the owner's existing sequential receiving loop, including authored requirements. */
const replayCommandRows = Effect.fn('AggregateVersionRepo.replayCommands')((
  props: IReplayProps,
) => {
  const { rows, ...replay } = props;
  return Effect.forEach(rows, command =>
    replayCommand({ ...replay, command }),
  ).pipe(Effect.asVoid);
});

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
