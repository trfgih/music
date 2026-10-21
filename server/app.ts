import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { createMusicMiddleware } from './musicProxy.js';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function createApp(distDirectory: string) {
  const root = resolve(distDirectory);
  const music = createMusicMiddleware();
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        await music(req, res, () => {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Адрес не найден.' }));
        });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : 'ok');
        return;
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      const file = resolve(root, `.${pathname}`);
      const relativeFile = relative(root, file);
      if (relativeFile.startsWith('..') || isAbsolute(relativeFile) || pathname.includes('\0')) {
        res.writeHead(404);
        res.end();
        return;
      }
      let target = file;
      try {
        if (!(await stat(file)).isFile()) target = resolve(root, 'index.html');
      } catch {
        if (extname(pathname)) {
          res.writeHead(404);
          res.end();
          return;
        }
        target = resolve(root, 'index.html');
      }
      const body = await readFile(target);
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(target)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}
