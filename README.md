# AFTER.

From payout statement to decision. For small restaurant and cloud-kitchen owners in India who sell on Swiggy and Zomato.

Add your **Swiggy payout statement** (.xlsx) and, if you have it, your **Zomato business report** (.csv). AFTER. shows what you kept from every ₹100, three things worth knowing (coupons, platforms, timing), what to test next, and what to ask Swiggy about. Files are read in your browser and never uploaded.

Live: https://payout-checker.vercel.app

## The pages
| Page | What it does |
|---|---|
| `/` (`public/index.html`) | Opens the workspace: a one-line redirect to `/demo`. |
| `/demo` (`public/demo.html`) | The working app. **Run the demo** uses made-up data (four separate one-week payouts you can pick from, and **Save all four demo weeks** fills the Memory page so it can show graphs and week-against-week changes); **Use it instead** reads your own Swiggy and Zomato files. Shows what you kept per ₹100, where the rest went, three decision cards (coupons, platforms, timing), what to ask Swiggy with a drafted message, and a **Save this payout** button. |
| `/actions` (`public/actions.html`) | What to do: six moves (coupons, platforms, timing, fees, measure, learn). Mark ?I started this? with a date and choose a measure; AFTER. compares the next full payout period with the saved baseline. |
| `/insights` (`public/insights.html`) | Payout memory: the payouts you saved, newest first, with kept per ₹100, orders, the change since the previous one, and the decision you made. |

`/app` and `/app.html` (the old page) redirect to `/`.

## Memory: local first, Supabase when configured
Memory is local by default. Optional Supabase sync stores the same compact summaries under the signed-in user account; order rows and customer details are never sent.
- **Business profile (`after_profile`):** restaurant/account, outlet, and main platform.
- **Current payout (`after_current`):** period, sample-data flag, totals, and computed summary metrics used by `/actions`.
- **Saved payouts (`after_payouts`, newest first, up to 50):** period, profile, sales, payout, kept per rupee 100, orders, week-by-week and price/distance summaries, deductions, arithmetic checks, typed assumptions, decision, and sample-data label. Saving the same period replaces the earlier entry.
- **Action memory (`after_test` / `after_tests`):** action, start date, measure, baseline, target, next saved payout, and comparison outcome. Up to 12 earlier tests are retained.
- **Manage it at `/insights`:** inspect and delete payouts or tests, download a JSON backup, restore a backup, or clear local memory. With Supabase configured, signed-in changes sync to the account.
- **Never stored:** order rows, order IDs, customer details or the files themselves. Demo data is marked and cannot produce a scored result against a real payout.

## How it works
- **Input:** the files, read in the browser with SheetJS, plus two numbers you type (food cost %, Zomato commission %).
- **Logic (plain code, `core.js`):** recomputes every deduction, checks the statement's own arithmetic, stops with a clear message if totals don't reconcile, works out coupon break-even, Swiggy vs Zomato per order (Zomato is an estimate), and orders by time of day. `advise()` picks Do / Measure / Stop for each decision.
- **AI (optional, `api/claude.js`):** can re-word the advice, answer questions about the computed payout, and draft the support message. It sees only summary metrics. `checkText()` throws out any wording with a number that isn't in your data. Without a key, the pages use the plain wording.
- **Action:** you decide, and you send any message to Swiggy yourself.

## What stays human
Whether coupons really brought extra orders, your real commission and food cost, and sending any message.

## Failure cases
1. A wrong file gives a clear error and no numbers.
2. Zomato figures are estimates: if the commission you enter is off, the comparison moves. The page shows the break-even commission.
3. A mismatch is a question to ask, never a claim of wrongdoing.

## Limits (honest)
- Tested on **one real Swiggy statement from one outlet**. No evidence yet that owners will pay.
- Zomato's report has no commission or fees, so Zomato take-home is always an **estimate**, and it leaves out gateway fees and TDS.
- **Memory is local unless you sign in.** By default it stays in this browser and device. If Supabase is configured and the owner signs in by email link, the same compact summaries sync to their account (see Supabase setup). That sign-in flow has not been tested end to end here, and the Supabase redirect URLs must include the live site. Use `/insights` to delete records, export a backup, restore one, or clear all memory.
- `after_current` is written automatically whenever a result is shown; only the history (`after_payouts`) waits for **Save this payout**.
- Demo results can be saved into the same history as real ones and are marked as demo data.
- The comparison in `/insights` is simple (kept per ₹100 against the previous saved payout). It does not adjust for periods of different lengths, and Zomato is not in the memory.
- **Languages (English, Hindi, Kannada) are built in** and switch the whole app from the picker in the header; the choice is remembered (`localStorage.after_lang`). The Hindi and Kannada wording was written by Claude and has **not been reviewed by a native speaker**. Payouts saved before this change keep their decision text in English. Drafted messages to Swiggy are always English. AI wording is still English-checked only: without a key the page shows the built-in wording. Run `npm run check:i18n` after changing any English text.
- `public/memory.js`, `public/style.css` and `public/fonts/` belonged to the old `/app` page and are not loaded by the current pages. `tests/memory.test.js` no longer runs: the test loader stopped loading `memory.js` in commit `3dc37a8`.

## Supabase setup
1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor. The table requires sign-in and applies row-level security so each user can access only their own memory.
2. Copy the Project URL and publishable key into `public/supabase-config.js`. The publishable key is intended for browser use; never put a secret/service-role key there.
3. In Supabase Auth, enable email sign-in and add your local and deployed `/insights.html` URLs to the allowed redirect URLs.
4. Open `/insights`, request an email sign-in link, then save or load a payout. Local memory merges with cloud memory on sign-in.

The live Supabase connection is optional until project credentials are configured.

## Run locally
    npm install
    npm run dev                      # http://localhost:3000, open /demo.html, /actions.html, /insights.html (the local server has no clean URLs, so /demo alone shows Not found)
    npm run dev -- --fake=bad        # fake AI that invents a number: the checker must catch it
                                     # other modes: good, junk, slow, down
    npm test                         # parsing, decisions, advice rules, number checker, wrong files
    npm run check -- path/to/swiggy.xlsx path/to/zomato.csv 35 20

The local server doesn't read `vercel.json`, so the `/app` redirect only works on Vercel. Keep real statements outside this folder (`*.xlsx` and `*.csv` are git-ignored).

## Deploy (Vercel)
Push to GitHub; Vercel deploys `master`. The AI wording is optional: set `OPENROUTER_API_KEY` or `GEMINI_API_KEY` in Vercel > Project > Settings > Environment Variables. Without one, the pages use plain wording.
