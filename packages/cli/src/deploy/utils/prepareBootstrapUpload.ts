import fs from 'node:fs/promises';
import path from 'node:path';

import { configureAgentPlacement } from '@zerospin/dev-worker/makeWranglerConfig';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { runWranglerCommand } from './runWranglerCommand.js';

const BootstrapUploadMetadataSchema = Schema.Struct({
  annotations: Schema.Struct({ 'workers/tag': Schema.String }),
  bindings: Schema.Array(
    Schema.Struct({ name: Schema.String, type: Schema.String }),
  ),
});

/** Compile the ingress-closed Worker without sending any Cloudflare writes. */
export const prepareBootstrapUpload = makeFn('prepareBootstrapUpload')(
  function* (workspace: IWranglerDeploymentWorkspace) {
    const { runId } = workspace;
    const configPath = path.join(workspace.directory, 'bootstrap.json');
    const outfile = path.join(workspace.directory, 'bootstrap.multipart');
    const config = configureAgentPlacement(
      workspace.project.generatedConfig,
      'bootstrap',
    );
    yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          fs.writeFile(
            configPath,
            JSON.stringify({
              ...config,
              workers_dev: false,
              preview_urls: false,
              vars: {
                ...config.vars,
                ZEROSPIN_DEPLOYMENT_BOOTSTRAP: true,
              },
            }),
            { mode: 0o600 },
          ),
          fs.writeFile(outfile, '', { mode: 0o600 }),
        ]),
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-bootstrap-files-write-failed',
          message: 'Failed to prepare the local bootstrap upload files.',
          cause: prettyUnknownFailure(cause),
        }),
    });
    yield* runWranglerCommand(
      {
        ...workspace,
        configPath,
        environment: {
          ...workspace.environment,
          WRANGLER_SEND_METRICS: 'false',
        },
      },
      [
        'deploy',
        '--dry-run',
        '--outfile',
        outfile,
        '--secrets-file',
        workspace.secretsPath,
        '--tag',
        runId,
      ],
    );

    const upload = yield* Effect.tryPromise({
      try: async () => {
        const file = await fs.readFile(outfile);
        const endOfLine = file.subarray(0, 74).indexOf('\r\n');
        if (endOfLine === -1) throw new Error('Missing multipart boundary');
        const boundary = /^--([A-Za-z0-9-]{1,70})$/.exec(
          file.subarray(0, endOfLine).toString('ascii'),
        )?.[1];
        if (!boundary) throw new Error('Invalid multipart boundary');
        const contentType = `multipart/form-data; boundary=${boundary}`;
        const body = new Uint8Array(file);
        const form = await new Response(body, {
          headers: { 'Content-Type': contentType },
        }).formData();
        const metadataPart = form.get('metadata');
        if (typeof metadataPart !== 'string') {
          throw new Error('Missing Wrangler upload metadata');
        }
        const metadata = Schema.decodeUnknownSync(
          BootstrapUploadMetadataSchema,
        )(JSON.parse(metadataPart));
        if (metadata.annotations['workers/tag'] !== runId) {
          throw new Error('Missing bootstrap version tag');
        }
        return { body, contentType, bindings: metadata.bindings };
      },
      // Parsing failures can contain excerpts of the metadata's secret values.
      catch: () =>
        makeZerospinError({
          code: 'zerospin-bootstrap-upload-invalid',
          message:
            'Wrangler did not produce a tagged multipart bootstrap upload.',
        }),
    });
    const inheritedBindings = upload.bindings
      .filter(binding => binding.type === 'inherit')
      .map(binding => binding.name);
    if (inheritedBindings.length > 0) {
      return yield* makeZerospinError({
        code: 'zerospin-bootstrap-inherited-bindings',
        message: `Provide explicit resource IDs or names for bootstrap bindings ${inheritedBindings.join(', ')}. A new Worker cannot inherit them.`,
      });
    }
    return { body: upload.body, contentType: upload.contentType };
  },
);
