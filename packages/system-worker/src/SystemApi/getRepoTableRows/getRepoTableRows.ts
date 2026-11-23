import { RepoTypeSchema } from '@zerospin/core/system/RepoTypeSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { Initialized } from '../Initialized.js';

import { resolveRegisteredRepo } from './utils/resolveRegisteredRepo.js';

/** Inspect one concrete Repo kind within the authenticated system capability. */
export const getRepoTableRows = rpcMethod({
  name: 'SystemApi.getRepoTableRows',
  schema: rpcRequestSchema(
    Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          repoType: RepoTypeSchema,
          repoName: Schema.String,
          tableName: Schema.String,
        }),
      ]),
    ),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.getRepoTableRows received invalid arguments',
  },
  linked: true,
})(
  function* ([{ repoType, repoName, tableName }]) {
    const { systemId } = yield* Initialized;
    const systemRepo = yield* (yield* SystemRepos).getRepo({
      key: { systemId },
    });
    const registrations = yield* Effect.promise(() =>
      systemRepo.getRepoRegistrations({ repoType }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    if (
      !registrations.some(registration => registration.repoName === repoName)
    ) {
      return yield* makeZerospinError({
        code: 'repo-explorer-repo-not-found',
        message: `${repoType} "${repoName}" is not registered`,
        extra: { repoType, repoName },
      });
    }
    const repo = yield* resolveRegisteredRepo({
      repoType,
      repoName,
      systemId,
      systemRepo,
    });
    return yield* Effect.promise(() =>
      repo.getRepoTableRows({ tableName }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
