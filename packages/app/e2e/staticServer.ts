import { createServer } from 'node:http';
import type { Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * A static server for `dist/`, owned by the test rather than by Playwright.
 *
 * The offline test needs to *stop* the server mid-run, which is impossible
 * with Playwright's managed `webServer`. Killing the server is also a more
 * faithful cut than `context.setOffline`, which in Chromium fails the request
 * below the service worker: the worker never gets the chance to serve, so the
 * emulated version tests nothing about the PWA.
 */
export function startStaticServer(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    void serve(request.url ?? '/', response);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export function stopStaticServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    // Without this the browser's keep-alive sockets hold the close open.
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function serve(url: string, response: ServerResponse): Promise<void> {
  const requested = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relative = normalize(requested).replace(/^[\\/]+/, '');

  // Never serve outside dist/, whatever the request says.
  const candidate = join(DIST, relative === '' ? 'index.html' : relative);
  if (!candidate.startsWith(DIST.replaceAll('/', sep))) {
    response.writeHead(403).end();
    return;
  }

  const body = await readFile(candidate).catch(() => undefined);
  if (body) {
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(candidate)] ?? 'application/octet-stream' });
    response.end(body);
    return;
  }

  // Single-page app: a navigation to an unknown path still gets the shell.
  if (extname(candidate) === '') {
    const shell = await readFile(join(DIST, 'index.html')).catch(() => undefined);
    if (shell) {
      response.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] as string });
      response.end(shell);
      return;
    }
  }

  response.writeHead(404).end();
}
