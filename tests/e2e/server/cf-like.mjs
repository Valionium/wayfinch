// A loopback server that answers like the live host (qa/offline-redirect.cjs's rules, checked on the live site):
// /index.html → 307 /, /tools/bags/index.html and /tools/bags → 307 /tools/bags/ when that page exists, a missing
// file → a real 404, _headers honoured and never served, HTML compressed with an ETag.
// `swap(dir)` is a deploy. `down(true)` is a phone with no signal: every connection is cut, for the worker's own
// fetches too, which browser offline emulation does not reliably reach.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSED = new Set(['.html', '.js', '.json', '.txt']);

function parseHeaders(dir) {
  const file = join(dir, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (/^\s/.test(line)) {
      const at = line.indexOf(':');
      current.headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    } else {
      current = { path: line.trim(), headers: {} };
      rules.push(current);
    }
  }
  return rules;
}

const pathMatches = (rule, path) => (rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : rule === path);

export async function startCfLike({ dir }) {
  let root = dir;
  let isDown = false;
  const requests = new Map(); // "METHOD path" -> count
  const failures = new Map(); // path -> { left, status }
  const holds = new Map(); // path -> Promise that releases the answer
  const redirects = new Map(); // path -> where it redirects, on top of the host's own rules

  const fileFor = (path) => {
    const relative = normalize(path === '/' || path.endsWith('/') ? `${path}index.html` : path).replace(/^[/\\]+/, '');
    if (relative.startsWith('..') || relative.split(sep).includes('_headers')) return null;
    const full = join(root, relative);
    return existsSync(full) && statSync(full).isFile() ? full : null;
  };

  const server = createServer(async (req, res) => {
    if (isDown) {
      req.socket.destroy();
      return;
    }
    const path = decodeURI(new URL(req.url, 'http://x').pathname);
    const key = `${req.method} ${path}`;
    requests.set(key, (requests.get(key) ?? 0) + 1);

    const failure = failures.get(path);
    if (failure && failure.left > 0) {
      failure.left -= 1;
      res.writeHead(failure.status, { 'content-type': 'text/plain' });
      res.end('failed on purpose');
      return;
    }
    if (holds.has(path)) await holds.get(path);

    const redirect = (to) => {
      res.writeHead(307, { Location: to });
      res.end();
    };
    if (redirects.has(path)) return redirect(redirects.get(path));
    if (path === '/index.html') return redirect('/');
    if ((path === '/tools/bags/index.html' || path === '/tools/bags') && fileFor('/tools/bags/')) return redirect('/tools/bags/');
    if (path.endsWith('/index.html') || path === '/_headers') {
      res.writeHead(404);
      res.end();
      return;
    }

    const file = fileFor(path);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const ext = extname(file);
    const headers = {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=0, must-revalidate', // the host's default
    };
    for (const rule of parseHeaders(root)) if (pathMatches(rule.path, path)) Object.assign(headers, rule.headers);
    let body = readFileSync(file);
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    headers.etag = etag;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    if (COMPRESSED.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      body = gzipSync(body);
      headers['content-encoding'] = 'gzip';
      headers.vary = 'Accept-Encoding';
    }
    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://localhost:${server.address().port}`;
  return {
    origin,
    /** A deploy: from now on the server answers from this folder. */
    swap(next) {
      root = next;
    },
    /** No signal: every connection is cut. */
    down(value) {
      isDown = value;
      if (value) server.closeAllConnections();
    },
    /** The next `times` requests for `path` answer `status`. */
    failNext(path, times = 1, status = 500) {
      failures.set(path, { left: times, status });
    },
    /** Answers for `path` wait until the returned function is called. */
    hold(path) {
      let release;
      holds.set(path, new Promise((resolve) => { release = resolve; }));
      return () => {
        holds.delete(path);
        release();
      };
    },
    /** From now on `path` answers 307 to `to`, as a host change could. */
    redirect(path, to) {
      redirects.set(path, to);
    },
    /** How many requests reached the server. */
    count(method, path) {
      return requests.get(`${method} ${path}`) ?? 0;
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
