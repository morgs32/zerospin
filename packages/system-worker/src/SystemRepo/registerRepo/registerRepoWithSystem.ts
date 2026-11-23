import type { IRepoRegistration, IRepoType } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import type { IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { getTableName } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';

import type { IExpectedAgentInstallation } from '../../agentNodeRepo/agentNodeRuntimeTypes.js';

/** Register a child Repo after requiring its accepted SystemSpec hash. */
export const registerRepoWithSystem = Effect.fn(
  'DORepo.registerRepoWithSystem',
)(function* (props: {
  repoType: Exclude<IRepoType, 'SystemRepo'>;
  name: string;
  schema: Readonly<Record<string, SQLiteTable>>;
  agentInstallation?: IExpectedAgentInstallation;
  systemSpecHash: string;
}) {
  const { repoType, name, schema, systemSpecHash } = props;
  const tableNames = Object.values(schema).map(getTableName);
  const issuer = env.ZEROSPIN_HOSTED_RELEASE_RPC;
  if (
    issuer !== undefined &&
    (repoType === 'ServiceVersionRepo' ||
      repoType === 'ServiceVersionChain' ||
      repoType === 'ServiceVersionArchive')
  ) {
    yield* Effect.promise(async () => {
      using rpc = await issuer.getReleaseRpc();
      return await rpc.registerRepo({ repoType, repoName: name, tableNames });
    }).pipe(Effect.flatMap(readRpcEnvelope));
    return;
  }
  const registration: IRepoRegistration = {
    repoType,
    repoName: name,
    tableNames,
  };
  const systemRepo: {
    registerRepo(props: {
      registration: IRepoRegistration;
      agentInstallation?: IExpectedAgentInstallation;
      systemSpecHash: string;
    }): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  } = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
  yield* Effect.promise(() =>
    systemRepo.registerRepo({
      systemSpecHash,
      registration,
      ...(props.agentInstallation === undefined
        ? {}
        : { agentInstallation: props.agentInstallation }),
    }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
});
