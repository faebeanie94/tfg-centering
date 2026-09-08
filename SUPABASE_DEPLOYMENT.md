# Deploying to Supabase

This guide explains how to deploy your TFG Centering app to use Supabase as your remote database and storage, enabling access from any device.

## Prerequisites

- ✅ Supabase account (https://supabase.com)
- ✅ Your Supabase project is active and healthy
- ✅ Deployment platform account (Vercel, Railway, Render, or similar)

## Step 1: Prepare Your Supabase Project

Your Supabase project is already set up with:
- PostgreSQL database (free tier)
- Storage buckets (free tier)
- All required tables

No additional setup needed in Supabase.

## Step 2: Set Up Backend Deployment

### Option A: Deploy to Vercel (Recommended for Node.js)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy the server:**
   ```bash
   cd server
   vercel
   ```

3. **Add environment variables during deployment:**
   ```
   SUPABASE_URL=https://bmorzawcorhufrmfbyen.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...
   PORT=3001
   ```

4. **Vercel will provide a backend URL** (e.g., `https://tfg-server.vercel.app`)

### Option B: Deploy to Railway

1. **Connect your GitHub repo to Railway**
2. **Add environment variables:**
   ```
   SUPABASE_URL=https://bmorzawcorhufrmfbyen.supabase.co
   SUPABASE_ANON_KEY=<your-key>
   ```
3. **Railway assigns a public URL**

### Option C: Deploy to Render

1. **Create new Web Service on Render**
2. **Connect your GitHub repo**
3. **Build command:** `cd server && npm install && npm start`
4. **Environment variables:** Same as above
5. **Render provides a public URL**

## Step 3: Update Frontend Configuration

After backend is deployed, update your frontend:

**File:** `vite.config.ts`

```typescript
server: {
  host: '0.0.0.0',
  port: 5173,
  proxy: {
    '/api': {
      target: 'https://your-deployed-backend-url.com',  // ← Update this
      changeOrigin: true,
    },
  },
},
```

## Step 4: Deploy Frontend

### Option A: Deploy to Vercel

```bash
npm run build
vercel deploy
```

### Option B: Deploy to Netlify

```bash
npm run build
netlify deploy --prod --dir=dist
```

## Step 5: Configure Supabase Environment

Your `.env` should have:

```
SUPABASE_URL=https://bmorzawcorhufrmfbyen.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...  (for server-side operations)
```

For production, use the **service role key** (more permissions) on the backend.

## Step 6: Test Remote Access

1. **From any device**, navigate to your deployed frontend URL
2. **Create a submission** - should save to Supabase database
3. **Upload card images** - should save to Supabase Storage
4. **Export** - should work with Supabase images

## Troubleshooting

### Database Connection Fails
- ✅ Check Supabase project is "Healthy"
- ✅ Verify credentials in environment variables
- ✅ Check CORS settings in Supabase

### Images Not Uploading
- ✅ Verify Supabase Storage bucket `tfg-submissions` exists
- ✅ Check bucket permissions are public

### Frontend Can't Reach Backend
- ✅ Update proxy URL in `vite.config.ts`
- ✅ Verify CORS is enabled on backend

## Current Local Setup

For now, your **local setup works perfectly** for development:

```bash
# Terminal 1 (Frontend)
npm run dev

# Terminal 2 (Backend)
cd server && npm run dev
```

When you're ready to go live, follow the deployment steps above.

## Key Files to Deploy

- **Backend:** `server/src/**` and `server/package.json`
- **Frontend:** `src/**`, `vite.config.ts`, `package.json`
- **Database:** Supabase handles this (no migration needed)
- **Images:** Supabase Storage handles this

## Environment Variables Checklist

**Backend (.env):**
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_KEY`
- [ ] `PORT=3001`

**Frontend (.env):**
- [ ] `REACT_APP_API_URL=<your-backend-url>`

## Cost

- **Supabase:** Free tier (includes database + storage)
- **Vercel/Railway/Render:** Free tier available
- **Total:** $0/month with free tiers

## Next Steps

1. ✅ Keep using local setup for development
2. 🚀 When ready: Deploy backend to Vercel/Railway/Render
3. 🚀 Deploy frontend to Vercel/Netlify
4. ✅ Use Supabase for database and storage (free)
5. ✅ Access from any device!

