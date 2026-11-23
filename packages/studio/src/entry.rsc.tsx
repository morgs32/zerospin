import { renderToReadableStream } from '@vitejs/plugin-rsc/rsc/server';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { SystemDiagrams } from '@zerospin/system-diagrams';
import '@zerospin/system-diagrams/styles.css';
import * as Schema from 'effect/Schema';
import serializedSystemSpec from 'virtual:zerospin-studio-system-spec';

import './styles.css';

const systemSpec = Schema.decodeUnknownSync(
  Schema.fromJsonString(SystemSpecSchema),
)(serializedSystemSpec);

function StudioDocument(props: { sectionId: string | undefined }) {
  const { sectionId } = props;
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`${systemSpec.systemName} · Zerospin Declaration Board`}</title>
        {import.meta.viteRsc.loadCss()}
      </head>
      <body>
        <SystemDiagrams
          systemSpec={systemSpec}
          navigation={{ sectionId, basePath: '' }}
        />
      </body>
    </html>
  );
}

export default async function handleStudioRequest(request: Request) {
  const url = new URL(request.url);
  if (request.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  const isRsc = url.pathname === '/index.rsc';
  const pathname = isRsc
    ? (url.searchParams.get('pathname') ?? '/')
    : url.pathname;
  let sectionId: string | undefined;
  if (pathname === '/') {
    const aggregate = Object.keys(systemSpec.aggregates).sort((left, right) =>
      left.localeCompare(right),
    )[0];
    const service = Object.keys(systemSpec.services).sort((left, right) =>
      left.localeCompare(right),
    )[0];
    const firstPage =
      aggregate !== undefined
        ? `/aggregates/${encodeURIComponent(aggregate)}`
        : service !== undefined
          ? `/services/${encodeURIComponent(service)}`
          : undefined;
    if (firstPage !== undefined) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: isRsc
            ? `/index.rsc?pathname=${encodeURIComponent(firstPage)}`
            : firstPage,
        },
      });
    }
  } else {
    const route = /^\/(aggregates|services)\/([^/]+)$/.exec(pathname);
    if (!route) return new Response('Not found', { status: 404 });
    const group = route[1];
    const encodedName = route[2];
    if (encodedName === undefined)
      return new Response('Not found', { status: 404 });
    let name: string;
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      return new Response('Invalid page name', { status: 400 });
    }
    const owners =
      group === 'aggregates' ? systemSpec.aggregates : systemSpec.services;
    if (!Object.hasOwn(owners, name))
      return new Response('Not found', { status: 404 });
    sectionId = `system-board-${group === 'aggregates' ? 'aggregate' : 'service'}-${encodeURIComponent(name)}`;
  }

  if (isRsc) {
    const rscStream = renderToReadableStream(
      <StudioDocument sectionId={sectionId} />,
    );
    return new Response(rscStream, {
      headers: { 'Content-Type': 'text/x-component;charset=utf-8' },
    });
  }

  const { makeStudioHtml } = await import.meta.viteRsc.loadModule<
    typeof import('./entry.ssr.js')
  >('ssr', 'index');
  return new Response(makeStudioHtml(), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}
