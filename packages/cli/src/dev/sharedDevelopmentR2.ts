import fs from 'node:fs/promises';
import path from 'node:path';

function contains(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function checkOverlap(
  systemRoot: string,
  wranglerRoot: string,
  r2Directory: string,
) {
  if (
    contains(systemRoot, wranglerRoot) ||
    contains(systemRoot, r2Directory) ||
    contains(r2Directory, systemRoot)
  ) {
    throw new Error(
      'The shared Wrangler persistence and R2 directories must be outside the System storage directory.',
    );
  }
}

export async function resolveSharedDevelopmentR2(
  systemRoot: string,
  wranglerRoot: string,
): Promise<string> {
  const r2Directory = path.join(wranglerRoot, 'v3', 'r2');
  checkOverlap(systemRoot, wranglerRoot, r2Directory);
  await fs.mkdir(r2Directory, { recursive: true });
  const [resolvedSystemRoot, resolvedWranglerRoot, resolvedR2Directory] =
    await Promise.all([
      fs.realpath(systemRoot),
      fs.realpath(wranglerRoot),
      fs.realpath(r2Directory),
    ]);
  checkOverlap(resolvedSystemRoot, resolvedWranglerRoot, resolvedR2Directory);
  return resolvedR2Directory;
}

export async function linkSharedDevelopmentR2(
  persistPath: string,
  r2Directory: string,
): Promise<void> {
  const versionDirectory = path.join(persistPath, 'v3');
  const link = path.join(versionDirectory, 'r2');
  await fs.mkdir(versionDirectory, { recursive: true });
  if (!(await fs.lstat(versionDirectory)).isDirectory()) {
    throw new Error(
      `Wrangler state must be a directory at ${versionDirectory}.`,
    );
  }
  try {
    await fs.symlink(r2Directory, link, 'junction');
  } catch (error) {
    if (
      !(error instanceof Error && 'code' in error && error.code === 'EEXIST')
    ) {
      throw error;
    }
    if (
      !(await fs.lstat(link)).isSymbolicLink() ||
      (await fs.realpath(link)) !== r2Directory
    ) {
      throw new Error(
        `Cannot share R2 without replacing existing state at ${link}.`,
      );
    }
  }
}
