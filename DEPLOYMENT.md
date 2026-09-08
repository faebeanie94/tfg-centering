# Deployment Guide - Fly.io

This app uses a single Fly.io app that serves both the frontend and backend from one container.

## Architecture

```
Fly.io App (tfg-centering)
├── Frontend (React + Vite build)
├── Backend (Express.js)
├── Database (Supabase PostgreSQL)
└── Storage (Google Cloud Storage)
```

## Prerequisites

1. **Fly.io Account**: Create one at https://fly.io
2. **Flyctl CLI**: Install from https://fly.io/docs/getting-started/installing-flyctl/
3. **Environment Variables**: Set up secrets in Fly.io

## One-Time Setup

### 1. Initialize Fly.io App

```bash
flyctl auth login
flyctl launch --dockerfile --name tfg-centering
```

This will:
- Authenticate you with Fly.io
- Create the app using the Dockerfile
- Generate an app name and region

### 2. Set Environment Variables (Secrets)

Store sensitive data as Fly.io secrets (not in fly.toml):

```bash
flyctl secrets set DATABASE_URL="postgresql://..."
flyctl secrets set GCP_PROJECT_ID="tfg-centering-506018"
flyctl secrets set GCS_BUCKET="tfg-submissions"
```

You can manage these at: https://fly.io/dashboard/apps/tfg-centering/secrets

## Deployment

### Option A: Deploy from CLI

```bash
npm run deploy
```

This will:
1. Build the frontend
2. Copy it into the server directory
3. Push to Fly.io and deploy

### Option B: Manual Deploy

```bash
bash build.sh          # Build frontend and copy to server/dist
flyctl deploy          # Deploy to Fly.io
```

### Option C: Deploy via GitHub Actions

Add `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Fly.io

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: npm run deploy
```

Set `FLY_API_TOKEN` in GitHub Secrets: https://fly.io/docs/getting-started/log-in-to-fly/

## Monitoring & Logs

```bash
# View logs
flyctl logs -a tfg-centering

# SSH into the app
flyctl ssh console

# View deployment status
flyctl status -a tfg-centering

# Restart app
flyctl restart -a tfg-centering
```

## Health Checks

The app includes a `/health` endpoint that Fly.io monitors:

```bash
curl https://tfg-centering.fly.dev/health
# Response: {"status":"healthy","database":"connected"}
```

If the database can't connect, it returns 503 (unhealthy).

## Scaling

```bash
# Scale up to 2 instances
flyctl scale count 2 -a tfg-centering

# Scale to specific regions
flyctl regions add iad lax -a tfg-centering
```

## Database Connection

The backend connects to Supabase PostgreSQL via `DATABASE_URL`. Make sure:

1. Supabase project is accessible from Fly.io IPs
2. Database has proper SSL/TLS certificates
3. Connection pooling is enabled (Supabase does this by default)

## Troubleshooting

### App keeps crashing

Check logs:
```bash
flyctl logs -a tfg-centering
```

Common issues:
- Database connection failed → Check `DATABASE_URL` secret
- Port mismatch → fly.toml should use port 3001
- Missing dependencies → Rebuild with `npm run deploy`

### API calls failing

The frontend and backend are same-origin, so no CORS issues. If `/api/*` returns 500:
- Check backend logs
- Verify database connection
- Check GCP/GCS credentials

### Frontend not loading

- Verify `dist/` was copied to `server/dist/`
- Check Express static middleware is enabled
- Verify fly.toml has correct `internal_port = 3001`

## Rollback

```bash
flyctl releases -a tfg-centering
flyctl releases rollback -a tfg-centering
```

## Environment-Specific Config

The app reads environment based on `NODE_ENV`:

- **Development**: `npm run dev` (Vite proxy to localhost:3001)
- **Production**: Fly.io (Express serves both frontend + API)

## Cost Estimate

Fly.io pricing (as of 2024):
- Shared CPU + 256MB RAM: $2.50/month (you get 3 shared-cpu-1x 256MB VMs free)
- Data transfer out: $0.02/GB
- Postgres credits: First $5/month free

Total for this app: ~$5-10/month depending on usage

## Next Steps

1. Run `flyctl launch --dockerfile --name tfg-centering`
2. Set environment secrets with `flyctl secrets set`
3. Deploy with `npm run deploy`
4. Check status: `flyctl status -a tfg-centering`
