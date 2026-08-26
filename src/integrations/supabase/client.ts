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

  const fetchWithJwtRecovery: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    let response = await fetch(request.clone());

    if (!request.url.includes('/rest/v1/')) {
      return response;
    }

    // During Supabase's JWT clock-skew incident, refreshing can create another
    // token whose timestamp is also rejected. Keep the original token and retry
    // the exact request after progressively longer waits until it becomes valid.
    for (const delayMs of [2_000, 4_000, 8_000]) {
      const responseBody = response.status === 401
        ? await response.clone().text()
        : '';

      if (!/JWT issued at future/i.test(responseBody)) {
        return response;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      response = await fetch(request.clone());
    }

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

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options);
}

export const supabase = createSupabaseClient();
