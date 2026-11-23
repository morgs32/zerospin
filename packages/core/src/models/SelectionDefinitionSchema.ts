import * as Schema from 'effect/Schema';

/** Stable authored selection structure, independent of SQL compilation. */
export const SelectionDefinitionSchema = Schema.Struct({ config: Schema.Json });
