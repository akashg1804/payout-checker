# Payout Checker: instructions for Claude Code

## What this is
A decision board for small restaurant and cloud-kitchen owners in India. The owner adds a **Swiggy payout statement (.xlsx)** and a **Zomato business report (.csv)**, plus two typed numbers (food cost %, Zomato commission %). The page shows three decisions: Swiggy coupon break-even, which app leaves more per order, and when to push. A side panel lists what to ask Swiggy about and drafts a message.

## Structure
- `public/index.html`: markup and styles (light and dark mode).
- `public/core.js`: parsing and analysis. Pure functions, no DOM. `parseWorkbook(wb)` then `analyze(data)`.
- `public/app.js`: UI rendering (the board), sample data, error messages, and `askClaude(task, payload)` / `phraseBoard()`.
- `advise()` in `core.js`: rules that pick Do / Measure / Stop per decision. `checkText()`: the number checker every Claude reply must pass.
- `decide()` in `core.js`: all decision maths (coupon break-even, per-order comparison, break-even commission).
- `api/claude.js`: Vercel serverless function that calls the Anthropic API. Builds the prompt from a task name (`phrase`, `draft`); never accepts a raw prompt. Needs `ANTHROPIC_API_KEY` (locally in `.env.local`). If it is missing the page falls back to plain templates, so the app must keep working without it.
- `scripts/dev.js`: local server, `npm run dev -- --fake=bad|good|junk|slow|down` to test fallbacks without a key.
- `tests/core.test.js`: `npm test`. Fixtures are built in memory.
- `scripts/check.js`: run `npm run check -- path/to/statement.xlsx` to print the analysis.

## Rules (do not break these)
1. **Arithmetic stays in code, not in the model.** Recomputing deductions, totals and flags is deterministic. Claude is only used to explain, draft messages and phrase ideas.
2. **Never say "overcharged" or "wrong".** Use "worth checking", "unexplained" or "doesn't recompute". A mismatch is not proof of an error.
3. **Use only numbers computed from the file.** Never invent figures, causes or rules. Insights show what happened, not why, and always note how few orders they rest on.
4. **Privacy.** Files are read in the browser and never uploaded. Only summary numbers go to Claude, and order IDs only when the user asks for a drafted message. Never commit real statements (`*.xlsx` and `*.csv` are git-ignored). Never log file contents.
5. **No platform logins, scraping or automatic contact with Swiggy or anyone else.** The owner sends messages themselves.
6. **Zomato is a business report, not a payout statement.** It has no commission or fees, so Zomato take-home is always an estimate from the commission the owner enters. Label it as an estimate everywhere. Never present assumed commission or food cost as fact.
7. **Check labels by arithmetic.** The Zomato report can have swapped labels (orders and sales). `parseZomatoCsv` detects this by testing discount / offer-sales against the stated effective discount.

## Known facts about the Swiggy file format
Sheets: `Payout Breakup` (summary), `Order Level` (header row has "Order ID"; 54 columns), `Growth Investment Other Charges` (ads and adjustments, can be empty), `Discount Summary` (coupon rules and totals). Commission is a % of the bill after discounts. GST on Swiggy's fees is 18% of the fees. Column labels can change, so match headers by name, not position, and stop with a clear message if the totals don't reconcile.

## Next steps (in priority order)
1. A second real statement to test parsing on another outlet.
2. Week-by-week history across several statements (repeat charges, rate changes).
3. Zomato parser.
4. A case tracker for questions sent to Swiggy.

## Style
Plain language for non-technical owners. Keep English, Hindi and Kannada output understandable. Don't add dependencies without a reason.
