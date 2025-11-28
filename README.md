# Inventory Copilot

Inventory Copilot is a read-only Shopify app that spots stockouts and overstock, builds replenishment lists, and surfaces cash tied up in slow movers. Data comes from Shopify inventory and orders; we do not write products or inventory.

## Quick start (local)
- `cp .env.example .env` and fill `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES` (defaults to read_products, read_inventory, read_orders, read_locations).  
- Install deps: `npm install`.
- Run dev (requires Shopify CLI login): `npm run dev`.
- Database: Prisma is set to SQLite in `prisma/schema.prisma` for local play. Run `npm run setup` if tables are missing.

## Production notes
- Prefer Postgres/MySQL in production: update `prisma/schema.prisma` datasource to use `env("DATABASE_URL")`, set `DATABASE_URL`, and run `npm run setup` (or `prisma migrate deploy`) before deployment.
- Dockerfile is marked “not ready for production” and installs deps without dev tools; consider a two-stage build before using it.

## Data & sync behavior
- Sync cadence: background refresh roughly every 30 minutes (controlled by `CACHE_MAX_MINUTES`), so UI is near-real-time but not instant.
- Sample data is only used in development when Shopify and cache are both unavailable; production will error instead of showing fake data.
- Required Shopify scopes: read_products, read_inventory, read_orders, read_locations. The app stays read-only.

## Scripts
- `npm run dev` – start dev server via Shopify CLI tunnel.
- `npm run build` – build for production.
- `npm run setup` – generate Prisma client and apply migrations.
- `npm run docker-start` – helper entry for container (expects deps already installed).
