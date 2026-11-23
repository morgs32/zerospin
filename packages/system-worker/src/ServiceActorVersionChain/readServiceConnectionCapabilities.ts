import { validateContractModels } from '@zerospin/core/declaration/validateActorContracts';
import type { IDb } from '@zerospin/core/drizzle/types';
import { assertValidModels } from '@zerospin/core/models/assertValidModels';
import type { IAnyModels } from '@zerospin/core/models/types';
import type { ISystem } from '@zerospin/core/system/types';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';
import type { Connection } from 'partyserver';

import {
  resolveServiceActorView,
  type IServiceProjectionKey,
} from '../serviceProjection/resolveServiceActorView.js';

import {
  ServiceConnectionStateSchema,
  type IServiceConnectionState,
} from './connectionState.js';
import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

/** Recover selected capabilities only from this Chain's exact Service release and admitted identity. */
export function readServiceConnectionCapabilities(props: {
  db: IDb;
  key: IServiceProjectionKey;
  system: ISystem;
  connection: Connection<IServiceConnectionState>;
}) {
  const { db, key, system, connection } = props;
  try {
    const state = Effect.runSync(
      Schema.decodeUnknownEffect(ServiceConnectionStateSchema)(
        connection.state,
        { onExcessProperty: 'error' },
      ),
    );
    if (
      state.serviceName !== key.serviceName ||
      state.serviceVersion !== key.serviceVersion ||
      state.actorName !== key.actorName ||
      state.actorVersion !== key.actorVersion ||
      state.actorPath !== key.actorPath ||
      (state.phase !== 'awaiting-resume' &&
        state.issuedNodeId !== null &&
        state.nodeId !== state.issuedNodeId)
    ) {
      return null;
    }
    const table = serviceActorVersionChainDbConfig.schema.connectionLocks;
    const retained = db
      .select()
      .from(table)
      .where(eq(table.connectionId, connection.id))
      .get();
    if (retained === undefined) return null;
    const capabilities = Effect.runSync(
      serviceActorVersionChainDbConfig.tables.connectionLocks.decodeRow(
        retained,
      ),
    );
    if (
      new Set(capabilities.modelNames).size !== capabilities.modelNames.length
    ) {
      return null;
    }
    const versions = Object.hasOwn(system.services, key.serviceName)
      ? system.services[key.serviceName]?.releases
      : undefined;
    const release =
      versions !== undefined && Object.hasOwn(versions, key.serviceVersion)
        ? versions[key.serviceVersion]
        : undefined;
    if (release === undefined) return null;
    const { actor, encodedIdentity } = Effect.runSync(
      resolveServiceActorView(release, key),
    );
    Effect.runSync(
      Schema.decodeUnknownEffect(actor.identity.claimsSchema)(state.claims, {
        onExcessProperty: 'error',
      }),
    );
    if (
      !Object.values(
        mapValues(
          encodedIdentity,
          (value, field) => state.claims[field] === value,
        ),
      ).every(Boolean)
    ) {
      return null;
    }
    const models: IAnyModels = Object.fromEntries(
      capabilities.modelNames.map(modelName => {
        const model = Object.hasOwn(actor.exposedModels, modelName)
          ? actor.exposedModels[modelName]
          : undefined;
        if (model === undefined) {
          throw new Error('Admitted Service model is unavailable');
        }
        return [modelName, model] as const;
      }),
    );
    assertValidModels({
      models,
      context: `Service session ${state.sessionName}`,
    });
    const contractVersions = mapValues(
      capabilities.contractVersions,
      (version, contractName) => {
        const entry = Object.hasOwn(actor.contracts, contractName)
          ? actor.contracts[contractName]
          : undefined;
        if (
          entry === undefined ||
          entry.external !== undefined ||
          entry.version !== version
        ) {
          throw new Error('Admitted Service contract is unavailable');
        }
        const contract = entry;
        validateContractModels({
          entry: contract,
          models,
          context: `Service session ${state.sessionName}`,
        });
        return contract.version;
      },
    );
    return { state, models, contractVersions };
  } catch {
    return null;
  }
}
