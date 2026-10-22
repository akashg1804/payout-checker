# AFTER.: instructions for Claude Code

## What this is
AFTER. ("from payout statement to decision") is for small restaurant and cloud-kitchen owners in India. The owner adds a **Swiggy payout statement (.xlsx)** and, optionally, a **Zomato business report (.csv)**, plus two typed numbers (food cost %, Zomato commission %). It shows what they kept per ₹100, three decisions (coupons, platforms, timing), what to test next, what to ask Swiggy about with a drafted message, and a saved history of past payouts. Live at https://payout-checker.vercel.app (Vercel deploys `master`).

## Pages
- `/` = `public/index.html`: the story page (problem, answer, "Enter demo"). Inline styles; reads no files.
- `/demo` = `public/demo.html`: the working app. Loads `core.js` and `app.js`. Made-up demo data or the owner's own files. Shows the result, the three decision cards, questions for Swiggy, and **Save this payout**.
- `/actions` = `public/actions.html`: what to do next, built from `localStorage.after_current`.
- `/insights` = `public/insights.html`: payout memory, built from `localStorage.after_payouts`.
- `/app` and `/app.html` redirect to `/` (`vercel.json`). The old `app.html` is deleted; `memory.js`, `style.css` and `fonts/` belonged to it and are not loaded by any current page.

## Code
- `public/core.js`: parsing and analysis. Pure functions, no DOM. `parseWorkbook(wb)` then `analyze(data)`; `parseZomatoCsv` / `parseZomato`.
- `decide()` in `core.js`: all decision maths (coupon break-even, per-order comparison, break-even commission).
- `advise()` in `core.js`: rules that pick Do / Measure / Stop per decision. `checkText()`: the number checker every AI reply must pass.
- `public/app.js`: the `/demo` screen, sample data, error messages, saving to `localStorage`, and `askClaude(task, payload)` / `phraseBoard()`.
- `api/claude.js`: Vercel serverless function for the optional AI wording, via `OPENROUTER_API_KEY` or `GEMINI_API_KEY`. Builds the prompt from a task name (`phrase`, `draft`); never accepts a raw prompt. With no key it returns 503 and the pages use plain wording, so everything must keep working without it.
- `scripts/dev.js`: local server (`npm run dev`, `--fake=bad|good|junk|slow|down` to test fallbacks). It does not apply `vercel.json` redirects.
- `tests/core.test.js`: `npm test`. Fixtures are built in memory. `tests/memory.test.js` is stale: `scripts/load-core.js` no longer loads `memory.js`, so it fails if run. One `core.test.js` test still expects the headline wording from before commit `9c3bf74`.
- `scripts/check.js`: `npm run check -- path/to/statement.xlsx [zomato.csv] [food%] [commission%]`.

## Rules (do not break these)
1. **Arithmetic stays in code, not in the model.** Recomputing deductions, totals and flags is deterministic. The AI only re-words advice and drafts messages.
2. **Never say "overcharged" or "wrong".** Use "worth checking", "unexplained" or "doesn't recompute". A mismatch is not proof of an error.
3. **Use only numbers computed from the file.** Never invent figures, causes or rules. Insights show what happened, not why, and note how few orders they rest on.
4. **Privacy.** Files are read in the browser and never uploaded. Only summary numbers go to the AI, and order IDs only when the owner asks for a drafted message. Never commit real statements (`*.xlsx` and `*.csv` are git-ignored). Never log file contents.
5. **No platform logins, scraping or automatic contact with Swiggy or anyone else.** The owner sends messages themselves.
6. **Zomato is a business report, not a payout statement.** It has no commission or fees, so Zomato take-home is always an estimate from the commission the owner enters. Label it as an estimate everywhere.
7. **Check labels by arithmetic.** The Zomato report can have swapped labels (orders and sales). `parseZomatoCsv` detects this by testing discount / offer-sales against the stated effective discount.

## Memory rules
- Memory is `localStorage` on the owner's device only: `after_current` (latest result, for `/actions`) and `after_payouts` (history, up to 12, for `/insights`).
- It holds **dates and totals** (plus advice headlines and the decision text). **Never store order rows, order IDs, names or anything about customers.**
- Known gaps, keep them in the README limits until fixed: no delete button; `after_current` is written automatically; demo results can be saved into the real history; `/insights` compares kept per ₹100 only and ignores period length.

## Known facts about the Swiggy file format
Sheets: `Payout Breakup` (summary), `Order Level` (header row has "Order ID"; 54 columns), `Growth Investment Other Charges` (ads and adjustments, can be empty), `Discount Summary` (coupon rules and totals). Commission is a % of the bill after discounts. GST on Swiggy's fees is 18% of the fees. Column labels can change, so match headers by name, not position, and stop with a clear message if the totals don't reconcile.

## Next steps (in priority order)
1. A delete button for memory, and keep demo data out of the real history.
2. A second real statement to test parsing on another outlet.
3. Period-aware comparisons in `/insights`, and Zomato in the memory.
4. A language picker on `/demo` (the Hindi and Kannada code exists but isn't reachable).

## Style
Plain language for non-technical owners. Don't add dependencies without a reason.
