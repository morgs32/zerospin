import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';

import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { EncodedActorServiceCommandSchema } from '../contracts/CommandSchema.ts';
import { StagingOutcomeSchema } from '../contracts/StagingOutcomeSchema.ts';
import {
  makeNodeCommandCoverageSchema,
  NodeCommandAllocationSchema,
  NodeRetentionSchema,
} from '../Node/NodeCommandCoverage.ts';

const fields = {
  ...Struct.omit(EncodedActorServiceCommandSchema.fields, [
    'id',
    'nodeId',
    'pushIndex',
    'serviceVersion',
  ]),
  sessionId: NodeRetentionSchema.fields.sessionId,
  sessionIndex: NodeRetentionSchema.fields.sessionIndex,
  stagingOutcome: Schema.toEncoded(StagingOutcomeSchema),
};

/** One command, with producer allocation unknown or known to this holder. */
export const ServiceNodeCommandSchema = Schema.Union([
  Schema.Struct({
    ...fields,
    ...NodeCommandAllocationSchema.members[0].fields,
  }),
  Schema.Struct({
    ...fields,
    ...NodeCommandAllocationSchema.members[1].fields,
  }),
]).check(
  Schema.makeFilter(
    command =>
      command.id === null ||
      command.id === makeNodeCommandId(command.nodeId, command.pushIndex) ||
      'Node command ID does not match its producer allocation',
  ),
);

export const ServiceNodeCommandCoverageSchema = makeNodeCommandCoverageSchema(
  Schema.Struct({
    id: NodeCommandAllocationSchema.members[1].fields.id,
    commandName: BrowserCommandSchema.fields.commandName,
    serviceIndex: NodeRetentionSchema.fields.pushIndex,
    failure: BrowserCommandSchema.fields.failure,
  }),
);
