-- Phase 8: the AI layer proposes, it never writes to the knowledge graph.
--
-- Research answers land here as pending proposals. The knowledge tables
-- (concepts, relationships, evidence, sources, symptoms, incidents) stay
-- read-only to every public role; an accepted proposal is applied by a human
-- editing the curated TypeScript seed and re-seeding.
CREATE TABLE public.research_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  question text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  model text NOT NULL,
  run_id text,
  -- Fingerprint of the graph context handed to the model, so a reader can
  -- confirm the proposal came from the slice of the atlas shown next to it.
  context_hash text NOT NULL,
  context jsonb NOT NULL,
  summary text NOT NULL DEFAULT '',
  proposal jsonb NOT NULL,
  -- Everything the review step dropped, with the reason.
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

GRANT SELECT ON public.research_proposals TO anon;
GRANT SELECT ON public.research_proposals TO authenticated;
GRANT ALL ON public.research_proposals TO service_role;

ALTER TABLE public.research_proposals ENABLE ROW LEVEL SECURITY;

-- Readable by anyone: the proposals are part of the atlas' audit trail.
-- No INSERT/UPDATE/DELETE policy exists, and the write privileges are not
-- granted, so only server code holding the service role can record or decide
-- a proposal.
CREATE POLICY "Research proposals are public reading"
  ON public.research_proposals
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX research_proposals_created_at_idx ON public.research_proposals (created_at DESC);
CREATE INDEX research_proposals_status_idx ON public.research_proposals (status);
