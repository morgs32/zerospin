declare module 'cloudflare:workers' {
  export const env: {
    AGGREGATE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').AggregateChain
    >;
    SERVICE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('@zerospin/system-worker').ServiceChain
    >;
    SYSTEM_REPO: DurableObjectNamespace<
      import('@zerospin/system-worker').SystemRepo
    >;
    ZEROSPIN_VERSION_METADATA: { id: string };
    ZEROSPIN_OWNER_RELEASE?: unknown;
    ZEROSPIN_DEPLOYMENT_BOOTSTRAP?: boolean;
    ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
    ZEROSPIN_PUBLISHABLE_KEY: string;
    ZEROSPIN_SECRET_KEY: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
    ZEROSPIN_SYSTEM_NAME?: string;
    ZEROSPIN_SYSTEM_SPEC_HASH?: string;
    ZEROSPIN_STORAGE_LAYOUT?: string;
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
