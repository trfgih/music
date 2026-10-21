// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';

describe('production web server', () => {
  let directory: string;
  let server: ReturnType<typeof createApp>;
  let port: number;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'melodia-server-'));
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'index.html'), '<h1>Melodia</h1>');
    await writeFile(join(directory, 'assets/app-test.js'), 'console.log("Melodia")');
    server = createApp(directory);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  });

  function get(path: string, method = 'GET') {
    return new Promise<{
      status: number;
      headers: import('node:http').IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('serves the app and client routes, but returns 404 for missing assets', async () => {
    expect((await get('/')).body).toContain('Melodia');
    expect((await get('/favorites')).body).toContain('Melodia');
    const asset = await get('/assets/app-test.js');
    expect(asset.headers['content-type']).toContain('javascript');
    expect(asset.headers['cache-control']).toContain('immutable');
    expect((await get('/assets/missing.js')).status).toBe(404);
  });

  it('supports health checks and HEAD without sending a response body', async () => {
    expect((await get('/healthz')).body).toBe('ok');
    expect((await get('/', 'HEAD')).body).toBe('');
    expect((await get('/', 'HEAD')).headers['content-length']).toBe('16');
    expect((await get('/', 'POST')).status).toBe(405);
  });

  it('keeps API requests separate from the app and rejects invalid paths', async () => {
    expect((await get('/api/unknown')).status).toBe(404);
    expect((await get('/api/music')).status).toBe(400);
    expect((await get('/api/music?term=music', 'POST')).status).toBe(405);
    expect((await get('/..%2fpackage.json')).status).toBe(404);
    expect((await get('/%invalid')).status).toBe(400);
  });

  it('routes Apple searches through the deployed server', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ resultCount: 1, results: [{ trackId: 123, trackName: 'Song' }] }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const response = await get('/api/music?term=hello');
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).source).toBe('itunes');
    expect(String(upstream.mock.calls[0][0])).toContain('itunes.apple.com/search');
  });
});
