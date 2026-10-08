// Server-only database access for code that is not a route loader.
//
// Route loaders read through the server functions in src/lib/*.functions.ts
// (AGENTS.md rule 10). Server-only modules — the AI handlers, the proposal
// store — use this factory instead so credentials never leave the server.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type AtlasClient = SupabaseClient<Database>;

/**
 * Publishable-key client, created per request. The knowledge tables are
 * readable by anyone and writable by nobody, so this is the right key for
 * every read.
 */
export function atlasDb(): AtlasClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("The database connection is not configured.");
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Could not load ${what}: no rows returned`);
  return result.data;
}

export function unwrapMaybe<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T | null {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  return result.data;
}
