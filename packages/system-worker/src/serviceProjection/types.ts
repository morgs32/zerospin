import type { IErrorJson, IZerospinError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IFanoutEnrollmentError } from '../makeFanoutQueue/makeFanoutQueue.js';
import type { IFanoutSubscriberCapability } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';

import type { applyEvaluatedCommands } from './applyEvaluatedCommands.js';
export type IServiceProjectionSubscriber = IFanoutSubscriberCapability<
  'actorVersionRepoFanout',
  IEvaluatedServiceCommand,
  Effect.Error<ReturnType<typeof applyEvaluatedCommands>> | IZerospinError,
  IZerospinError<'repo-key-encode-failed'>,
  IErrorJson<IZerospinError<'fanout-page-invalid'>>,
  IErrorJson<IFanoutEnrollmentError>
>;
