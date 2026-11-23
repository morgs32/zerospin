import type { Effect } from 'effect';

import type { ISystemApi } from './ISystemApi.ts';

/** An authored sequential seed program owns command IDs and outcome decisions. */
export type ISeedProgram = (
  api: ISystemApi,
) => Effect.Effect<void, unknown, never>;
