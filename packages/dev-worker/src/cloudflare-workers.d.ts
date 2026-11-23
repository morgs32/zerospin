declare module 'cloudflare:workers' {
  export const env: {
    AGGREGATE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateChain
    >;
    SERVICE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('@zerospin/system-worker').ServiceChain
    >;
    AGGREGATE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateActorVersionChain
    >;
    AGGREGATE_AGENT_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateAgentVersionChain
    >;
    SERVICE_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').ServiceVersionChain
    >;
    SERVICE_ACTOR_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').ServiceActorVersionRepo
    >;
    SERVICE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').ServiceActorVersionChain
    >;
    AGGREGATE_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateVersionChain
    >;
    AGGREGATE_ACTOR_VERSION_ARCHIVE: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateActorVersionArchive
    >;
    AGGREGATE_VERSION_ARCHIVE: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateVersionArchive
    >;
    AGGREGATE_ACTOR_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateActorVersionRepo
    >;
    AGGREGATE_AGENT_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateAgentVersionRepo
    >;
    SERVICE_AGENT_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').ServiceAgentVersionRepo
    >;
    SERVICE_AGENT_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').ServiceAgentVersionChain
    >;
    SERVICE_ACTOR_VERSION_ARCHIVE: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').ServiceActorVersionArchive
    >;
    SERVICE_VERSION_ARCHIVE: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').ServiceVersionArchive
    >;
    SYSTEM_REPO: DurableObjectNamespace<
      import('@zerospin/system-worker').SystemRepo
    >;
    ZEROSPIN_ENVIRONMENT: 'dev';
    ZEROSPIN_PUBLISHABLE_KEY: string;
    ZEROSPIN_SECRET_KEY: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
  };

  export class WorkerEntrypoint {
    fetch(request: Request): Promise<Response>;
  }

  export class DurableObject<Env = Cloudflare.Env> {
    protected ctx: DurableObjectState;
    protected env: Env;

    constructor(ctx: DurableObjectState, env: Env);

    fetch(request: Request): Promise<Response>;
  }
}
