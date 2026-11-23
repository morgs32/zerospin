import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';

import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { EncodedActorAggregateCommandSchema } from '../contracts/CommandSchema.ts';
import { StagingOutcomeSchema } from '../contracts/StagingOutcomeSchema.ts';
import {
  makeNodeCommandCoverageSchema,
  NodeCommandAllocationSchema,
  NodeRetentionSchema,
} from '../Node/NodeCommandCoverage.ts';

const fields = {
  ...Struct.omit(EncodedActorAggregateCommandSchema.fields, [
    'id',
    'nodeId',
    'pushIndex',
  ]),
  sessionId: NodeRetentionSchema.fields.sessionId,
  sessionIndex: NodeRetentionSchema.fields.sessionIndex,
  stagingOutcome: Schema.toEncoded(StagingOutcomeSchema),
};

/** One command, with producer allocation unknown or known to this holder. */
export const AggregateNodeCommandSchema = Schema.Union([
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

export const AggregateNodeCommandCoverageSchema = makeNodeCommandCoverageSchema(
  Schema.Struct({
    id: NodeCommandAllocationSchema.members[1].fields.id,
    commandName: BrowserCommandSchema.fields.commandName,
    aggregateIndex: NodeRetentionSchema.fields.pushIndex,
    failure: BrowserCommandSchema.fields.failure,
  }),
);
