# TRACE (Trusted Retrieval and Associated Context Engine)

**Ask. Retrieve. Verify.**

TRACE is a multimodal AI context reconstruction engine. It transforms scattered information into connected context and reconstructs the relevant answer when you need it, while showing the evidence behind that answer.

**Phase 1 Limitations: AI processing, Gemini extraction, RAG, and automatic context linking are intentionally NOT implemented in Phase 1.**

## Tech Stack
- **Frontend**: Next.js (App Router), React, TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui
- **Database & Auth**: Supabase (PostgreSQL, Storage, Auth)
- **Validation**: Zod
- **Deployment Target**: Vercel

## Local Setup

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and add your credentials:
   ```bash
   cp .env.example .env.local
   ```
   **Required variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `GEMINI_API_KEY` *(For Phase 2A Smart Capture)*
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Phase 2A: Smart Capture
Phase 2A introduces the first genuine AI capability: **Smart Capture**.
- Go to `/capture` to upload an image or screenshot (PNG, JPEG, WEBP up to 10MB).
- TRACE uses Gemini 2.5 Flash server-side to extract structured Context, Entities, and Claims.
- Validated data is atomically saved to Supabase and linked to your account.
- View your reconstructed context graph on the `/context` page.
- **Note**: The Gemini API key must remain entirely server-side.

## Environment Variables

Your `.env.local` must contain the following keys:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GEMINI_API_KEY` *(Keep this server-side only)*

## Supabase Setup

### Database Schema
Run the migration file located at `supabase/migrations/0000_initial_schema.sql` in your Supabase SQL Editor. This will:
- Create the tables: `memories`, `entities`, `memory_entities`, `claims`, `interactions`.
- Enable RLS policies enforcing `user_id` isolation.
- Create the storage bucket `trace-sources`.

### Storage
The migration script automatically creates the `trace-sources` bucket (non-public) and sets up RLS policies ensuring users can only read/write files under their own `auth.uid()` path.

## Development Commands
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint`

## Deployment Notes
Deploy to Vercel and ensure the environment variables are configured in the Vercel dashboard. The application is ready to be connected to Supabase and styled as a dark-first premium app.
