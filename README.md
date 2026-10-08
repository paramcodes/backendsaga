# Backend Atlas (`backendsaga`)

> **A field guide to how backend systems fail, and why.**
>
> Live deployment: **[https://backendsaga.vercel.app](https://backendsaga.vercel.app)**

Backend Atlas is an interactive knowledge graph, incident triage engine, and evidence library for backend systems engineering. It maps failure modes across the entire stack—from high-level application code down through data stores, runtimes, network boundaries, and operating system internals.

---

## Features

- **Interactive Knowledge Graph:** Multi-layer architectural exploration (Application, Data, Runtime, Network, Operating System) powered by `@xyflow/react` and `elkjs` layout derivation.
- **Deterministic Incident Triage Engine:** Diagnose root causes from symptom combinations across real-world failure scenarios with ranked cause-chain path analysis.
- **Evidence & Signal Library:** Curated OpenTelemetry-style signals (`METRIC`, `LOG`, `TRACE`, `PROFILE`, `QUERY_PLAN`, `PACKET`, `OS_COUNTER`) with specific indicators, inspection locations, diagnostic relevance, and false-positive notes.
- **Learning Loops & Mastery Tracking:** Prerequisite-aware concept pathways, weak-spot discovery, and progress tracking.
- **AI-Assisted Graph Research:** Grounded AI research and explanation workflows powered by pure context builders derived directly from canonical graph entities.

---

## Tech Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (Full-stack SSR) + [TanStack Router](https://tanstack.com/router)
- **UI & Visualization:** [React 19](https://react.dev), [Tailwind CSS v4](https://tailwindcss.com), [Radix UI](https://www.radix-ui.com), [@xyflow/react](https://reactflow.dev), [elkjs](https://github.com/kieler/elkjs)
- **Database & State:** [Supabase](https://supabase.com) (PostgreSQL), [Drizzle ORM](https://orm.drizzle.team), [Zod](https://zod.dev)
- **Server Engine & Deployment:** [Nitro](https://nitro.build) on [Vercel](https://vercel.com)
- **Runtime & Tooling:** [Bun](https://bun.sh), [Vite](https://vite.dev), [Vitest](https://vitest.dev)

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.2+) or Node.js (v22+)
- A Supabase project (or local instance)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/paramcodes/backendsaga.git
   cd backendsaga
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   SUPABASE_PROJECT_ID="your-project-id"
   SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"
   SUPABASE_URL="https://your-project-id.supabase.co"
   VITE_SUPABASE_PROJECT_ID="your-project-id"
   VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"
   VITE_SUPABASE_URL="https://your-project-id.supabase.co"
   ```

4. **Run the development server:**
   ```bash
   bun run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) (or the port indicated in your terminal).

---

## Available Scripts

| Command | Description |
|---|---|
| `bun run dev` | Starts the Vite / TanStack Start development server |
| `bun run build` | Builds the client and SSR server bundles for production |
| `bun run preview` | Runs the production build locally |
| `bun run test` | Executes the Vitest test suite |
| `bun run lint` | Lints the codebase with ESLint |
| `bun run format` | Formats source files with Prettier |

---

## Deployment

This project is deployed on **Vercel** via Nitro's Vercel build engine:

```bash
# Build for Vercel production
vercel build --prod

# Deploy the prebuilt artifacts
vercel deploy --prebuilt --prod
```

Production deployment: **[https://backendsaga.vercel.app](https://backendsaga.vercel.app)**
