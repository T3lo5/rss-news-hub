import { Readable } from 'node:stream';
import { handleRequest } from '../../server.js';

export interface TestResponse {
  status: number;
  json: any;
  raw: string;
  headers: Record<string, string>;
}

// Every call gets a unique fake client IP so in-memory rate limiters never
// leak state between tests. Pass `x-forwarded-for` explicitly to simulate a
// single client hammering an endpoint.
let requestSeq = 0;

/**
 * Drive the real HTTP request pipeline (body parsing, auth middleware and
 * route dispatch) with mock req/res objects, without opening a socket.
 */
export function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<TestResponse> {
  const payload = body === undefined ? '' : JSON.stringify(body);

  const req: any = Readable.from(payload ? [Buffer.from(payload)] : []);
  req.method = method;
  req.url = path;
  req.headers = {
    host: 'localhost:3000',
    'content-type': 'application/json',
    'x-forwarded-for': `test-client-${++requestSeq}`,
    ...(payload ? { 'content-length': String(Buffer.byteLength(payload)) } : {}),
    ...headers,
  };

  let settle!: () => void;
  const responded = new Promise<void>((resolve) => (settle = resolve));

  const res: any = {
    statusCode: 200,
    headers: {},
    raw: '',
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = String(value);
    },
    writeHead(status: number, responseHeaders?: Record<string, string>) {
      this.statusCode = status;
      if (responseHeaders) Object.assign(this.headers, responseHeaders);
    },
    write(chunk: string) {
      this.raw += String(chunk);
    },
    end(chunk?: string) {
      if (chunk !== undefined) this.raw += String(chunk);
      settle();
    },
  };

  // Handlers run detached from handleRequest (validateBody does not await
  // next()), so wait for res.end rather than for handleRequest to resolve.
  const timer = setTimeout(() => {
    settle();
  }, 10_000);

  return (async () => {
    try {
      await Promise.all([handleRequest(req, res), responded.then(() => undefined)]);
      if (!res.raw) {
        throw new Error(`No response received for ${method} ${path} (waited 10s)`);
      }
      let json: any = null;
      try {
        json = JSON.parse(res.raw);
      } catch {
        // Non-JSON response (should not happen on auth routes)
      }
      return { status: res.statusCode, json, raw: res.raw, headers: res.headers };
    } finally {
      clearTimeout(timer);
    }
  })();
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
