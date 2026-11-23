import type { ISeedProgram } from '@zerospin/core/systemApi/ISeedProgram';
import type { ISystemGatewayRpc } from '@zerospin/core/systemApi/ISystemGatewayRpc';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { makeSystemApi } from '@zerospin/core/utils/getSystemApi/makeSystemApi';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';
import { createJiti } from 'jiti';

import { jitiAliasesFromTsconfigPaths } from '../deploy/jitiAliasesFromTsconfigPaths.js';
import { loadConfigFn } from '../deploy/loadConfigFn.js';

/** Load and run one authored seed program; each command owns its transaction and outcome. */
export const seedFn = Effect.fn('seedFn')(function* (props: {
  filePath: string;
  cwd?: string;
}): Effect.fn.Return<void, IAnyError, FileSystem.FileSystem | Path.Path> {
  const { cwd = process.cwd(), filePath } = props;
  const { zerospinApiUrl: defaultApiUrl, zerospinSecretKey } =
    yield* loadConfigFn(cwd);
  const zerospinApiUrl =
    process.env['ZEROSPIN_API_URL'] ??
    process.env['VITE_ZEROSPIN_API_URL'] ??
    process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'] ??
    defaultApiUrl;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const modulePath = path.resolve(cwd, filePath);
  const seeds = yield* Effect.gen(function* () {
    if (!(yield* fs.exists(modulePath))) {
      return yield* makeZerospinError({
        code: 'seed-file-missing',
        message: `Seed file does not exist: ${modulePath}.`,
      });
    }
    const alias = yield* jitiAliasesFromTsconfigPaths(cwd);
    const loaded = yield* Effect.tryPromise({
      try: () =>
        createJiti(modulePath, {
          alias,
          moduleCache: false,
          tryNative: false,
        }).import(modulePath),
      catch: cause =>
        makeZerospinError({
          code: 'seed-load-failed',
          message: `Failed to import ${modulePath}.`,
          cause: prettyUnknownFailure(cause),
        }),
    });
    const exports = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.Unknown),
    )(loaded);
    return yield* Schema.decodeUnknownEffect(
      Schema.declare(
        (input: unknown): input is ISeedProgram => typeof input === 'function',
      ),
    )(exports.seeds).pipe(
      Effect.mapError(cause =>
        makeZerospinError({
          code: 'seed-program-invalid',
          message: `Missing named seeds program in ${modulePath}.`,
          cause: prettyUnknownFailure(cause),
        }),
      ),
    );
  }).pipe(
    Effect.mapError(cause =>
      isZerospinError(cause)
        ? cause
        : makeZerospinError({
            code: 'seed-load-failed',
            message: `Failed to load seeds from ${modulePath}.`,
            cause: prettyUnknownFailure(cause),
          }),
    ),
  );
  const rpc = yield* getApi<ISystemGatewayRpc>(zerospinApiUrl)(gateway =>
    gateway.getSystemApi({ zerospinSecretKey }),
  );
  yield* Effect.suspend(() => {
    const program = seeds(makeSystemApi({ rpc }));
    return Effect.isEffect(program)
      ? program
      : Effect.fail(
          makeZerospinError({
            code: 'seed-program-invalid',
            message: `The seeds program in ${modulePath} did not return an Effect.`,
          }),
        );
  }).pipe(
    Effect.catchCause(cause =>
      Effect.fail(
        makeZerospinError({
          code: 'seed-submit-failed',
          message: `Failed to run seeds against ${zerospinApiUrl}.`,
          cause: prettyUnknownFailure(cause),
        }),
      ),
    ),
  );
});
