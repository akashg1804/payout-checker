# AFTER.: instructions for Claude Code

## What this is
AFTER. ("from payout statement to decision") is for small restaurant and cloud-kitchen owners in India. The owner adds a **Swiggy payout statement (.xlsx)** and, optionally, a **Zomato business report (.csv)**, plus two typed numbers (food cost %, Zomato commission %). It shows what they kept per ₹100, three decisions (coupons, platforms, timing), what to test next, what to ask Swiggy about with a drafted message, and a saved history of past payouts. Live at https://payout-checker.vercel.app (Vercel deploys `master`).

## Pages
- `/` = `public/index.html`: a one-line redirect to `/demo`. The old story page is gone.
- `/demo` = `public/demo.html`: the working app. It opens with the demo already run. Loads `core.js` and `app.js`. Tabs: Analysis, Flags, Insights (the orders chart, weekly for long statements and daily for a one-week payout, price points and distance are under Insights). Made-up demo data (a Sample menu of four separate one-week payouts, Mon to Sun, that tell one story: 20% coupon, coupon halved, coupons off, small coupon back; "Save all four demo weeks" fills the Memory page) or the owner's own files. Has the break-even meter, a demo guide, an Ask box, and **Save this payout**.
- `/actions` = `public/actions.html`: what to do next, built from `localStorage.after_current`.
- `/insights` = `public/insights.html`: payout memory, built from `localStorage.after_payouts`.
- `/app` and `/app.html` redirect to `/` (`vercel.json`). The old `app.html` is deleted; `memory.js`, `style.css` and `fonts/` belonged to it and are not loaded by any current page.

## Code
- `public/core.js`: parsing and analysis. Pure functions, no DOM. `parseWorkbook(wb)` then `analyze(data)`; `parseZomatoCsv` / `parseZomato`.
- `decide()` in `core.js`: all decision maths (coupon break-even, per-order comparison, break-even commission).
- `advise()` in `core.js`: rules that pick Do / Measure / Stop per decision. `checkText()`: the number checker every AI reply must pass.
- `public/app.js`: the `/demo` screen, sample data, error messages, weeks section, break-even meter, saving to `localStorage`, and `askClaude(task, payload)` / `phraseBoard()`. `leaveDemo()`: loading a real file clears all demo data, so made-up numbers never sit beside real ones.
- `public/memory-sync.js` + `public/supabase-config.js` + `supabase/schema.sql`: optional email sign-in and cloud copy of memory. The config holds only a publishable key (safe in the browser); never put a secret or service-role key there. The table has row-level security per user.
- `api/claude.js`: Vercel serverless function for the optional AI wording, via `OPENROUTER_API_KEY` or `GEMINI_API_KEY`. Builds the prompt from a task name (`phrase`, `draft`); never accepts a raw prompt. With no key it returns 503 and the pages use plain wording, so everything must keep working without it.
- `scripts/dev.js`: local server (`npm run dev`, `--fake=bad|good|junk|slow|down` to test fallbacks). It does not apply `vercel.json` redirects.
- `tests/core.test.js`: `npm test` (14 tests). Fixtures are built in memory. `tests/memory.test.js` is stale: `scripts/load-core.js` no longer loads `memory.js`, so it fails if run. `ordersTrend()` and `couponEarn()` in `core.js` are the week-by-week and break-even-meter maths, both tested.
- `scripts/check.js`: `npm run check -- path/to/statement.xlsx [zomato.csv] [food%] [commission%]`.

## Rules (do not break these)
1. **Arithmetic stays in code, not in the model.** Recomputing deductions, totals and flags is deterministic. The AI only re-words advice and drafts messages.
2. **Never say "overcharged" or "wrong".** Use "worth checking", "unexplained" or "doesn't recompute". A mismatch is not proof of an error.
3. **Use only numbers computed from the file.** Never invent figures, causes or rules. Insights show what happened, not why, and note how few orders they rest on.
4. **Privacy.** Files are read in the browser and never uploaded. Only summary numbers go to the AI, and order IDs only when the owner asks for a drafted message. Never commit real statements (`*.xlsx` and `*.csv` are git-ignored). Never log file contents.
5. **No platform logins, scraping or automatic contact with Swiggy or anyone else.** The owner sends messages themselves.
6. **Zomato is a business report, not a payout statement.** It has no commission or fees, so Zomato take-home is always an estimate from the commission the owner enters. Label it as an estimate everywhere.
7. **Never mix demo and real data.** Real files replace the demo completely (`leaveDemo()`); a made-up Zomato report must never be compared with a real Swiggy statement.
8. **Check labels by arithmetic.** The Zomato report can have swapped labels (orders and sales). `parseZomatoCsv` detects this by testing discount / offer-sales against the stated effective discount.

## Memory rules
- Memory is `localStorage` on the owner's device by default: `after_current`, `after_payouts`, plus `after_profile`, `after_test` and `after_tests`. With the optional Supabase sign-in the same keys sync to the owner's own account. Nothing else is uploaded.
- It holds **dates and totals** (plus advice headlines and the decision text). **Never store order rows, order IDs, names or anything about customers.**
- Known gaps, keep them in the README limits until fixed: `after_current` is written automatically; demo results can be saved into the real history (marked as demo); `/insights` compares kept per ₹100 only and ignores period length. `/insights` has delete, backup, restore and Clear all memory.

## Known facts about the Swiggy file format
Sheets: `Payout Breakup` (summary), `Order Level` (header row has "Order ID"; 54 columns), `Growth Investment Other Charges` (ads and adjustments, can be empty), `Discount Summary` (coupon rules and totals). Commission is a % of the bill after discounts. GST on Swiggy's fees is 18% of the fees. Column labels can change, so match headers by name, not position, and stop with a clear message if the totals don't reconcile.

## Next steps (in priority order)
1. Test the Supabase email sign-in end to end, and check its redirect URL list includes the live site.
2. A second real statement to test parsing on another outlet.
3. Period-aware comparisons in `/insights`, and Zomato in the memory.
4. Period-aware comparisons beyond kept per ₹100 on `/insights`; Zomato in the memory.

## Style
Plain language for non-technical owners. Don't add dependencies without a reason.
