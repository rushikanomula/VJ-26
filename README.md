# Varuna Phase 1 — real crop image analysis

React 18, Vite, TypeScript, Tailwind, Supabase Auth, a protected Supabase Edge Function, and OpenAI GPT-4o vision. The scanner draws approximate AI-suggested regions over the **actual uploaded image** using Canvas. No sample diagnosis is substituted for a real upload.

## Implemented

- `/disease-detector` and `/ar-scanner` share the real vision pipeline.
- JPG/PNG/WebP up to 10 MB, resized and compressed to JPEG locally to a longest side of 1600 px. No image is persisted by Phase 1.
- The function checks the user token, request size, origin, per-user hourly quota, and model output. The OpenAI key remains server side.
- Download an annotated JPEG. Boxes are approximate visual regions, **not precise segmentation**. Confidence is a subjective model estimate, **not a calibrated diagnostic probability**.

## Prerequisites

Node 20.19+ or 22.12+, npm, Supabase project and CLI, OpenAI API key with `gpt-4o` access and active billing. Docker is needed for the optional local Supabase stack.

## Setup

1. Create a Supabase project. Enable Email/Password in Authentication → Providers. Set the Site URL to `http://localhost:5173` for local work. Configure an SMTP provider before real customer onboarding if email confirmation is enabled.
2. From this directory, run:

```bash
npm install
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY ALLOWED_ORIGINS=https://YOUR_PRODUCTION_DOMAIN,http://localhost:5173
npx supabase functions deploy analyze-crop
cp .env.example .env.local
```

3. Edit `.env.local` with your Supabase URL and **publishable/anon** key. Then run:

```bash
npm run dev
```

Open `http://localhost:5173/disease-detector`. Sign up, confirm email if required, sign in, upload a real crop photo, and analyze. The scanner is at `/ar-scanner`.

## Build and host later

```bash
npm run typecheck
npm run build
npm run preview
```

Host `dist/` with an SPA rewrite to `index.html` for both routes. Add your exact HTTPS origin to `ALLOWED_ORIGINS` (no path/trailing slash) and configure the Supabase Auth Site URL and redirect allow list. Never put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_` variable. The rate limit is 20 accepted requests per user per clock-hour bucket; add spend limits, monitoring, and old quota-row cleanup before broad public rollout.

Images are sent to Supabase and OpenAI for analysis. Obtain consent and review provider data handling terms before customer use. Crop findings and treatments can be wrong; ask a qualified local agronomist to verify identification, regulatory approval, label instructions, and safety. The function logs errors without images, tokens, or diagnosis text.

Email dispatch, persistent scan history, Google OAuth, 3D farm scenes, and a production deployment pipeline are Phase 2/3 work. A live end-to-end vision request requires your Supabase and OpenAI credentials, which are not included in this package.

## Phase 2 — email reports

The **Save report** button stores the original and annotated JPEG in the private `crop-scans` bucket and a diagnosis record in `scan_history`. An authenticated user can enter a recipient email and press **Send email**. The server reads only a scan owned by that user, formats a professional HTML report from the stored diagnosis, embeds the annotated image with CID, sends through Resend, and writes an audit row. The browser never receives the Resend API key. The sender must be on a verified Resend domain. The recipient is selected by the user; the app does not send any report automatically.

Configure Resend and deploy the second function:

```bash
npx supabase db push
npx supabase secrets set RESEND_API_KEY=YOUR_RESEND_KEY REPORT_FROM_EMAIL='Varuna <reports@YOUR_VERIFIED_DOMAIN>'
npx supabase functions deploy send-report
```

`ALLOWED_ORIGINS` is shared by both functions. The email endpoint permits 10 requests per user per clock-hour bucket and uses an idempotency key to reduce duplicate delivery on retries. A successful provider send can still be followed by a failed audit insert; this is logged for operations review. Set up SPF/DKIM and sender verification in Resend before testing delivery.

## Phase 3 — auth, storage, 3D, deployment

The SQL migrations create RLS-protected `profiles`, `scan_history`, `saved_sessions`, and `email_dispatches`; the private Storage bucket restricts objects to the owning user's UUID folder. Email/password auth and Google OAuth are wired in the front end. Enable Google in Supabase Authentication → Providers using a Google OAuth client ID/secret, add Supabase's callback URL in Google Cloud, and add the deployed app URL to Supabase's redirect allow list. The profile screen reads/writes `profiles`. The 3D farm scene is loaded only when opening `/farm-explorer`; it is an illustrative scene, not a real-farm reconstruction.

### Deploy the front end to Netlify

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Netlify site's build environment. Then connect the repo and use the included `netlify.toml`, or run:

```bash
npm ci
npm run build
# Upload dist/ to a static host with an SPA rewrite to /index.html
```

### Deploy the front end to Vercel

Import the repository, set the same two `VITE_` build variables, and use the included `vercel.json`. For a CLI deploy after configuring the project:

```bash
npx vercel --prod
```

### Run the container

Docker builds bake the public Supabase URL and publishable key into the JS bundle. Never supply service-role, OpenAI, or Resend secrets as Docker build arguments.

```bash
docker build -t varuna:latest \
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY .
docker run --rm -p 8080:8080 varuna:latest
```

Serve the container behind HTTPS in production. `nginx.conf` handles deep links (`/history`, `/profile`, `/farm-explorer`). Update `ALLOWED_ORIGINS` and the Supabase Auth URLs to the exact deployed origin. Keep functions deployed in Supabase; this container serves only the front end.

### Verification before public launch

1. Register with email, verify the account, sign in; then test Google OAuth after enabling it.
2. Analyze a real crop image; confirm a structured result and annotated download.
3. Save a report; reload, open it from History, verify the private image loads, and delete a test report.
4. Send a report to an address you control. Check the inline image, advice text, delivery, and `email_dispatches` audit row.
5. Sign in as a second user and confirm the first user's history and storage files cannot be accessed.
6. Check API spend caps, Supabase/Resend logs, rate limits, SMTP, retention requirements, and backups. Remove old quota rows periodically.

**Deployment status:** The code builds, but no Supabase project or Resend account is connected in this workspace. The supplied OpenAI key is not copied into source, ZIP, or client bundles. A production end-to-end test and real email delivery require project configuration and provider credentials. Rotate any API key shared in chat before putting it into a live secret manager.
