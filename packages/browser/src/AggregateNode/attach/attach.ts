import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import {
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';

import type { IAggregateBrowserSessionApi } from '../AggregateBrowserSessionApi.ts';
import type {
  AggregateAttachmentSchema,
  IAggregateSharedWorkerHost,
} from '../AggregateSharedWorkerApi.ts';
import type { IAggregateNodeUpgradeJournal } from '../recoverAggregateTabJournal.ts';

type IAttachProps = {
  attachment: typeof AggregateAttachmentSchema.Type;
  admission: RpcStub<() => Promise<IAggregateAuthenticationRequest>>;
  telemetry?: RpcStub<(batch: ITelemetryBatch) => Promise<void>>;
  journalBootstrap?: RpcStub<IAggregateNodeUpgradeJournal> | undefined;
  recoveryNotice?:
    | RpcStub<(error: IZerospinErrorJson) => Promise<void>>
    | undefined;
  runtime: IAggregateSharedWorkerHost;
  signal: AbortSignal;
  isDisposed(): boolean;
  connections: Set<() => void>;
};

type IAttachResult = Effect.Effect<
  RpcStub<IAggregateBrowserSessionApi>,
  IAnyError
>;

/** Retain the provider and actual owner-created session under this port's capability lifetime. */
export const attach: (props: IAttachProps) => IAttachResult = Effect.fn(
  'AggregateSharedWorkerApi.attach',
)(function* (props: IAttachProps) {
  const {
    attachment,
    admission,
    telemetry,
    recoveryNotice,
    journalBootstrap,
    runtime,
    signal,
    isDisposed,
    connections,
  } = props;
  const provider = yield* Effect.sync(() => admission.dup());
  let releaseTelemetry: (() => void) | undefined;
  let notice: typeof recoveryNotice;
  try {
    notice = recoveryNotice?.dup();
  } catch {
    /* Notification loss cannot fail attachment. */
  }
  const journal = journalBootstrap?.dup();
  let retained = false;
  return yield* Effect.gen(function* () {
    let observer: Parameters<IAggregateSharedWorkerHost['attach']>[3];
    if (attachment.diagnostics !== undefined && telemetry !== undefined) {
      try {
        const callback = telemetry.dup();
        let released = false;
        releaseTelemetry = () => {
          if (released) return;
          released = true;
          callback[Symbol.dispose]();
        };
        observer = {
          send: batch => Promise.resolve(callback(batch)),
          release: releaseTelemetry,
        };
      } catch {
        // A disconnected diagnostic callback cannot prevent attachment.
      }
    }
    const attached = yield* Effect.tryPromise({
      try: () =>
        runtime.attach(
          attachment,
          () => Promise.resolve(provider()),
          signal,
          observer,
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
    const capability = new RpcStub<IAggregateBrowserSessionApi>(attached);
    retained = true;
    return capability;
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (!retained) {
          try {
            provider[Symbol.dispose]();
            notice?.[Symbol.dispose]();
            journal?.[Symbol.dispose]();
          } finally {
            releaseTelemetry?.();
          }
        }
      }),
    ),
  );
});
