# Database Connection Setup Guide

## Step 1: Get Your Supabase Database Connection String

### Option A: From Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://supabase.com/dashboard/project/xlrcsusfaynypqvyfmgk
2. Navigate to **Settings** → **Database**
3. Scroll down to **Connection string** section
4. Select **Connection pooling** tab (recommended for production)
5. Copy the connection string - it looks like:
   ```
   postgresql://postgres.xlrcsusfaynypqvyfmgk:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
6. **Replace `[YOUR-PASSWORD]`** with your actual database password
   - If you don't know it, go to **Settings** → **Database** → **Database password**
   - You can reset it if needed

### Option B: Direct Connection (Alternative)

If you prefer direct connection (no pooling):
```
postgresql://postgres:[YOUR-PASSWORD]@db.xlrcsusfaynypqvyfmgk.supabase.co:5432/postgres
```

---

## Step 2: Deploy the Edge Function

### Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link your project**:
   ```bash
   supabase link --project-ref xlrcsusfaynypqvyfmgk
   ```

4. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy get-db-connection --no-verify-jwt
   ```

### Using Supabase Dashboard (Alternative)

1. Go to **Edge Functions** in your Supabase dashboard
2. Click **Create a new function**
3. Name it: `get-db-connection`
4. Copy the contents of `supabase-edge-function-get-db-connection.ts`
5. Paste into the function editor
6. Click **Deploy**

---

## Step 3: Set the Connection String Secret

### Using Supabase CLI

```bash
supabase secrets set SUPABASE_DB_CONNECTION_STRING="postgresql://postgres.xlrcsusfaynypqvyfmgk:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

**⚠️ IMPORTANT**: Replace `[YOUR-PASSWORD]` with your actual password!

### Using Supabase Dashboard

1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Click **Add new secret**
3. Name: `SUPABASE_DB_CONNECTION_STRING`
4. Value: Your full connection string (with password)
5. Click **Save**

---

## Step 4: Test the Connection

The VYBE app will automatically:
1. Call the Edge Function on startup
2. Retrieve the connection string
3. Create PostgresSaver with the connection
4. Automatically create LangGraph checkpoint tables

**You're done!** The app will now use Postgres for persistence.

---

## Security Notes

✅ **Connection string stays on Supabase** - never exposed to client
✅ **Edge Function is server-side** - secure by design
✅ **Similar to how Cursor/VS Code handle secrets** - industry standard

---

## Troubleshooting

### "Connection string not found"
- Make sure you set the secret: `SUPABASE_DB_CONNECTION_STRING`
- Check the secret name matches exactly (case-sensitive)

### "Connection refused"
- Verify your database password is correct
- Check if your IP is allowed (Supabase → Settings → Database → Connection pooling)

### "Edge Function not found"
- Make sure you deployed the function: `get-db-connection`
- Check the function name matches exactly

---

## Fallback Behavior

If the Edge Function fails, VYBE will:
1. Try environment variable: `SUPABASE_DB_CONNECTION_STRING`
2. Fall back to `MemorySaver` (in-memory, data lost on restart)
3. Log warnings but continue working

This ensures the app always works, even if database is unavailable.
