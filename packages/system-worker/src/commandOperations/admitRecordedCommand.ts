import {
  CommandOutcomeSchema,
  type ICommandOutcome,
} from '@zerospin/core/contracts/CommandOutcomeSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  ZerospinErrorJsonSchema,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import { getAggregateVersionRepo } from '../AggregateVersionRepo/getAggregateVersionRepo.js';
import { ServiceChain } from '../ServiceChain/ServiceChain.js';
import { getServiceVersionRepo } from '../ServiceVersionRepo/getServiceVersionRepo.js';

import type { ICommandDelivery } from './makeCommandDeliveryQueue.js';

type IProducerAcknowledgement = {
  acknowledgedSourceIndex: number;
  acknowledgedOperationIndex: number;
  destinationIndex: number;
};
export type IRecordedCommandOutcome =
  | { outcome: ICommandOutcome }
  | { admissionFailure: IZerospinErrorJson };
type IAggregateChainDelivery = {
  source: { systemId: string; aggregateName: string; aggregateId: string };
  delivery: ICommandDelivery;
};
type IServiceChainDelivery = {
  source: { systemId: string; serviceName: string };
  delivery: ICommandDelivery;
};

/** Only explicit validation or identity refusals are terminal; transport and capacity remain recoverable. */
const captureAdmission = Effect.fn('captureRecordedAdmission')(function* (
  admission: Effect.Effect<
    IProducerAcknowledgement,
    IAnyError | IZerospinErrorJson
  >,
) {
  return yield* admission.pipe(
    Effect.map(progress => ({ progress })),
    Effect.catch(error => {
      if (
        Schema.is(ZerospinErrorJsonSchema)(error) &&
        [
          'aggregate-chain-command-invalid',
          'aggregate-command-owner-mismatch',
          'aggregate-recorded-command-conflict',
          'aggregate-producer-binding-invalid',
          'aggregate-command-scope-mismatch',
          'service-version-unsupported',
          'service-command-invalid',
          'service-produced-command-invalid',
          'service-command-scope-mismatch',
          'service-recorded-command-conflict',
          'service-command-producer-invalid',
          'service-command-producer-mismatch',
          'public-async-command-forbidden',
          'admission-contract-not-found',
          'decode-command-payload-failed',
        ].includes(error.code)
      ) {
        return Effect.succeed({ admissionFailure: error });
      }
      return Effect.fail(error);
    }),
  );
});

/** Verify coverage before observing the exact destination command's result. */
function validateCoverage(
  delivery: ICommandDelivery,
  progress: IProducerAcknowledgement,
) {
  if (
    !Number.isSafeInteger(progress.acknowledgedSourceIndex) ||
    !Number.isSafeInteger(progress.acknowledgedOperationIndex) ||
    progress.acknowledgedSourceIndex < delivery.sourceIndex ||
    progress.acknowledgedOperationIndex < 0 ||
    (progress.acknowledgedSourceIndex === delivery.sourceIndex &&
      progress.acknowledgedOperationIndex < delivery.operationIndex)
  ) {
    throw makeZerospinError('command-delivery-checkpoint-invalid');
  }
}

const observeDestinationOutcome = Effect.fn('observeRecordedCommandOutcome')(
  function* (props: {
    systemId: string;
    delivery: ICommandDelivery;
    progress: IProducerAcknowledgement;
  }) {
    const { systemId, delivery, progress } = props;
    validateCoverage(delivery, progress);
    const destinationIndex = progress.destinationIndex;
    if (
      !Number.isSafeInteger(destinationIndex) ||
      destinationIndex < 1 ||
      progress.acknowledgedSourceIndex !== delivery.sourceIndex ||
      progress.acknowledgedOperationIndex !== delivery.operationIndex
    ) {
      return yield* makeZerospinError('command-delivery-position-invalid');
    }
    const recorded = delivery.command;
    const evaluated =
      recorded.type === 'aggregate'
        ? yield* Effect.gen(function* () {
            const repo = yield* getAggregateVersionRepo({
              key: {
                systemId,
                aggregateName: recorded.command.aggregateName,
                aggregateId: recorded.command.aggregateId,
                aggregateVersion: recorded.command.aggregateVersion,
              },
            });
            return yield* Effect.promise(() =>
              repo.awaitCommandResult({ aggregateIndex: destinationIndex }),
            ).pipe(Effect.flatMap(readRpcEnvelope));
          })
        : yield* Effect.gen(function* () {
            const repo = yield* getServiceVersionRepo({
              key: {
                systemId,
                serviceName: recorded.command.serviceName,
                serviceVersion: recorded.command.serviceVersion,
              },
            });
            return yield* Effect.promise(() =>
              repo.awaitCommandResult({ serviceIndex: destinationIndex }),
            ).pipe(Effect.flatMap(readRpcEnvelope));
          });
    if (evaluated.id !== recorded.command.id) {
      return yield* makeZerospinError('command-delivery-result-conflict');
    }
    const outcome = yield* Schema.decodeUnknownEffect(
      Schema.toType(CommandOutcomeSchema),
    )(evaluated.outcome).pipe(
      mapParseError({
        code: 'command-delivery-outcome-invalid',
        prefix: 'Invalid destination outcome',
      }),
    );
    return { outcome };
  },
);

