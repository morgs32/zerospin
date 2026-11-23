import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  DevelopmentHistorySchema,
  type IDevelopmentHistory,
} from '@zerospin/core/Node/DevelopmentHistorySchema';
import * as Schema from 'effect/Schema';

import {
  linkSharedDevelopmentR2,
  resolveSharedDevelopmentR2,
} from './sharedDevelopmentR2.js';

const workerLayout = 'deployed-workers-v1';
const decodeStoredHistory = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      ...DevelopmentHistorySchema.fields,
      workerLayout: Schema.optional(Schema.Unknown),
    }),
  ),
);
const historyDirectoryName = '.zerospin-histories';

async function readDevelopmentHistory(
  generation: string,
): Promise<IDevelopmentHistory> {
  const { workerLayout: storedLayout, ...history } = decodeStoredHistory(
    await fs.readFile(path.join(generation, 'history.json'), 'utf8'),
  );
  if (storedLayout !== workerLayout) {
    throw new Error(
      'This directory uses an incompatible development Worker layout. Choose a fresh --state-dir to preserve existing state.',
    );
  }
  return history;
}

function isFileError(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    codes.includes(String(error.code))
  );
}

async function requireStorageDirectory(directory: string): Promise<void> {
  if (!(await fs.lstat(directory)).isDirectory()) {
    throw new Error(`Zerospin storage must be a directory at ${directory}.`);
  }
}

/** Publish a fully written history with one rename. Concurrent opens adopt the same winner. */
async function publishHistory(
  directory: string,
  previous: IDevelopmentHistory | undefined,
  systemId: string,
  sharedR2Directory?: string,
) {
  const replaced =
    previous === undefined ? [] : [...previous.replaced, previous.id];
  const generation = path.join(directory, String(replaced.length));
  const staged = await fs.mkdtemp(path.join(directory, 'preparing-'));
  try {
    const history: IDevelopmentHistory = {
      systemId,
      id: randomUUID(),
      replaced,
    };
    await fs.writeFile(
      path.join(staged, 'history.json'),
      JSON.stringify({ ...history, workerLayout }),
      { mode: 0o600 },
    );
    if (previous !== undefined) {
      const storage = path.join(staged, 'storage');
      await fs.mkdir(storage);
      if (sharedR2Directory !== undefined) {
        await linkSharedDevelopmentR2(storage, sharedR2Directory);
      }
      await fs.writeFile(path.join(staged, 'retire-previous'), '');
    }
    try {
      await fs.rename(staged, generation);
    } catch (error) {
      if (!isFileError(error, 'EEXIST', 'ENOTEMPTY')) throw error;
    }
  } finally {
    await fs.rm(staged, { recursive: true, force: true });
  }
  const history = await readDevelopmentHistory(generation);
  if (
    history.systemId !== systemId ||
    history.replaced.length !== replaced.length ||
    history.replaced.some((id, index) => id !== replaced[index])
  ) {
    throw new Error('The development System history changed during startup.');
  }
  return history;
}

/** A committed successor fences its predecessor before retiring backend data. Resume an interrupted clean on open. */
async function retirePrevious(
  root: string,
  directory: string,
  revision: number,
) {
  if (revision === 0) return;
  const generation = path.join(directory, String(revision));
  const pending = path.join(generation, 'retire-previous');
  try {
    await fs.stat(pending);
  } catch (error) {
    if (isFileError(error, 'ENOENT')) return;
    throw error;
  }
  await requireStorageDirectory(directory);
  await requireStorageDirectory(generation);
  // Revision zero keeps its Wrangler data directly in the System directory.
  const previousGeneration = path.join(directory, String(revision - 1));
  if (revision > 1) {
    await requireStorageDirectory(previousGeneration).catch(
      (error: unknown) => {
        if (!isFileError(error, 'ENOENT')) throw error;
      },
    );
  }
  const retired =
    revision === 1
      ? (await fs.readdir(root))
          .filter(name => name !== historyDirectoryName)
          .map(name => path.join(root, name))
      : [path.join(previousGeneration, 'storage')];
  for (const entry of retired) {
    await fs.rm(entry, { recursive: true, force: true });
  }
  await fs.rm(pending, { force: true });
}

/** Only an explicit clean selects a new data directory. Ordinary launches adopt the last published history. */
export async function openDevelopmentStorage({
  root,
  systemId,
  clean,
  sharedR2Root,
}: {
  root: string;
  systemId: string;
  clean: boolean;
  sharedR2Root: string | undefined;
}) {
  const directory = path.join(root, historyDirectoryName);
  const readDirectory = async (name: string) => {
    try {
      return await fs.readdir(name);
    } catch (error) {
      if (!isFileError(error, 'ENOENT')) throw error;
      return [];
    }
  };
  const revisions = (await readDirectory(directory))
    .filter(name => /^(0|[1-9]\d*)$/u.test(name))
    .map(Number);
  const revision = revisions.reduce(
    (latest, item) => Math.max(latest, item),
    -1,
  );
  const generation = path.join(directory, String(revision));
  if (revision < 0) {
    if (
      (await readDirectory(root)).some(name => name !== historyDirectoryName)
    ) {
      throw new Error(
        'Local System storage has no recorded development history. Choose a fresh --state-dir to preserve existing state.',
      );
    }
    await fs.mkdir(directory, { recursive: true });
  }
  if (clean || sharedR2Root !== undefined) {
    await requireStorageDirectory(directory);
  }
  if (clean && revision >= 0) {
    await requireStorageDirectory(generation);
  }
  const existingHistory =
    revision < 0 ? undefined : await readDevelopmentHistory(generation);
  if (
    existingHistory !== undefined &&
    (existingHistory.systemId !== systemId ||
      existingHistory.replaced.length !== revision)
  ) {
    throw new Error(
      'The development System history does not match its persistence directory.',
    );
  }
  const sharedR2Directory =
    sharedR2Root === undefined
      ? undefined
      : await resolveSharedDevelopmentR2(root, sharedR2Root);
  let history =
    existingHistory ?? (await publishHistory(directory, undefined, systemId));
  const readStoragePath = async (generation: number) => {
    const persistPath =
      generation === 0
        ? root
        : path.join(directory, String(generation), 'storage');
    if (!(await fs.stat(persistPath)).isDirectory()) {
      throw new Error('Missing development System storage.');
    }
    return persistPath;
  };
  let persistPath = await readStoragePath(history.replaced.length);
  await retirePrevious(root, directory, history.replaced.length);
  if (clean && existingHistory !== undefined) {
    history = await publishHistory(
      directory,
      history,
      systemId,
      sharedR2Directory,
    );
    persistPath = await readStoragePath(history.replaced.length);
  }
  if (sharedR2Directory !== undefined) {
    const physicalRoot = await fs.realpath(root);
    if (
      (await fs.realpath(persistPath)) !==
      path.resolve(physicalRoot, path.relative(root, persistPath))
    ) {
      throw new Error(
        `Cannot attach shared R2 to redirected System storage at ${persistPath}.`,
      );
    }
    await linkSharedDevelopmentR2(persistPath, sharedR2Directory);
  }
  if (clean && existingHistory !== undefined) {
    await retirePrevious(root, directory, history.replaced.length);
  }
  return { history, persistPath };
}
