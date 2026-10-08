// Mastery state for a signed-in reader.
//
// Progress is the only data in the atlas that belongs to a person, so it is
// the only table behind authentication. The handlers run as the caller through
// `requireSupabaseAuth`, which means the row-level policies — not this file —
// decide what each request can touch.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MASTERY_STATES, type ProgressMap } from "@/lib/learning-engine";
import { mergeProgress, normalizeProgress } from "@/lib/progress-store";

const storedStates = MASTERY_STATES.filter((s) => s !== "unknown") as [string, ...string[]];

const entrySchema = z.object({
  conceptId: z.string().min(1).max(80),
  state: z.enum(storedStates),
  updatedAt: z.string().min(1).max(40),
});

const syncSchema = z.object({
  entries: z.array(entrySchema).max(500),
});

const writeSchema = z.object({
  conceptId: z.string().min(1).max(80),
  state: z.enum([...storedStates, "unknown"] as [string, ...string[]]),
});

type ProgressRow = { concept_id: string; state: string; updated_at: string };

const toMap = (rows: ProgressRow[]): ProgressMap =>
  normalizeProgress(
    rows.map((row) => ({ conceptId: row.concept_id, state: row.state, updatedAt: row.updated_at })),
  );

const toRows = (userId: string, map: ProgressMap) =>
  Object.values(map).map((entry) => ({
    user_id: userId,
    concept_id: entry.conceptId,
    state: entry.state,
    updated_at: entry.updatedAt,
  }));

/** Everything this account has marked. */
export const getProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProgressMap> => {
    const { data, error } = await context.supabase
      .from("learning_progress")
      .select("concept_id, state, updated_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(`Could not load your progress: ${error.message}`);
    return toMap((data ?? []) as ProgressRow[]);
  });

/**
 * Record one mastery state. "unknown" deletes the row, so the table only ever
 * holds entries the reader actually touched.
 */
export const setProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(writeSchema)
  .handler(async ({ data, context }): Promise<ProgressMap> => {
    if (data.state === "unknown") {
      const { error } = await context.supabase
        .from("learning_progress")
        .delete()
        .eq("user_id", context.userId)
        .eq("concept_id", data.conceptId);
      if (error) throw new Error(`Could not clear that entry: ${error.message}`);
    } else {
      const { error } = await context.supabase.from("learning_progress").upsert(
        {
          user_id: context.userId,
          concept_id: data.conceptId,
          state: data.state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,concept_id" },
      );
      if (error) throw new Error(`Could not save that entry: ${error.message}`);
    }

    const { data: rows, error: readError } = await context.supabase
      .from("learning_progress")
      .select("concept_id, state, updated_at")
      .eq("user_id", context.userId);
    if (readError) throw new Error(`Could not reload your progress: ${readError.message}`);
    return toMap((rows ?? []) as ProgressRow[]);
  });

/**
 * Fold whatever the browser collected before sign-in into the account copy.
 * Newest write per concept wins, so signing in on a second device never
 * silently rewinds the first.
 */
export const syncProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(syncSchema)
  .handler(async ({ data, context }): Promise<ProgressMap> => {
    const { data: rows, error } = await context.supabase
      .from("learning_progress")
      .select("concept_id, state, updated_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(`Could not load your progress: ${error.message}`);

    const remote = toMap((rows ?? []) as ProgressRow[]);
    const local = normalizeProgress(data.entries);
    const merged = mergeProgress(remote, local);

    const changed = Object.values(merged).filter((entry) => {
      const existing = remote[entry.conceptId];
      return !existing || existing.state !== entry.state || existing.updatedAt !== entry.updatedAt;
    });

    if (changed.length > 0) {
      const { error: writeError } = await context.supabase
        .from("learning_progress")
        .upsert(toRows(context.userId, Object.fromEntries(changed.map((e) => [e.conceptId, e]))), {
          onConflict: "user_id,concept_id",
        });
      if (writeError) throw new Error(`Could not sync your progress: ${writeError.message}`);
    }

    return merged;
  });

/** Wipe this account's progress. The browser copy is cleared by the caller. */
export const clearProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProgressMap> => {
    const { error } = await context.supabase
      .from("learning_progress")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(`Could not clear your progress: ${error.message}`);
    return {};
  });
