import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { BrowserRpc } from '../Node/BrowserRpc.ts';

import { attach } from './attach/attach.ts';
import type { makeStandaloneWorkerRuntime } from './makeStandaloneWorkerRuntime.ts';
import { ready } from './ready/ready.ts';
import type {
  IStandaloneBrowserSessionApi,
  IStandaloneSessionAttachment,
  StandaloneBrowserSessionApi,
} from './StandaloneBrowserSessionApi.ts';

export const StandaloneAttachmentSchema = Schema.Struct({
  sessionName: Schema.NonEmptyString,
  pattern: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  resources: Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  ),
  reset: Schema.optionalKey(Schema.Boolean),
  discardUnrestorable: Schema.optionalKey(Schema.Boolean),
});

export class StandaloneSharedWorkerApi extends RpcTarget {
  private closed = false;
  private sessions = new Set<StandaloneBrowserSessionApi>();
  private recoveryNotice:
    | RpcStub<(error: IZerospinErrorJson) => Promise<void>>
    | undefined;
  private releaseRecoveryNotice: (() => void) | undefined;
  private attaching = 0;
  private attached = false;

  constructor(
    private attachSession: (
      attachment: typeof StandaloneAttachmentSchema.Type,
    ) => Promise<IStandaloneSessionAttachment>,
    private drain: () => ReturnType<
      ReturnType<typeof makeStandaloneWorkerRuntime>['drainProgram']
    >,
    private push: (
      expectedNodeId: string,
    ) => ReturnType<
      ReturnType<typeof makeStandaloneWorkerRuntime>['pushProgram']
    >,
    private ownership: Promise<void>,
    private subscribeRecoveryNotices: (
      notify: (error: IZerospinErrorJson) => Promise<void>,
    ) => () => void,
  ) {
    super();
  }

  async ready() {
    return BrowserRpc.run(
      ready({ ownership: this.ownership, isClosed: () => this.closed }),
    );
  }

  async attach(
    input: unknown,
    recoveryNotice: RpcStub<(error: IZerospinErrorJson) => Promise<void>>,
  ): Promise<RpcStub<IStandaloneBrowserSessionApi>> {
    this.attaching += 1;
    if (!this.closed && this.recoveryNotice === undefined) {
      try {
        const retained = recoveryNotice.dup();
        this.recoveryNotice = retained;
        this.releaseRecoveryNotice = this.subscribeRecoveryNotices(error =>
          !this.closed && this.recoveryNotice === retained
            ? Promise.resolve(retained(error))
            : Promise.resolve(),
        );
      } catch {
        // Losing a notice recipient cannot prevent a healthy attachment.
        this.closeRecoveryNotice();
      }
    }
    try {
      const session = await BrowserRpc.run(
        Schema.decodeUnknownEffect(StandaloneAttachmentSchema)(input, {
          onExcessProperty: 'error',
        }).pipe(
          Effect.orDie,
          Effect.flatMap(attachment =>
            attach({
              attachment,
              attachSession: request => this.attachSession(request),
              drain: this.drain,
              push: this.push,
              isClosed: () => this.closed,
              sessions: this.sessions,
            }),
          ),
        ),
      );
      this.attached = true;
      return session;
    } finally {
      this.attaching -= 1;
      if (!this.attached && this.attaching === 0) this.closeRecoveryNotice();
    }
  }

  private closeRecoveryNotice() {
    const release = this.releaseRecoveryNotice;
    const notice = this.recoveryNotice;
    this.releaseRecoveryNotice = undefined;
    this.recoveryNotice = undefined;
    try {
      release?.();
    } catch {
      // Notice cleanup cannot replace the connection's original outcome.
    }
    try {
      notice?.[Symbol.dispose]();
    } catch {
      // A disconnected callback cannot prevent owner cleanup.
    }
  }

  [Symbol.dispose]() {
    this.closed = true;
    this.closeRecoveryNotice();
    for (const session of this.sessions) session[Symbol.dispose]();
    this.sessions.clear();
  }
}

export type IStandaloneSharedWorkerApi = {
  ready(): Promise<{ version: string; artifactUrl: string }>;
  attach(
    input: unknown,
    recoveryNotice: RpcStub<(error: IZerospinErrorJson) => Promise<void>>,
  ): Promise<RpcStub<IStandaloneBrowserSessionApi>>;
};
