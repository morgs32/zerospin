import { ActorDeltaSchema } from '@zerospin/core/models/ActorDeltaSchema';
import { makeTable, primitives } from '@zerospin/shapes';

/** Immutable public selected transition; private recipient data belongs to commandResolutions. */
export const serviceExposedCommandsTable = makeTable({
  name: 'exposedCommands',
  shape: {
    serviceIndex: primitives.integer({ primaryKey: true }),
    dispositionChainHash: primitives.text(),
    id: primitives.id({ abbreviation: 'cmd', unique: true }),
    commandName: primitives.text(),
    delta: primitives.json({ schema: ActorDeltaSchema }),
  },
});
