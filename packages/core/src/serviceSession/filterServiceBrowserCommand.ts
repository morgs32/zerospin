import { isEqual } from 'es-toolkit';

import type { IServiceExposedCommand } from './types.ts';

/** Ownership stays private in retained metadata; public delivery contains only a browser command. */
export function filterServiceBrowserCommand(
  output: IServiceExposedCommand,
  models: Readonly<Record<string, unknown>>,
  recipient?: {
    claims: Readonly<Record<string, unknown>>;
    sessionName: string;
    actorName: string;
    actorVersion: number;
    nodeId?: string | null;
  },
  owner?:
    | {
        kind: 'actor';
        actorName: string;
        actorVersion: number;
        claims: Readonly<Record<string, unknown>>;
        nodeId: string;
        sessionName: string;
        pushIndex: number;
      }
    | { kind: 'agent' | 'system' | 'external' },
): IServiceExposedCommand {
  const owns =
    recipient !== undefined &&
    owner !== undefined &&
    owner.kind === 'actor' &&
    owner.actorName === recipient.actorName &&
    owner.actorVersion === recipient.actorVersion &&
    owner.nodeId === recipient.nodeId &&
    owner.sessionName === recipient.sessionName &&
    isEqual(owner.claims, recipient.claims);
  return {
    serviceIndex: output.serviceIndex,
    dispositionChainHash: output.dispositionChainHash,
    id: output.id,
    commandName: output.commandName,
    failure: owns ? output.failure : null,
    delta: {
      upserted: output.delta.upserted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
      deleted: output.delta.deleted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
    },
  };
}
