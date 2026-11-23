import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';

import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../../Node/nodeRpcErrorFor.ts';
import type { makeStandaloneWorkerRuntime } from '../makeStandaloneWorkerRuntime.ts';
import {
  StandaloneBrowserSessionApi,
  type IStandaloneBrowserSessionApi,
  type IStandaloneSessionAttachment,
} from '../StandaloneBrowserSessionApi.ts';

type IAttachProps = {
  attachment: Parameters<
    ReturnType<typeof makeStandaloneWorkerRuntime>['attach']
  >[0];
  attachSession(
    attachment: Parameters<
      ReturnType<typeof makeStandaloneWorkerRuntime>['attach']
    >[0],
  ): Promise<IStandaloneSessionAttachment>;
  drain(): ReturnType<
    ReturnType<typeof makeStandaloneWorkerRuntime>['drainProgram']
  >;
  push(
    expectedNodeId: string,
  ): ReturnType<ReturnType<typeof makeStandaloneWorkerRuntime>['pushProgram']>;
  isClosed(): boolean;
  sessions: Set<StandaloneBrowserSessionApi>;
};

const attachFailure = nodeRpcErrorFor([
  'standalone-worker-unavailable',
  'standalone-session-definition-missing',
  'standalone-storage-identity-mismatch',
  'standalone-backup-path-invalid',
  'standalone-backup-parameter-invalid',
  'standalone-resource-model-invalid',
  'node-storage-reset-required',
  'node-storage-identity-mismatch',
  'node-baseline-checkpoint-invalid',
  'node-tab-detached',
  ...snapshotFailureCodes,
]);

/** Attach the local owner and retain this connection's session capability. */
export const attach: (
  props: IAttachProps,
) => Effect.Effect<
  RpcStub<IStandaloneBrowserSessionApi>,
  ReturnType<typeof attachFailure>
> = makeFn('StandaloneSharedWorkerApi.attach')(function* (props: IAttachProps) {
  const { attachment, attachSession, drain, push, isClosed, sessions } = props;
  return yield* Effect.tryPromise({
    try: async (): Promise<RpcStub<IStandaloneBrowserSessionApi>> => {
      const attached = await attachSession(attachment);
      if (isClosed()) {
        throw makeZerospinError('node-tab-detached');
      }
      const session = new StandaloneBrowserSessionApi(
        attached,
        drain,
        push,
        () => sessions.delete(session),
      );
      sessions.add(session);
      return new RpcStub<IStandaloneBrowserSessionApi>(session);
    },
    catch: attachFailure,
  });
});
