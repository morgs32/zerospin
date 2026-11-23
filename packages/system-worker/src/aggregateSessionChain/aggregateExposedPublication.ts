import { AggregateExposedCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { CommandResolutionSchema } from '@zerospin/core/contracts/CommandResolutionSchema';
import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';

export const AggregateExposedPublicationSchema = Schema.Struct({
  aggregateIndex: AggregateExposedCommandSchema.fields.aggregateIndex,
  dispositionChainHash:
    AggregateExposedCommandSchema.fields.dispositionChainHash,
  id: AggregateExposedCommandSchema.fields.id,
  commandName: AggregateExposedCommandSchema.fields.commandName,
  delta: AggregateExposedCommandSchema.fields.delta,
  commandResolution: Schema.NullOr(CommandResolutionSchema),
});
export const AggregateAgentExposedPublicationSchema = Schema.Struct(
  Struct.omit(AggregateExposedPublicationSchema.fields, ['commandResolution']),
);
export type IAggregateAgentExposedPublication =
  typeof AggregateAgentExposedPublicationSchema.Type;

export type IAggregateExposedPublication = Schema.Schema.Type<
  typeof AggregateExposedPublicationSchema
>;
