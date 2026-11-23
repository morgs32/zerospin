import type { IAnyError } from '@zerospin/error';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import type * as FileSystem from 'effect/FileSystem';
import type * as Path from 'effect/Path';
import type * as Scope from 'effect/Scope';
import type * as Terminal from 'effect/Terminal';

import { initializeDevelopmentSystem } from './initializeDevelopmentSystem.js';
import { loadDevelopmentProject } from './loadDevelopmentProject.js';
import { openDevelopmentWorker } from './openDevelopmentWorker.js';
import { openDevelopmentWorkspace } from './openDevelopmentWorkspace.js';
import { ownDevelopmentSignals } from './ownDevelopmentSignals.js';

export interface IDevelopmentOptions {
  clean: boolean;
  port?: number | undefined;
  stateDir?: string | undefined;
  sharedR2?: string | undefined;
}

/** One invocation owns signals, temporary secrets, Wrangler and the startup SystemSpec. */
export const devFn = Effect.fn('devFn')(function* (
  options: IDevelopmentOptions,
): Effect.fn.Return<
  Readonly<{ port: number | undefined }>,
  IAnyError,
  Scope.Scope | FileSystem.FileSystem | Path.Path | Terminal.Terminal
> {
  const stopped = yield* ownDevelopmentSignals();
  let selectedPort = options.port;
  yield* Effect.gen(function* () {
    const project = yield* loadDevelopmentProject(options.port);
    selectedPort = project.port;
    const workspace = yield* openDevelopmentWorkspace(project, options);
    const apiUrl = yield* openDevelopmentWorker(project, workspace, stopped);
    yield* initializeDevelopmentSystem(apiUrl);
    yield* Effect.never;
  }).pipe(Effect.raceFirst(Deferred.await(stopped)));
  return { port: selectedPort };
}, Effect.scoped);
