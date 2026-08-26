import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseClient() {
  // Browser bundles must only read VITE_* values. Referencing `process.env`
  // here crashes in deployments where Vite did not inject the public config.
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['VITE_SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['VITE_SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Configure them in the deployment environment.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  let client: ReturnType<typeof createClient<Database>>;
  let jwtRecoveryPromise: Promise<void> | null = null;

  const isFutureJwtError = async (response: Response) =>
    response.status === 401 && /JWT issued at future/i.test(await response.clone().text());

  const getJwtIssuedAt = (request: Request) => {
    const authorization = request.headers.get('authorization');
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const payload = token?.split('.')[1];
    if (!payload) return null;

    try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const issuedAt = JSON.parse(atob(padded))?.iat;
      return typeof issuedAt === 'number' ? issuedAt * 1_000 : null;
    } catch {
      return null;
    }
  };

  const getDatabaseTime = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_server_epoch_ms`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!response.ok) return null;
      const value = Number(await response.json());
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };

  const waitUntilJwtIsValid = (request: Request) => {
    if (!jwtRecoveryPromise) {
      jwtRecoveryPromise = (async () => {
        const issuedAt = getJwtIssuedAt(request);
        const databaseTime = await getDatabaseTime();
        const clockDelay = issuedAt && databaseTime
          ? issuedAt - databaseTime + 2_000
          : 30_000;
        const delay = Math.min(Math.max(clockDelay, 2_000), 10 * 60_000);

        console.warn(`[Supabase] Waiting ${Math.ceil(delay / 1_000)}s for the database clock to accept the JWT.`);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      })()
        .finally(() => {
          jwtRecoveryPromise = null;
        });
    }

    return jwtRecoveryPromise;
  };

  const fetchWithJwtRecovery: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    let response = await fetch(request.clone());

    if (!request.url.includes('/rest/v1/')) {
      return response;
    }

    if (!await isFutureJwtError(response)) {
      return response;
    }

    // Auth and PostgREST can briefly disagree about the current time. Use the
    // server's Date header and the token's iat instead of an arbitrary delay.
    await waitUntilJwtIsValid(request);
    response = await fetch(request.clone());
    if (!await isFutureJwtError(response)) {
      return response;
    }

    // Recalculate once in case a proxy returned a stale Date header. Refreshing
    // here would mint another future-dated token and restart the problem.
    await waitUntilJwtIsValid(request);
    return fetch(request.clone());
  };

  const options: any = {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: { 'x-application-name': 'gestao-nobre' },
      fetch: fetchWithJwtRecovery,
    },
    db: {
      retries: 3,
    }
  };

  client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options);
  return client;
}

export const supabase = createSupabaseClient();
