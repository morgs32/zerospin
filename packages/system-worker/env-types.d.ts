/**
 * Bindings-only `Cloudflare.Env` augmentation maintained alongside
 * `system-worker/wrangler.jsonc`. Admin and other downstream packages can
 * reference it without pulling in the generated runtime declarations, which
 * would collide on `declare class DOMException` and other globals with the
 * consumer's own worker-configuration.d.ts.
 *
 * `wrangler types` runs with `--include-env=false`; when the Wrangler binding
 * configuration changes, update the non-namespace fields here and
 * system IDORepoNamespaces in src/SystemRepo/registerRepo/systemRepoNamespaces.ts.
 */
declare namespace Cloudflare {
  interface Env extends IDORepoNamespaces {
    ZEROSPIN_SERVICE_AGENT_NOTIFY?: {
      serviceHistoryAdvanced(serviceIndex: number): Promise<void>;
    };
    /** The platform binds this issuer to one Service release in one Instance. */
    ZEROSPIN_HOSTED_RELEASE_RPC?: {
      getReleaseRpc(): Promise<
        Disposable & {
          registerRepo(
            registration: import('@zerospin/core/system/types').IRepoRegistration & {
              repoType:
                | 'ServiceVersionRepo'
                | 'ServiceVersionChain'
                | 'ServiceVersionArchive';
            },
          ): Promise<
            import('@zerospin/logger').IRpcEnvelope<
              void,
              import('@zerospin/error').IZerospinErrorJson
            >
          >;
          executeCommandsThrough(
            serviceIndex: number,
          ): ReturnType<
            import('./src/ServiceChain/ServiceChain.js').ServiceChain['executeCommandsThrough']
          >;
          prepareServiceReplayInput(
            serviceIndex: number,
            commandId: string,
          ): ReturnType<
            import('./src/ServiceChain/ServiceChain.js').ServiceChain['prepareServiceReplayInput']
          >;
          readReplayPage(
            afterIndex: number,
            maxIndex?: number,
          ): ReturnType<
            import('./src/ServiceChain/ServiceChain.js').ServiceChain['replayCommandsFanout']['getPage']
          >;
        }
      >;
    };
    ZEROSPIN_DEV_STARTUP_SPEC_HASH?: string;
    ZEROSPIN_SYSTEM_NAME?: string;
    ZEROSPIN_SYSTEM_SPEC_HASH?: string;
    ZEROSPIN_DEPLOYMENT_BOOTSTRAP?: boolean;
    ZEROSPIN_STORAGE_LAYOUT?: string;
    ZEROSPIN_TELEMETRY?: unknown;
    ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
    ZEROSPIN_LOCAL_DEVELOPMENT?: 'true';
    ZEROSPIN_DEV_HISTORY?: string;
    ZEROSPIN_PUBLISHABLE_KEY?: string;
    ZEROSPIN_SECRET_KEY?: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
    ZEROSPIN_VERSION_METADATA?: { id: string };
  }
}
