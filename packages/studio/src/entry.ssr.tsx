import { getClientEntryUrl } from '@vitejs/plugin-rsc/ssr';

export function makeStudioHtml() {
  const clientEntryUrl = getClientEntryUrl()
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zerospin Studio</title>
  </head>
  <body>
    <p role="status">Loading Studio…</p>
    <script type="module" src="${clientEntryUrl}"></script>
  </body>
</html>`;
}
