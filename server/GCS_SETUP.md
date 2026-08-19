# Google Cloud Storage Setup

Free tier includes 5GB/month free storage for the first 12 months.

## Step 1: Create GCP Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Sign in with Google account (or create one)
3. Click **Select a Project** (top left)
4. Click **New Project**
5. Name: `tfg-centering`
6. Click **Create**
7. Wait for project to be created

## Step 2: Enable Cloud Storage API

1. In Cloud Console, search for **Cloud Storage**
2. Click **Enable** to enable the API
3. Wait for it to finish enabling

## Step 3: Create Storage Bucket

1. Go to **Cloud Storage** → **Buckets**
2. Click **Create Bucket**
3. Name: `tfg-submissions` (must be globally unique)
4. Region: `us-central1` (or closest to you)
5. Storage class: **Standard**
6. Access control: **Uniform**
7. Uncheck "Enforce public access prevention" (for now)
8. Click **Create**

## Step 4: Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Service account name: `tfg-backend`
4. Click **Create and Continue**
5. Grant roles:
   - **Storage Object Creator**
   - **Storage Object Viewer**
6. Click **Continue** → **Done**

## Step 5: Create Service Account Key

1. Click the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Key type: **JSON**
5. Click **Create**
6. A JSON file will download
7. Save it in your project: `server/gcs-key.json`
8. Keep this file SECRET - don't commit it!

## Step 6: Configure Environment

Add to `server/.env`:

```bash
GCP_PROJECT_ID=tfg-centering
GCP_KEY_FILE=./gcs-key.json
GCS_BUCKET=tfg-submissions
DATABASE_URL=postgresql://jordangraham-kee@localhost:5432/tfg
PORT=3001
```

## Step 7: Test

```bash
cd server
npm install
npm run dev
```

Test the health endpoint:
```bash
curl http://localhost:3001/health
```

## Step 8: Deploy to Fly.io

1. **Upload the service account key to Fly:**

```bash
fly secrets set GCP_PROJECT_ID=tfg-centering
fly secrets set GCS_BUCKET=tfg-submissions
fly secrets set GCP_KEY_FILE="$(cat gcs-key.json)"
```

2. **Deploy:**

```bash
fly deploy
```

## Pricing

- **Free tier**: 5GB/month for 12 months
- **After free tier**: ~$0.02 per GB
- **Free quota**: 1M class A operations, 10M class B operations

## Troubleshooting

**"Permission denied"**
- Make sure service account has Storage roles
- Check GCP_KEY_FILE path is correct

**"Bucket not found"**
- Verify bucket name is exactly correct
- Check bucket exists in GCP Console

**"Service account JSON invalid"**
- Re-download the key file
- Make sure it's valid JSON
