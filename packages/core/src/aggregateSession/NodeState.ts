import type { IZerospinErrorJson, PublicFailureSchema } from '@zerospin/error';

/** State of the shared durable node, independent of this tab's optimistic journal. */
export type INodeState = Readonly<{
  nodeId: string;
  nodeIndex: number;
  pushIndex: number;
  admittedThroughPushIndex: number;
  outcomeIndex: number;
  uncertainHandoffs: number;
  pushPaused: boolean;
  localAvailability: string;
  authentication: string;
  synchronization: string;
  blockedWork: boolean;
  failure: IZerospinErrorJson | null;
  /** A rejected submission stays correlated while the worker is blocked. */
  admissionRejection?: Readonly<{
    commandId: string;
    commandName: string;
    failure: typeof PublicFailureSchema.Type;
  }> | null;
}>;
