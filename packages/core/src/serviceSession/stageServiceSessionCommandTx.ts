import { mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { StagingOutcomeSchema } from '../contracts/StagingOutcomeSchema.ts';
import type { IServiceContractRelease } from '../contracts/types.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import type { ITx } from '../drizzle/types.ts';
import type { IServiceNodeCommand } from '../ServiceNode/types.ts';

import { allocateServiceSessionIndexTx } from './allocateServiceSessionIndexTx.ts';
import { evaluateServiceSessionCommandTx } from './evaluateServiceSessionCommandTx.ts';
import { readServiceSessionMetadataTx } from './readServiceSessionMetadataTx.ts';
import { serviceSessionRepoDbConfig } from './serviceSessionRepoTables.ts';
import type {
  IServiceSessionDefinition,
  IServiceSessionDrizzleDb,
} from './types.ts';

/** Append local staging and its optimism atomically without replaying prior pending commands. */
export const stageServiceSessionCommandTx = Effect.fn(
  'stageServiceSessionCommandTx',
)(function* <CONTRACT extends IServiceContractRelease>(props: {
  db: IServiceSessionDrizzleDb;
  definition: IServiceSessionDefinition;
  contract: CONTRACT;
  payload: unknown;
  claims: Readonly<Record<string, unknown>>;
  sessionId: `sesn_${string}`;
  onCommandStaged?: ((command: IServiceNodeCommand) => void) | undefined;
}) {
  const {
    db,
    definition,
    contract,
    payload,
    claims,
    sessionId,
    onCommandStaged,
  } = props;
  const staged = yield* makeTx('retainServiceSessionCommand')(function* (
    tx: ITx,
  ) {
    const { commands } = serviceSessionRepoDbConfig.schema;
    yield* readServiceSessionMetadataTx(tx);
    const sessionIndex = yield* allocateServiceSessionIndexTx(tx);
    const evaluated = yield* evaluateServiceSessionCommandTx({
      tx,
      definition,
      contract,
      payload,
      claims,
    });
    const { result, inverseOperations } = evaluated;
    const command = {
      ...evaluated.command,
      sessionId,
      sessionIndex,
      id: null,
      nodeId: null,
      nodeIndex: null,
      pushIndex: null,
    };
    tx.insert(commands)
      .values(
        yield* serviceSessionRepoDbConfig.tables.commands
          .encodeRow({
            commandName: command.commandName,
            payload: command.payload,
            stagingOutcome: yield* Schema.decodeUnknownEffect(
              StagingOutcomeSchema,
            )(command.stagingOutcome).pipe(
              mapParseError({
                code: 'service-session-staging-invalid',
                prefix: 'Invalid service staging',
              }),
            ),
            sessionIndex,
            nodeId: null,
            nodeIndex: null,
            pushIndex: null,
            failure: null,
            inverseOperations,
            serviceIndex: null,
          })
          .pipe(
            mapParseError({
              code: 'service-session-command-invalid',
              prefix: 'Invalid service command',
            }),
          ),
      )
      .run();
    return { command, result };
  })(db);
  try {
    onCommandStaged?.(staged.command);
  } catch (cause) {
    // Journal handoff cannot turn committed optimism into a staging failure.
    console.error('Service session command journal handoff failed', cause);
  }
  return staged;
});
