import { mapParseError, type IZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';

import type { IAggregateNodeCommand } from '../../../AggregateNode/types.ts';
import { encodeCommand } from '../../../contracts/encodeCommand.ts';
import { StagingOutcomeSchema } from '../../../contracts/StagingOutcomeSchema.ts';
import type {
  IAggregateContractRelease,
  IContractFailure,
  IInferAggregateSessionSubmissionInput,
  IInferContractExecutionRequirements,
  IInferContractResult,
  IAggregateSessionSubmission,
} from '../../../contracts/types.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { IDb, ITx } from '../../../drizzle/types.ts';
import { aggregateSessionRepoDbConfig } from '../../aggregateSessionRepoDbConfig.ts';
import { allocateAggregateSessionIndexTx } from '../../allocateAggregateSessionIndexTx.ts';
import { evaluateAggregateSessionCommandTx } from '../../evaluateAggregateSessionCommandTx.ts';
import type { IInitializedAggregateSession } from '../../makeInitializedAggregateSession.ts';

type IProps<
  CONTRACT extends IAggregateContractRelease = IAggregateContractRelease,
> = {
  initialized: IInitializedAggregateSession;
  contractName: string;
  contract: CONTRACT | undefined;
  payload: unknown;
  onCommandStaged?: ((command: IAggregateNodeCommand) => void) | undefined;
};

/** Construct, evaluate, and retain local optimism in its owning transaction. */
export function stageAggregateSessionCommandTx<
  CONTRACT extends IAggregateContractRelease,
>(
  db: IDb,
  props: IProps<CONTRACT>,
): Effect.Effect<
  IAggregateSessionSubmission<
    IInferAggregateSessionSubmissionInput<CONTRACT>,
    IInferContractResult<CONTRACT>
  >,
  IContractFailure | IZerospinError<'drizzle-transaction-failed'>,
  Exclude<IInferContractExecutionRequirements<CONTRACT>, Scope.Scope>
>;
export function stageAggregateSessionCommandTx(db: IDb, props: IProps) {
  const { onCommandStaged, ...evaluation } = props;
  const execute = makeTx('stageAggregateSessionCommandTx')(function* (tx: ITx) {
    const {
      contract,
      command,
      madeOperations,
      encodedResult,
      inverseOperations,
      completedAt,
    } = yield* evaluateAggregateSessionCommandTx(tx, evaluation);
    const sessionIndex = yield* allocateAggregateSessionIndexTx(tx);
    const encodedInput = yield* encodeCommand({ contract, command });
    const encodedCommand = {
      ...encodedInput,
      sessionIndex,
      stagingOutcome: {
        result: encodedResult,
        completedAt,
      },
    };
    const commandRow = yield* aggregateSessionRepoDbConfig.tables.commands
      .encodeRow({
        commandName: encodedCommand.commandName,
        payload: encodedCommand.payload,
        sessionIndex,
        stagingOutcome: encodedCommand.stagingOutcome,
        nodeId: null,
        nodeIndex: null,
        pushIndex: null,
        failure: null,
        inverseOperations,
        aggregateIndex: null,
      })
      .pipe(
        mapParseError({
          code: 'session-command-encode-failed',
          prefix: 'Failed to encode staged session command',
        }),
      );
    tx.insert(aggregateSessionRepoDbConfig.schema.commands)
      .values(commandRow)
      .run();
    const encodedOriginal: IAggregateNodeCommand = {
      ...encodedCommand,
      id: null,
      nodeId: null,
      nodeIndex: null,
      pushIndex: null,
      stagingOutcome: Schema.encodeSync(StagingOutcomeSchema)(
        encodedCommand.stagingOutcome,
      ),
    };
    return {
      encodedOriginal,
      submission: {
        ...command,
        sessionIndex,
        stagingOutcome: {
          ...encodedCommand.stagingOutcome,
          result: madeOperations.result,
        },
      },
    };
  });
  return execute(db).pipe(
    Effect.map(({ encodedOriginal, submission }) => {
      try {
        onCommandStaged?.(encodedOriginal);
      } catch (cause) {
        // Journal handoff cannot turn committed optimism into a staging failure.
        console.error(
          'Aggregate session command journal handoff failed',
          cause,
        );
      }
      return submission;
    }),
  );
}
