import { makeZerospinError } from '@zerospin/error';

/** The resolved script URL and the running worker location identify one executable. */
export function assertWorkerArtifact(
  artifactUrl: string,
  ready: { artifactUrl: string },
) {
  if (artifactUrl !== ready.artifactUrl) {
    throw makeZerospinError('node-worker-artifact-mismatch');
  }
}
