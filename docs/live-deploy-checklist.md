# Live Deploy Checklist

## 1. Pick the production host

Recommended targets for this app template:

- Google Cloud Run
- Render
- Fly.io

This repo already includes a `Dockerfile`, so any container host will work.

## 2. Set production environment variables

Use `deploy.env.example` as the source of truth and configure these values in your host:

- `NODE_ENV=production`
- `PORT=3000`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SCOPES`
- `SHOPIFY_APP_URL`
- `DATABASE_URL`
- `SHOP_CUSTOM_DOMAIN` only if needed

## 3. Finalize Shopify app URLs

After your production domain is live, update `shopify.app.toml`:

- `application_url = "https://your-app-domain.example.com"`
- `redirect_urls = [ "https://your-app-domain.example.com/auth/callback", "https://your-app-domain.example.com/auth/shopify/callback" ]`

Use the exact same public HTTPS domain in:

- `SHOPIFY_APP_URL`
- `application_url`
- both auth redirect URLs

## 4. Production database

Current repo status:

- local development uses SQLite in `prisma/dev.sqlite`
- live stores should use a managed database if you plan to scale beyond one instance

If you stay single-instance, SQLite can still work. If you want safer production hosting, move session storage to Postgres or MySQL before launch.

## 5. Safe local workflow for Shopify CLI

Avoid running Shopify CLI from the OneDrive-synced folder because lock files can fail.

Use:

```powershell
.\scripts\sync-safe-workspace.ps1 -InstallDependencies
```

That creates a clean working copy at `C:\Users\ASUS\dev\rufftail-discount-app`.

Then run Shopify commands from that copied folder:

```powershell
cd C:\Users\ASUS\dev\rufftail-discount-app
npm.cmd run lint
npm.cmd run build
shopify app dev
shopify app deploy
```

## 6. Pre-launch checks

Before installing on a live store:

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- confirm app install works against the final production domain
- confirm webhook delivery succeeds
- confirm discount function is deployed and visible in Shopify admin
