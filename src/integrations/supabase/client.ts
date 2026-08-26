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
  let refreshPromise: Promise<string | null> | null = null;

  const isFutureJwtError = async (response: Response) =>
    response.status === 401 && /JWT issued at future/i.test(await response.clone().text());

  const fetchWithJwtRecovery: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    let response = await fetch(request.clone());

    if (!request.url.includes('/rest/v1/')) {
      return response;
    }

    if (!await isFutureJwtError(response)) {
      return response;
    }

    // First allow the original JWT timestamp to become valid on PostgREST.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    response = await fetch(request.clone());
    if (!await isFutureJwtError(response)) {
      return response;
    }

    // If the regional clock is still behind, refresh only once for all
    // concurrent queries and also give the new JWT time before retrying.
    if (!refreshPromise) {
      refreshPromise = client.auth
        .refreshSession()
        .then(({ data, error }) => error ? null : data.session?.access_token ?? null)
        .finally(() => {
          refreshPromise = null;
        });
    }

    const accessToken = await refreshPromise;
    if (!accessToken) return response;

    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(new Request(request, { headers }));
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
