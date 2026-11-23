import * as Schema from 'effect/Schema';

export const makeNodeSnapshotRequestSchema = <COMMAND extends Schema.Top>(
  command: COMMAND,
) =>
  Schema.Struct({ pendingCommands: Schema.optionalKey(Schema.Array(command)) });
