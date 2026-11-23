import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import type { IRepoNameUtils } from './makeRepoNameUtils.js';

/** Resolve a Durable Object binding by the same name in either Worker placement. */
export function bindRepoNamespace<
  KEY,
  BINDING extends keyof Cloudflare.IDORepoNamespaces,
>(nameUtils: IRepoNameUtils<KEY>, namespaceBinding: BINDING) {
  return Effect.fn('DORepo.getRepo')(function* (props: { key: KEY }) {
    const name = yield* nameUtils.makeName(props.key);
    const namespaces: {
      [K in keyof Cloudflare.IDORepoNamespaces]: {
        getByName(
          name: string,
        ): ReturnType<Cloudflare.IDORepoNamespaces[K]['getByName']>;
      };
    } = env;
    return namespaces[namespaceBinding].getByName(name);
  });
}
