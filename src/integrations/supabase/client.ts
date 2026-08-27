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
  let sessionRefreshPromise: Promise<string | null> | null = null;

  const isFutureJwtError = async (response: Response) => {
    // PostgREST identifies this failure reliably by code. Depending on the
    // gateway/version, the HTTP status and human message can vary, so neither
    // should prevent the clock-skew recovery from running.
    const body = await response.clone().text();
    return (
      /["']?code["']?\s*:\s*["']PGRST303["']/i.test(body) ||
      /JWT\s+issued(?:\s+at|\s+in\s+the)?\s+future/i.test(body)
    );
  };

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

  const refreshAccessToken = () => {
    if (!sessionRefreshPromise) {
      sessionRefreshPromise = client.auth
        .refreshSession()
        .then(({ data, error }) => {
          if (error) throw error;
          return data.session?.access_token ?? null;
        })
        .catch((error) => {
          console.error('[Supabase] Failed to replace the future-dated JWT.', error);
          return null;
        })
        .finally(() => {
          sessionRefreshPromise = null;
        });
    }

    return sessionRefreshPromise;
  };

  const requestWithAccessToken = (request: Request, accessToken: string) => {
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return new Request(request, { headers });
  };

  const discardInvalidLocalSession = async () => {
    // Keep other devices signed in. This only removes the unusable browser
    // session so the next login can mint a clean token.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.replace('/login?reason=session-clock');
    }
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

    // Replace a persisted/stale token first. Retrying the original Request
    // would keep sending the exact same Authorization header even after
    // refreshSession() updates Supabase's local session.
    const refreshedAccessToken = await refreshAccessToken();
    if (!refreshedAccessToken) {
      await discardInvalidLocalSession();
      return response;
    }

    const retryRequest = requestWithAccessToken(request, refreshedAccessToken);
    response = await fetch(retryRequest.clone());
    if (!await isFutureJwtError(response)) {
      return response;
    }

    // If Auth and PostgREST clocks briefly disagree, wait using the refreshed
    // token's iat and the database clock, then retry exactly once.
    await waitUntilJwtIsValid(retryRequest);
    response = await fetch(retryRequest.clone());
    if (!await isFutureJwtError(response)) {
      return response;
    }

    await discardInvalidLocalSession();
    return response;
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
