# Deploying to Fly.io with Supabase

This guide explains how to deploy your TFG Centering app to Fly.io with Supabase as your database.

## Prerequisites

- ✅ Fly.io account (https://fly.io)
- ✅ Supabase project set up and healthy
- ✅ Flyctl CLI installed

## Step 1: Install Flyctl CLI

```bash
# macOS
brew install flyctl

# Or download from https://fly.io/docs/hands-on/install-flyctl/
```

## Step 2: Log In to Fly.io

```bash
flyctl auth login
```

## Step 3: Set Supabase Secrets

Set the service key as a secret (more secure than in config):

```bash
flyctl secrets set SUPABASE_SERVICE_KEY="eyJhbGc..." -a tfg-centering
```

Get your service key from Supabase:
1. Go to https://app.supabase.com → Your Project
2. Settings → API → Service Role Key
3. Copy it and paste in the command above

## Step 4: Deploy to Fly.io

```bash
flyctl deploy
```

This will:
- Build your Docker image
- Deploy both frontend and backend
- Use Supabase for database and storage
- Make it accessible from anywhere

## Step 5: Verify Deployment

```bash
# Check deployment status
flyctl status -a tfg-centering

# View logs
flyctl logs -a tfg-centering

# Get your app URL
flyctl info -a tfg-centering
```

## Environment Variables

**Public (in fly.toml):**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key
- `NODE_ENV` - Set to "production"
- `PORT` - Set to 3001

**Secret (via flyctl secrets):**
- `SUPABASE_SERVICE_KEY` - For server-side operations

## Update Existing Deployment

To update code and redeploy:

```bash
# Make changes to your code
git add .
git commit -m "Your changes"

# Deploy updated version
flyctl deploy
```

## Database Migrations

Fly.io deployment uses Supabase's database directly. No migrations needed on Fly.io side.

If you modify your database schema:
1. Make changes in Supabase UI
2. Redeploy with `flyctl deploy`

## Monitor Your App

```bash
# View real-time logs
flyctl logs -a tfg-centering --follow

# Monitor metrics
flyctl status -a tfg-centering
```

## Troubleshooting

### Deployment fails
```bash
# Check Docker build
flyctl deploy --local-only

# View build logs
flyctl logs -a tfg-centering
```

### App crashes on startup
```bash
# Check logs
flyctl logs -a tfg-centering

# Verify secrets are set
flyctl secrets list -a tfg-centering
```

### Database connection fails
- ✅ Verify `SUPABASE_SERVICE_KEY` is set
- ✅ Check Supabase project status (should be "Healthy")
- ✅ Verify credentials haven't changed

### Images not uploading
- ✅ Verify Supabase Storage bucket exists
- ✅ Check bucket permissions are public

## Configuration

Current Fly.io settings (in `fly.toml`):

```
- Region: sjc (San Jose, US)
- Min machines: 0 (scales to zero when idle, saves costs)
- Idle timeout: 2 hours
- Auto-stop enabled (pauses when no traffic)
```

## Cost

**Fly.io:**
- First 3 shared VMs: Free
- Your app: Free tier eligible (under resource limits)

**Supabase:**
- Free tier includes database + storage

**Total: $0/month**

## Scaling

To increase performance:

```bash
# Add more instances
flyctl scale count 2 -a tfg-centering

# Increase CPU/RAM
flyctl scale vm shared-cpu-1x -a tfg-centering
```

## Rollback

If deployment breaks:

```bash
# See deployment history
flyctl releases -a tfg-centering

# Rollback to previous version
flyctl releases rollback -a tfg-centering
```

## Next Steps

1. ✅ Test locally first
2. ✅ Set Supabase service key
3. 🚀 Deploy with `flyctl deploy`
4. ✅ Verify at `tfg-centering.fly.dev`
5. ✅ Access from any device!

## Useful Commands

```bash
# Deploy
flyctl deploy -a tfg-centering

# Logs
flyctl logs -a tfg-centering --follow

# Status
flyctl status -a tfg-centering

# Secrets management
flyctl secrets set VAR=value -a tfg-centering
flyctl secrets list -a tfg-centering
flyctl secrets unset VAR -a tfg-centering

# Scaling
flyctl scale count 2 -a tfg-centering

# SSH into instance (for debugging)
flyctl ssh console -a tfg-centering
```

