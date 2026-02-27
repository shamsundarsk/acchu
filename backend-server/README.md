# ACCHU Backend Server

Standalone Express server for print job queue management.

## Why This Server?

Vercel serverless functions don't share memory across invocations, causing jobs to disappear. This server runs continuously and maintains jobs in memory reliably.

## Local Development

```bash
npm install
npm start
```

Server runs on http://localhost:3001

## Deploy to Railway.app (Free)

1. Go to https://railway.app
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select this repository
5. Set root directory to `backend-server`
6. Railway will auto-detect and deploy

## Environment Variables

No environment variables required for basic operation.

## Endpoints

- `GET /health` - Health check
- `POST /api/sessions` - Create session
- `POST /api/upload-file` - Upload file
- `GET /api/print-jobs/pending` - Get pending jobs
- `POST /api/print-jobs/pending` - Create print job
- `POST /api/print-jobs/:sessionId/cancel` - Cancel job
- `GET /api/download-file` - Download file
- `POST /api/delete-files` - Delete session files
