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

  const fetchWithJwtRecovery: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const response = await fetch(request);

    if (response.status !== 401 || !request.url.includes('/rest/v1/')) {
      return response;
    }

    const responseBody = await response.clone().text();
    if (!/JWT issued at future/i.test(responseBody)) {
      return response;
    }

    // Supabase can briefly reject a newly issued token when its servers are
    // out of sync. Wait for the token timestamp to become valid, refresh the
    // session once, and repeat only the failed Data API request.
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    if (!refreshPromise) {
      refreshPromise = client.auth
        .refreshSession()
        .then(({ data, error }) => (error ? null : data.session?.access_token ?? null))
        .finally(() => {
          refreshPromise = null;
        });
    }

    const accessToken = await refreshPromise;
    if (!accessToken) {
      return response;
    }

    const retryHeaders = new Headers(request.headers);
    retryHeaders.set('Authorization', `Bearer ${accessToken}`);

    return fetch(new Request(request, { headers: retryHeaders }));
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
