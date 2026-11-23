import type { ICommandResolution } from '../contracts/CommandResolutionSchema.ts';

import type { IServiceExposedCommand } from './types.ts';

/** Keep private publication metadata out of the browser command representation. */
export function makeServiceExposedCommand({
  commandResolution,
  ...command
}: Omit<IServiceExposedCommand, 'failure'> &
  Readonly<{
    commandResolution: ICommandResolution | null;
  }>): IServiceExposedCommand {
  return { ...command, failure: commandResolution?.failure ?? null };
}
