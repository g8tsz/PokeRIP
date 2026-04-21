import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv, env } from "@/lib/env";
import { createClient as createJsClient } from "@supabase/supabase-js";

// For route handlers / server components (respects the user's session).
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const c of items) cookieStore.set(c.name, c.value, c.options);
          } catch {
            // Server component context — ignore.
          }
        },
      },
    },
  );
}

// Admin / service-role client. Bypasses RLS. Server-only. Never import in client code.
export function createSupabaseAdmin() {
  const e = env();
  return createJsClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
