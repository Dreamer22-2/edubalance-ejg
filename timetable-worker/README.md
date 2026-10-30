# EduBalance timetable Worker

This Cloudflare Worker proxies the school's timetable endpoint without requiring
Firebase Functions in production. It validates the Firebase ID token, reads
only that token's own Firestore profile using the profile's owner-only Firestore
permission, and returns the parsed timetable without storing it. `admin`, `dev`,
and `owner` profiles can submit manual identifiers through the inspector; the
Worker rechecks that role before sending those identifiers to the school. The
regular signed-in timetable flow continues to use only the caller's saved
profile identifiers.

## Deploy

1. Install Node.js 22 or newer and create a Cloudflare account on the Workers
   Free plan.
2. From this directory, run `npm install`, then `npx wrangler login`.
3. Check `wrangler.jsonc`. `FIREBASE_PROJECT_ID` is already set to this app's
   project. Change `ALLOWED_ORIGINS` if production Hosting uses another domain.
4. Run `npm test`, then `npm run deploy`. The first deploy prints the Worker URL.
5. Set that URL as `window.TIMETABLE_WORKER_URL` in
   `../public/timetable-config.js`, without a trailing slash.
6. Deploy Firebase Hosting with `firebase deploy --only hosting`.

The Worker Free plan currently includes 100,000 requests per day, with a
10-millisecond CPU limit per request. Cloudflare may change plan limits.
The Cloudflare Worker is separate from the Firebase Functions emulator; local
development continues using the Functions emulator.
