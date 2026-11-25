# SkillVerify frontend

Use Node.js 20+ and npm. Start the existing SkillVerify backend separately.

1. Run `npm ci` from `frontend/`.
2. Copy `.env.example` to `.env` and set `VITE_API_URL` to the API origin. The default is `http://localhost:4000`. Vite environment variables are public.
3. Run `npm run dev` and open `http://localhost:5173`. The API must allow this origin through CORS.

Run `npm run typecheck` to check TypeScript and `npm run build` to generate `dist/`. Run `npm run preview` to inspect the build locally. For static hosting, configure a fallback to `index.html` for frontend routes, including `/workers/:slug`.

The frontend reads the public worker list and detail endpoints. Directory suggestions come from `GET /api/meta/filters` and searches accept typed values. Trade labels on the homepage link to representative search terms because the API currently stores free-text trade names. Tier results require a corresponding API contract.

Trust Cards provide per-profile browser titles and metadata after the client loads the profile. Social crawlers that read only the initial HTML will need prerendered per-profile metadata for rich previews.

Workers register at `/register` and sign in at `/login`. The dashboard at `/dashboard` uses `GET /api/auth/me` and sends workers without a profile to `/onboarding`. Submitting onboarding publishes the public Trust Card immediately. Access tokens are held in memory, so reloading the app requires signing in again. Signing out clears local session and private query data.
