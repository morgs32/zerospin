import {
  getOwnerReleaseBindingName,
  OwnerReleaseSchema,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

import { bindRepoNamespace } from '../makeDORepo/bindRepoNamespace.js';
import type { IRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

import type { IOwnerReleaseWorkerBinding } from './ownerReleaseWorkerBindings.js';

const decodeRelease = Schema.decodeUnknownOption(OwnerReleaseSchema);

/** Find the exact owner release before looking up an object by its canonical name. */
export function bindReleaseRepoNamespace<
  KEY extends IOwnerRelease,
  BINDING extends keyof Cloudflare.IDORepoNamespaces,
>(
  nameUtils: IRepoNameUtils<KEY>,
  namespace: BINDING,
  open: (
    binding: IOwnerReleaseWorkerBinding,
    key: KEY,
  ) => Promise<ReturnType<Cloudflare.IDORepoNamespaces[BINDING]['getByName']>>,
  openHosted?: (
    key: KEY,
  ) =>
    | Promise<ReturnType<Cloudflare.IDORepoNamespaces[BINDING]['getByName']>>
    | undefined,
) {
  return bindReleaseRepo(
    namespace,
    bindRepoNamespace(nameUtils, namespace),
    (bindingName, key) => {
      const worker = env[bindingName];
      return worker === undefined ? undefined : open(worker, key);
    },
    openHosted,
  );
}

/** Resolve the exact release using the handles supplied by the caller's wiring. */
export function bindReleaseRepo<KEY extends IOwnerRelease, REPO, E>(
  namespace: keyof Cloudflare.IDORepoNamespaces,
  openLocal: (props: { key: KEY }) => Effect.Effect<REPO, E>,
  openWorker: (
    bindingName: ReturnType<typeof getOwnerReleaseBindingName>,
    key: KEY,
  ) => Promise<REPO> | undefined,
  openHosted?: (key: KEY) => Promise<REPO> | undefined,
) {
  return Effect.fn('getReleaseRepo')(function* (props: { key: KEY }) {
    const { key } = props;
    const bindingName = getOwnerReleaseBindingName(key);
    const localRelease: unknown = Reflect.get(env, 'ZEROSPIN_OWNER_RELEASE');
    const localIdentity = decodeRelease(localRelease);
    if (
      env[namespace] !== undefined &&
      (localRelease === undefined ||
        (Option.isSome(localIdentity) &&
          getOwnerReleaseBindingName(localIdentity.value) === bindingName))
    ) {
      return yield* openLocal(props);
    }
    const remote = openHosted?.(key) ?? openWorker(bindingName, key);
    if (remote === undefined) {
      return yield* Effect.die(
        new Error('Missing owner release binding ' + bindingName),
      );
    }
    return yield* Effect.promise(() => remote);
  });
}
