import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import {
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';

import type { IServiceNodeUpgradeJournal } from '../recoverServiceTabJournal.ts';
import type { IServiceBrowserSessionApi } from '../ServiceBrowserSessionApi.ts';
import type {
  IServiceSharedWorkerHost,
  ServiceAttachmentSchema,
} from '../ServiceSharedWorkerApi.ts';

type IAttachProps = {
  attachment: typeof ServiceAttachmentSchema.Type;
  admission: RpcStub<() => Promise<IAdmissionRequest>>;
  journalBootstrap?: RpcStub<IServiceNodeUpgradeJournal> | undefined;
  recoveryNotice?:
    | RpcStub<(error: IZerospinErrorJson) => Promise<void>>
    | undefined;
  host: IServiceSharedWorkerHost;
  signal: AbortSignal;
  isDisposed(): boolean;
  connections: Set<() => void>;
};

type IAttachResult = Effect.Effect<
  RpcStub<IServiceBrowserSessionApi>,
  IAnyError
>;

/** Retain the provider and actual owner-created session under this port's capability lifetime. */
export const attach: (props: IAttachProps) => IAttachResult = makeFn(
  'ServiceSharedWorkerApi.attach',
)(function* (props: IAttachProps) {
  const {
    attachment,
    admission,
    recoveryNotice,
    journalBootstrap,
    host,
    signal,
    isDisposed,
    connections,
  } = props;
  const provider = yield* Effect.sync(() => admission.dup());
  let notice: typeof recoveryNotice;
  try {
    notice = recoveryNotice?.dup();
  } catch {
    /* Notification loss cannot fail attachment. */
  }
  const journal = journalBootstrap?.dup();
  let retained = false;
  return yield* Effect.gen(function* () {
    const attached = yield* Effect.tryPromise({
      try: () =>
        host.attach(
          attachment,
          () => Promise.resolve(provider()),
          signal,
          notice === undefined
            ? undefined
            : error => Promise.resolve(notice(error)),
          journal,
        ),
      catch: error => {
        if (isZerospinError(error) && !('scope' in error)) return error;
        throw error;
      },
    });
    if (isDisposed()) {
      attached[Symbol.dispose]();
      return yield* makeZerospinError('node-tab-detached');
    }
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      attached[Symbol.dispose]();
    };
    attached.ownAttachment(() => {
      try {
        provider[Symbol.dispose]();
        notice?.[Symbol.dispose]();
        journal?.[Symbol.dispose]();
      } finally {
        connections.delete(close);
      }
    });
    connections.add(close);
    const capability = new RpcStub<IServiceBrowserSessionApi>(attached);
    retained = true;
    return capability;
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (!retained) {
          provider[Symbol.dispose]();
          notice?.[Symbol.dispose]();
          journal?.[Symbol.dispose]();
        }
      }),
    ),
  );
});
