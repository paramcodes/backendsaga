// The reader's session, if there is one.
//
// An account is optional everywhere in the atlas: it only decides whether
// progress lives in this browser or follows the reader between devices.
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the first session lookup settles — nothing is known yet. */
  loading: boolean;
};

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Subscribe first so a token refresh during the initial lookup is not lost.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data: { session: current } }) => {
      if (!active) return;
      setSession(current);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
