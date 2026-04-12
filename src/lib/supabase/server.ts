import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { SupabaseClient } from "@supabase/supabase-js";

type CookieRow = { name: string; value: string; options: CookieOptions };

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieRow[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Actions may run where mutating cookies is not allowed; session refresh is optional here.
        }
      },
    },
  });
}
