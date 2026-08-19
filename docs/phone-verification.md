# Phone verification (trade gate)

One account per phone number, checked the first time somebody proposes or
accepts a trade. Signing up, browsing and building a collection are not gated:
none of them can hurt anybody, so putting an SMS in front of them would only
cost real signups.

**It ships switched off and does nothing until you complete step 1 and step 3.**

---

## Why it is off by default

Turning the gate on before an SMS provider is configured stops all trading with
no way for anybody to satisfy it — nobody can verify, so nobody can trade, and
the fix would need another deploy. The flag exists so that ordering mistake is
impossible.

## 1. Configure an SMS provider (only you can do this)

Supabase Dashboard → **Authentication → Providers → Phone**.

- Enable **Phone**.
- Pick a provider and paste its credentials: Twilio, Twilio Verify, MessageBird,
  Vonage, or Textlocal.
- Leave **"Enable phone confirmations"** on.
- You do **not** need "Enable phone signups" — this flow never signs anybody in
  by phone, it only attaches a number to an account that already exists.

Cost is per message and varies a lot by country: roughly US$0.01 in the US and
Canada, and often 4–8× that in parts of Europe. Budget for retries — people
mistype numbers and ask for a second code.

## 2. Test with one real number, gate still off

With the gate off the app never opens the dialog by itself, so check delivery
against the Auth API directly. The app does not expose its Supabase client on
`window`, so there is no console shortcut.

First, how many accounts are verified right now (expect 0 before you start):

```sql
select count(*) from auth.users where phone_confirmed_at is not null;
```

Sign in to the site, then copy your access token out of the browser console:

```js
JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth-token'))[1]).access_token
```

Attach a number to your own account, which sends a real SMS:

```bash
ANON=<your anon key>            # public, same one the app ships with
TOKEN=<the access_token above>

curl -X PUT 'https://sxteuctysfiwripnaozi.supabase.co/auth/v1/user' \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+33612345678"}'
```

Then confirm the code you receive:

```bash
curl -X POST 'https://sxteuctysfiwripnaozi.supabase.co/auth/v1/verify' \
  -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"type":"phone_change","phone":"+33612345678","token":"123456"}'
```

Re-run the count. If it is 1, delivery works.

If you would rather not do any of that: set the provider up, flip the gate on,
and use the app. The dialog does all of the above for you. The only reason this
section exists is to prove delivery works *before* the gate can block anybody.

## 3. Turn the gate on

```sql
update public.app_setting
   set value = 'true'::jsonb, updated_at = now()
 where key = 'phone_gate_enabled';
```

Effective immediately, no deploy. To turn it back off, same statement with
`'false'::jsonb`.

## What being on actually does

| Action | Gated |
|---|---|
| Sign up, browse, add cards, onboarding | no |
| Propose a trade | **yes** |
| Counter-offer (creates a new trade) | **yes** |
| Accept a trade | **yes** |
| Edit a proposal that already exists | no |
| Decline, cancel, complete | **no** — deliberately |

Declining, cancelling and completing are how somebody gets *out* of a trade. A
person who cannot leave a trade is worse off than one who could never enter it,
so those stay open regardless.

## Where the gate actually lives

`supabase/migrations/20260818_phone_gate_trading.sql` — a trigger on the
`Trade` table, not a check inside the RPCs.

`create_trade_proposal` and `update_trade_proposal` each have **two overloads**,
all `SECURITY DEFINER`. Gating "the" function would have left the other overload
callable directly with the public anon key, which is the API somebody motivated
enough to farm accounts would reach for. A trigger catches every path into the
table, including ones added later.

The frontend (`src/lib/phoneVerify.js`, `src/lib/phoneGate.js`,
`VerifyPhoneDialog.vue`) is the courteous half: it turns the server's refusal
into a dialog instead of a red error. It is **not** a security boundary — assume
the client is hostile; the trigger is what decides.

## Existing users

Everyone is treated the same. The 14 accounts that predate this will be asked to
verify at their next trade, which is their "first trade" under the new rule.
Nobody is locked out of anything they had already started: in-flight trades can
still be declined, cancelled and completed.

## What this does and does not buy you

It raises the cost of a throwaway account from zero to one working SIM. That
stops casual multi-accounting. It does **not** stop a determined attacker —
virtual and rented numbers exist, and some are cheap. Treat it as a speed bump
plus an audit trail, not a wall.

The gap it does not touch at all: there is still no way for somebody who *was*
defrauded to report it, and no queue for you to see it. Phone verification makes
accounts costlier to create; it does nothing to tell you when one misbehaves.
