// One place that owns "what do I know?".
//
// Guests keep their marks in this browser. Signing in merges that copy with
// the account copy (newest write per entry wins) and every later change is
// written to both. Nothing here blocks the UI: marks apply instantly and the
// network catches up.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useAuth } from "@/hooks/use-auth";
import type { MasteryState, ProgressMap } from "@/lib/learning-engine";
import {
  clearProgress as clearProgressRemote,
  setProgress as setProgressRemote,
  syncProgress as syncProgressRemote,
} from "@/lib/learning.functions";
import {
  clearStoredProgress,
  mergeProgress,
  progressEntries,
  readStoredProgress,
  setProgressState,
  writeStoredProgress,
} from "@/lib/progress-store";

export type ProgressApi = {
  progress: ProgressMap;
  /** False during the server render and the first paint, before storage is read. */
  ready: boolean;
  signedIn: boolean;
  syncing: boolean;
  error: string | null;
  stateOf: (conceptId: string) => MasteryState;
  setState: (conceptId: string, state: MasteryState) => void;
  clearAll: () => void;
};

const ProgressContext = createContext<ProgressApi | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [progress, setProgress] = useState<ProgressMap>({});
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncedFor = useRef<string | null>(null);

  // Storage is read after mount: the server render has no browser to ask.
  useEffect(() => {
    setProgress(readStoredProgress());
    setReady(true);
  }, []);

  const remember = useCallback((next: ProgressMap) => {
    setProgress(next);
    writeStoredProgress(next);
  }, []);

  // On sign-in, fold the browser copy into the account copy exactly once.
  useEffect(() => {
    if (!ready || authLoading) return;
    const userId = user?.id ?? null;
    if (!userId) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    let active = true;
    setSyncing(true);
    setError(null);
    void syncProgressRemote({ data: { entries: progressEntries(readStoredProgress()) } })
      .then((merged) => {
        if (!active) return;
        remember(mergeProgress(readStoredProgress(), merged));
      })
      .catch((cause: unknown) => {
        if (!active) return;
        syncedFor.current = null;
        setError(cause instanceof Error ? cause.message : "Could not reach your saved progress.");
      })
      .finally(() => {
        if (active) setSyncing(false);
      });

    return () => {
      active = false;
    };
  }, [ready, authLoading, user?.id, remember]);

  const setState = useCallback(
    (conceptId: string, state: MasteryState) => {
      const next = setProgressState(progress, conceptId, state);
      remember(next);
      if (!user) return;
      setError(null);
      void setProgressRemote({ data: { conceptId, state } }).catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? `Saved here, but not to your account: ${cause.message}`
            : "Saved here, but not to your account.",
        );
      });
    },
    [progress, remember, user],
  );

  const clearAll = useCallback(() => {
    setProgress({});
    clearStoredProgress();
    if (!user) return;
    setError(null);
    void clearProgressRemote({ data: undefined }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not clear your account copy.");
    });
  }, [user]);

  const value = useMemo<ProgressApi>(
    () => ({
      progress,
      ready,
      signedIn: Boolean(user),
      syncing,
      error,
      stateOf: (conceptId: string) => progress[conceptId]?.state ?? "unknown",
      setState,
      clearAll,
    }),
    [progress, ready, user, syncing, error, setState, clearAll],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressApi {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("useProgress must be used inside <ProgressProvider>");
  return value;
}
