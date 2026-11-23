import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { runWranglerCommand } from './runWranglerCommand.js';

const Credentials = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(['api_token', 'oauth']),
    token: Schema.NonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal('api_key'),
    key: Schema.NonEmptyString,
    email: Schema.NonEmptyString,
  }),
]);
const Envelope = Schema.Struct({
  success: Schema.Boolean,
  result: Schema.Unknown,
  errors: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          code: Schema.Number,
          message: Schema.optionalKey(Schema.String),
        }),
      ),
    ),
  ),
  result_info: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        page: Schema.optionalKey(Schema.Number),
        total_pages: Schema.optionalKey(Schema.Number),
      }),
    ),
  ),
});
const WorkerCatalog = Schema.Array(Schema.Struct({ name: Schema.String }));
const Subdomain = Schema.Struct({
  enabled: Schema.Boolean,
  previews_enabled: Schema.Boolean,
});

export const openDeploymentCloudflare = Effect.fn('openDeploymentCloudflare')(
  function* (workspace: IWranglerDeploymentWorkspace, accountId: string) {
    const authError = () =>
      makeZerospinError({
        code: 'zerospin-cloudflare-auth-unavailable',
        message:
          'Could not read Cloudflare credentials from Wrangler. Run wrangler login or set CLOUDFLARE_API_TOKEN.',
      });
    const { stdout } = yield* runWranglerCommand(
      workspace,
      ['auth', 'token', '--json'],
      { sensitiveOutput: true },
    ).pipe(Effect.mapError(authError));
    const credentials = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Credentials)(JSON.parse(stdout)),
      catch: authError,
    });
    const workerName = workspace.project.generatedConfig.name;
    const workersUrl =
      'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers';
    const scriptPath = '/scripts/' + workerName;

    async function request(path: string, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      if (credentials.type === 'api_key') {
        headers.set('X-Auth-Key', credentials.key);
        headers.set('X-Auth-Email', credentials.email);
      } else {
        headers.set('Authorization', 'Bearer ' + credentials.token);
      }
      const response = await fetch(workersUrl + path, {
        ...init,
        headers,
        redirect: 'error',
        signal: init?.signal
          ? globalThis.AbortSignal.any([
              init.signal,
              globalThis.AbortSignal.timeout(25_000),
            ])
          : globalThis.AbortSignal.timeout(25_000),
      });
      const envelope = Schema.decodeUnknownSync(Envelope)(
        await response.json(),
      );
      return {
        ...envelope,
        status: response.status,
        ok: response.ok && envelope.success,
      };
    }

    const subdomainHeaders = {
      'Cloudflare-Workers-Script-Api-Date': '2025-08-01',
    };
    async function readIngress(signal: AbortSignal) {
      const response = await request(scriptPath + '/subdomain', {
        headers: subdomainHeaders,
        signal,
      });
      if (!response.ok) {
        throw new Error('Cloudflare could not read ingress settings.');
      }
      return Schema.decodeUnknownSync(Subdomain)(response.result);
    }

    return {
      async isWorkerAbsent(signal: AbortSignal) {
        const settings = await request(scriptPath + '/settings', { signal });
        if (settings.ok) return false;
        if (
          settings.status !== 404 ||
          !settings.errors?.some(error => error.code === 10007)
        ) {
          throw new Error(
            'Cloudflare could not verify Worker settings (HTTP ' +
              settings.status +
              ').',
          );
        }
        const perPage = 100;
        for (let page = 1; ; page++) {
          const result = await request(
            '/workers?page=' + page + '&per_page=' + perPage,
            { signal },
          );
          if (!result.ok) {
            throw new Error('Cloudflare did not return the Worker catalog.');
          }
          const workers = Schema.decodeUnknownSync(WorkerCatalog)(
            result.result,
          );
          if (workers.some(worker => worker.name === workerName)) return false;
          const pagination = result.result_info;
          if (pagination?.page !== undefined && pagination.page !== page) {
            throw new Error(
              'Cloudflare returned an unexpected Worker catalog page.',
            );
          }
          if (
            pagination?.total_pages === undefined
              ? workers.length < perPage
              : page >= pagination.total_pages
          ) {
            return true;
          }
          if (pagination?.page === undefined || workers.length === 0) {
            throw new Error(
              'Cloudflare returned incomplete Worker catalog pagination.',
            );
          }
        }
      },
      async putInitialVersion(
        artifact: { body: Uint8Array<ArrayBuffer>; contentType: string },
        signal: AbortSignal,
      ) {
        const response = await request(
          scriptPath + '?bindings_inherit=strict',
          {
            method: 'PUT',
            headers: { 'Content-Type': artifact.contentType },
            body: artifact.body,
            signal,
          },
        );
        if (response.ok) return;
        const codes = response.errors?.map(error => error.code).join(', ');
        const reason =
          'Cloudflare returned HTTP ' +
          response.status +
          (codes ? ' (' + codes + ')' : '') +
          '.';
        if (
          [400, 401, 403, 422].includes(response.status) &&
          !response.success &&
          codes
        ) {
          return reason;
        }
        throw new Error(reason);
      },
      readIngress,
      async closeBootstrapIngress(signal: AbortSignal) {
        const { enabled, previews_enabled } = await readIngress(signal);
        if (!enabled && !previews_enabled) return;
        const after = await request(scriptPath + '/subdomain', {
          method: 'POST',
          headers: { ...subdomainHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false, previews_enabled: false }),
          signal,
        });
        if (!after.ok) {
          throw new Error('Cloudflare could not close bootstrap ingress.');
        }
        const closed = Schema.decodeUnknownSync(Subdomain)(after.result);
        if (closed.enabled || closed.previews_enabled) {
          throw new Error('Cloudflare still reports public bootstrap ingress.');
        }
      },
    };
  },
);
