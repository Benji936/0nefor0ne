# Cloudflare R2 setup for TradeMarket card images

Goal: host all Yu-Gi-Oh card images on Cloudflare R2, free, with auto-update from the YGOPRODeck API.

R2 free tier (as of 2025):

- 10 GB storage
- 1,000,000 Class A ops/month (uploads, lists)
- 10,000,000 Class B ops/month (reads via API)
- **Zero egress fees** — public reads via the public bucket URL or a custom domain are unlimited and free

The full Yu-Gi-Oh card set is roughly 1.5–2 GB of JPEGs, so you stay well inside the free tier.

---

## 1. Create a Cloudflare account

If you don't have one, sign up at https://dash.cloudflare.com/sign-up. No credit card required for the free R2 tier (you'll be asked to enable the R2 service, which is free as long as you stay inside the limits).

## 2. Enable R2

1. In the Cloudflare dashboard left sidebar, click **R2 Object Storage**.
2. Click **Enable R2**. You'll be asked to add a payment method — required by Cloudflare even for the free tier as a fraud-prevention measure. You won't be charged unless you exceed the limits.

## 3. Create a bucket

1. Click **Create bucket**.
2. Name: `trademarket-cards` (or whatever you want — just remember it).
3. Location: **Automatic** is fine.
4. Click **Create bucket**.

## 4. Make the bucket publicly readable

You have two options. Pick one.

### Option A — Use the `r2.dev` public URL (easiest)

1. Open your bucket → **Settings** tab.
2. Under **Public access** → **R2.dev subdomain**, click **Allow Access**.
3. Confirm. You'll get a URL like `https://pub-abc123def456.r2.dev`.
4. Copy that URL — this is your `VITE_R2_CARDS_BASE` (you'll append `/cards` to it).

This subdomain is rate-limited and not meant for high-volume production traffic, but for a personal/portfolio project it's fine.

### Option B — Custom domain (recommended for production)

1. You need a domain on Cloudflare DNS (free — you can transfer or add an existing domain).
2. Bucket → **Settings** → **Custom Domains** → **Connect Domain**.
3. Enter e.g. `cards.yourdomain.com`. Cloudflare auto-creates the DNS record and proxies it.
4. After ~1 minute it's live. Use `https://cards.yourdomain.com` as your base URL.

No rate limit, full Cloudflare CDN caching, and free.

## 5. Create an API token for uploads

This is the credential the sync script uses to write to R2.

1. Cloudflare dashboard → **R2** → **Manage R2 API Tokens** (top right).
2. Click **Create API token**.
3. Token name: `trademarket-cards-upload`.
4. Permissions: **Object Read & Write**.
5. Specify bucket: select `trademarket-cards`.
6. TTL: leave as forever (or set if you want).
7. Click **Create API Token**.

You will be shown:

- **Access Key ID**
- **Secret Access Key**
- **Endpoint** (looks like `https://<account-id>.r2.cloudflarestorage.com`)

**Copy all three immediately** — the secret is shown only once. Also note your **Account ID** (visible in the URL bar or in any R2 settings page).

## 6. Set environment variables

For local runs, create `.env` in the project root (already gitignored):

```bash
# R2 credentials (server-side only — never commit these)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=trademarket-cards

# Public base URL for the frontend (safe to commit/expose)
VITE_R2_CARDS_BASE=https://pub-abc123def456.r2.dev
```

For GitHub Actions (the recurring sync), add the same `R2_*` variables as **repository secrets** at:
`Your repo → Settings → Secrets and variables → Actions → New repository secret`.

For Vercel, add `VITE_R2_CARDS_BASE` under
`Project → Settings → Environment Variables`. The build will pick it up.

## 7. Run the one-time bulk upload

This pushes every JPEG already in `src/assets/Cards/` to R2:

```bash
npm install
npm run cards:bulk-upload
```

Expect ~10–20 minutes for ~13k cards depending on your upload speed. Safe to interrupt and re-run — it skips files already in R2.

## 8. Test the public URL

Open in a browser:

```
https://pub-abc123def456.r2.dev/cards/89943723.jpg
```

(Use any card ID you have.) You should see the Blue-Eyes White Dragon image.

## 9. Run the API sync

This fetches the full card list from YGOPRODeck and uploads only the missing ones. After the bulk upload, this should be near-instant on the first run, then 0–50 cards per run after Konami releases new sets.

```bash
npm run cards:sync
```

## 10. Schedule it

The included GitHub Actions workflow at `.github/workflows/sync-cards.yml` runs `cards:sync` every Monday at 03:00 UTC. As long as you've added the `R2_*` secrets in step 6, it'll run on its own.

## 11. Switch the frontend over

After the bulk upload finishes and `VITE_R2_CARDS_BASE` is set in `.env`, the frontend already uses the helper in `src/lib/cardImage.js` and will load from R2 automatically. You can delete `src/assets/Cards/` from the repo and free up a couple GB:

```bash
git rm -r src/assets/Cards
git commit -m "Move card assets to Cloudflare R2"
```

(Keep the Python script and the PHP cache around in `src/scripts/` if you want — they're harmless.)

---

## Cost ceiling sanity-check

If TradeMarket somehow gets traffic that blows past the free tier:

- 10 GB storage → after that, $0.015/GB-month. 50 GB = $0.60/mo.
- Class B reads (image GETs) free up to 10M/month → after that $0.36 per million.

Even at heavy traffic you're looking at single-digit dollars per month. There is no egress charge ever.