export const admitRecordedCommandFromAggregateChain: (
  props: IAggregateChainDelivery,
) => Effect.Effect<IRecordedCommandOutcome, IAnyError | IZerospinErrorJson> =
  Effect.fn('admitRecordedCommandFromAggregateChain')(function* (
    props: IAggregateChainDelivery,
  ) {
    const { source, delivery } = props;
    const position = {
      sourceIndex: delivery.sourceIndex,
      operationIndex: delivery.operationIndex,
    };
    const recorded = delivery.command;
    if (recorded.type === 'aggregate') {
      const repo = yield* AggregateChain.getRepo({
        key: {
          systemId: source.systemId,
          aggregateName: recorded.command.aggregateName,
          aggregateId: recorded.command.aggregateId,
        },
      });
      const admission = yield* captureAdmission(
        Effect.promise(() =>
          repo.admitFromAggregateChain({
            source,
            position,
            command: recorded.command,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope)),
      );
      if ('admissionFailure' in admission) return admission;
      return yield* observeDestinationOutcome({
        systemId: source.systemId,
        delivery,
        progress: admission.progress,
      });
    }
    const repo = yield* ServiceChain.getRepo({
      key: {
        systemId: source.systemId,
        serviceName: recorded.command.serviceName,
      },
    });
    const admission = yield* captureAdmission(
      Effect.promise(() =>
        repo.admitFromAggregateChain({
          source,
          position,
          command: recorded.command,
        }),
      ).pipe(Effect.flatMap(readRpcEnvelope)),
    );
    if ('admissionFailure' in admission) return admission;
    return yield* observeDestinationOutcome({
      systemId: source.systemId,
      delivery,
      progress: admission.progress,
    });
  });

export const admitRecordedCommandFromServiceChain: (
  props: IServiceChainDelivery,
) => Effect.Effect<IRecordedCommandOutcome, IAnyError | IZerospinErrorJson> =
  Effect.fn('admitRecordedCommandFromServiceChain')(function* (
    props: IServiceChainDelivery,
  ) {
    const { source, delivery } = props;
    const position = {
      sourceIndex: delivery.sourceIndex,
      operationIndex: delivery.operationIndex,
    };
    const recorded = delivery.command;
    if (recorded.type === 'aggregate') {
      const repo = yield* AggregateChain.getRepo({
        key: {
          systemId: source.systemId,
          aggregateName: recorded.command.aggregateName,
          aggregateId: recorded.command.aggregateId,
        },
      });
      const admission = yield* captureAdmission(
        Effect.promise(() =>
          repo.admitFromServiceChain({
            source,
            position,
            command: recorded.command,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope)),
      );
      if ('admissionFailure' in admission) return admission;
      return yield* observeDestinationOutcome({
        systemId: source.systemId,
        delivery,
        progress: admission.progress,
      });
    }
    const repo = yield* ServiceChain.getRepo({
      key: {
        systemId: source.systemId,
        serviceName: recorded.command.serviceName,
      },
    });
    const admission = yield* captureAdmission(
      Effect.promise(() =>
        repo.admitFromServiceChain({
          source,
          position,
          command: recorded.command,
        }),
      ).pipe(Effect.flatMap(readRpcEnvelope)),
    );
    if ('admissionFailure' in admission) return admission;
    return yield* observeDestinationOutcome({
      systemId: source.systemId,
      delivery,
      progress: admission.progress,
    });
  });
