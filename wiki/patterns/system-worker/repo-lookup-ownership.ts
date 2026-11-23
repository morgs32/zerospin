import type { Effect } from 'effect';

/**
 * Keep physical Repo identity in its name codec. A Worker resolves a namespace
 * with the codec and getByName. The factory's static getRepo uses that same lookup.
 * Use the binding lookup when a caller needs a Repo in a different Worker package.
 * getServiceVersionRepo resolves the registered release binding when the local
 * ServiceVersionRepo namespace is absent. Pass that same lookup to replay fanout.
 *
 * @bad Import a release Worker implementation from AggregateChain or ServiceChain.
 * @bad Put namespace lookup in migratableDORepoConfig.
 * @bad Read a namespace while defining the class, or run readiness or authorization during lookup.
 */
export const lookup = getServiceVersionRepo({
  key: { systemId: 'sys_1', serviceName: 'catalog', serviceVersion: 1 },
});

export const queueLookup = getServiceVersionRepo;

declare function getServiceVersionRepo(props: {
  key: { systemId: string; serviceName: string; serviceVersion: number };
}): Effect.Effect<unknown>;
