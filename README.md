# Meme Current
Private meme discovery and publishing workspace for X, Facebook Pages, and Reddit.

## Implemented
- Reddit hot image post discovery; X recent image search; connected Facebook Page photo discovery.
- Momentum ranking based on engagement and post age; source filters and search.
- Manual HTTPS source/image imports; exact image URL deduplication.
- Persistent R2 review queue, captions, permission confirmation, archive and delivery history.
- Download and cache supported platform image files, capped at 8 MB.
- Manual publish: X caption + original source link; Facebook photo + caption; Reddit image link post.
- Server-only credentials, authenticated APIs, origin checks, conditional writes, duplicate-delivery protection.

## Configure private server environment variables
- `X_ACCESS_TOKEN`: user-context OAuth bearer token with search/read and write permissions.
- `REDDIT_ACCESS_TOKEN`: OAuth token with read and submit scopes.
- `REDDIT_USER_AGENT`: registered application user agent.
- `FACEBOOK_PAGE_TOKEN`: Page token with read engagement and manage posts permissions.
- `FACEBOOK_PAGE_ID`: target Page ID.
- `FACEBOOK_API_VERSION`: optional, default `v26.0`.

Set values using Sites environment settings and redeploy. Never commit credentials. Presence of credentials is not proof of valid permissions. Provider errors are surfaced without echoing secrets.

## Scope and limitations
No automatic OAuth setup or token refresh. No unattended scans or scheduled posting. X publishes links, not native image attachments. Reddit publishes link posts, not native image gallery posts; subreddit-specific flair requirements may prevent submission. Facebook discovery reads only the connected Page. No live platform requests can be tested until accounts are configured. Momentum is a heuristic, not measured growth; engagement counts are snapshots. Deduplication uses exact image URLs, not perceptual hashing. Remote images may expire. Delivery errors require checking the destination before retrying, to avoid duplicate posts. Keep this Site owner-private: records and credentials are shared within this workspace.

## Development
`node scripts/check.mjs` runs mock-backed API tests without contacting platforms.
`bash scripts/build.sh` builds the Worker.
`node scripts/validate-artifact.mjs` validates the bundle.

Worker entry point: `worker/index.js`. Persistent storage: `BUCKET` R2 binding.

## Deployment notes
This version targets ChatGPT Sites on Cloudflare Workers with an R2 binding named `BUCKET`. It relies on Sites authentication headers; it is not a standalone Docker or Node server. The public repository contains application source only. The deployed workspace remains private. When deploying a separate copy, replace the Site project ID through the Sites registration workflow. The `.env.example` file documents configuration names; the Worker does not load that file automatically.
