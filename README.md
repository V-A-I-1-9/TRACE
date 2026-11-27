# TRACE
Trusted Retrieval and Associated Context Engine is a personal memory workspace. Capture an image, document, recording or typed note, ask a question, and open the original from the answer. The graph connects memories through shared people, places and organizations.

## Run locally
Use Node 22.18+ and the lockfile. Install with `npm ci`, copy `.env.example` to `.env.local`, then set the Supabase URL, publishable key, and server-side Gemini key. Start with `npm run dev`. The connected Project TRACE database already has the application schema. For a separate Supabase project, apply the files under `supabase/migrations` in order, starting with an empty database and enabling pgvector in the extensions schema. The source bucket is private.

## Retrieval and API usage
- Capture first checks a per-account content hash. An identical file or note reuses its saved memory.
- Local English OCR and labelled-field extraction handle clear coupon images and simple tickets. Searchable PDFs use a local text reader before generation. Other images, scanned PDFs and recordings use Gemini. If generation is unavailable, readable text and OCR can still be saved. A recording without a transcript or an unreadable image requires a later retry.
- The database saves memories, entity links, claims, events and reminders together. Full-text retrieval works as soon as capture succeeds. A single-merchant coupon-code question can be answered directly from observed claims.
- The default Gemini model is `gemini-3.1-flash-lite`. Set `GEMINI_MODEL` to another structured-output model available to your account to compare Gemini models. Generation has a time limit and never automatically retries a quota error.
- `TRACE_SEMANTIC_SEARCH=auto` adds a background embedding for AI-extracted sources and tries vector search after a full-text miss. Set it to `off` to avoid embedding calls, or `on` to index locally extracted sources too. Previously stored memories remain searchable by text.
- Typed notes and text documents support 16,000 characters. Image and document uploads support 10 MB and audio supports 20 MB when running locally. A hosting platform may impose a smaller request limit.

## Demo rehearsal
The two PNGs under `demo/` are fictional rehearsal sources. The sample reward has the case-sensitive code `Pace-7x42`. The sample bus ticket goes from Mysore to Ooty on 15 December 2026.

1. Capture a reward screenshot with a legible merchant and code. Ask whether you have a coupon for that merchant, then open **View original** to compare the characters.
2. Capture a dated trip ticket. Start a fresh chat and ask what to pack. Check the ticket citation and the separate recommendations.
3. Ask about an unrelated merchant. Upload the first screenshot again and check that the memory count stays the same.
4. Open **Graph**, select a memory and inspect the destination or merchant. **All connections** shows the full graph.

Run `npm test`, `npm run lint` and `npm run build` before presenting. The production app starts with `npm start`.
