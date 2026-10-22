# AFTER.

From payout statement to decision. For small restaurant and cloud-kitchen owners in India who sell on Swiggy and Zomato.

Add your **Swiggy payout statement** (.xlsx) and, if you have it, your **Zomato business report** (.csv). AFTER. shows what you kept from every ₹100, three things worth knowing (coupons, platforms, timing), what to test next, and what to ask Swiggy about. Files are read in your browser and never uploaded.

Live: https://payout-checker.vercel.app

## The pages
| Page | What it does |
|---|---|
| `/` (`public/index.html`) | The story: the problem (a payout full of numbers), the answer (see, decide, learn) and a link into the demo. No files are read here. |
| `/demo` (`public/demo.html`) | The working app. **Run the demo** uses made-up data; **Use it instead** reads your own Swiggy and Zomato files. Shows what you kept per ₹100, where the rest went, three decision cards (coupons, platforms, timing), what to ask Swiggy with a drafted message, and a **Save this payout** button. |
| `/actions` (`public/actions.html`) | What to do: six moves (coupons, platforms, timing, fees, measure, learn), using the headlines from the last result shown on `/demo` in this browser. One change at a time, then bring the next payout back. |
| `/insights` (`public/insights.html`) | Payout memory: the payouts you saved, newest first, with kept per ₹100, orders, the change since the previous one, and the decision you made. |

`/app` and `/app.html` (the old page) redirect to `/`.

## Memory: only dates and totals, on your device
Memory lives in this browser's `localStorage`. Nothing is sent anywhere.
- **`after_payouts`** (saved only when you press **Save this payout**, up to 12): the period dates, sales, payout, kept per ₹100, orders, coupon share and the decision text.
- **`after_current`** (written each time a payout is shown, so `/actions` can read it): the same kind of dates and totals, order counts per time of day, and the advice headlines.
- **Never stored:** order rows, order IDs, customer details or the files themselves.

## How it works
- **Input:** the files, read in the browser with SheetJS, plus two numbers you type (food cost %, Zomato commission %).
- **Logic (plain code, `core.js`):** recomputes every deduction, checks the statement's own arithmetic, stops with a clear message if totals don't reconcile, works out coupon break-even, Swiggy vs Zomato per order (Zomato is an estimate), and orders by time of day. `advise()` picks Do / Measure / Stop for each decision.
- **AI (optional, `api/claude.js`):** can re-word the advice and draft the support message. It sees only summary numbers. `checkText()` throws out any wording with a number that isn't in your data. Without a key, the pages use the plain wording.
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
- **Memory has no delete button yet.** To clear it, clear this site's data in your browser. It is per browser and per device, with no sync.
- `after_current` is written automatically whenever a result is shown; only the history (`after_payouts`) waits for **Save this payout**.
- Demo results can be saved into the same history as real ones.
- The comparison in `/insights` is simple (kept per ₹100 against the previous saved payout). It does not adjust for periods of different lengths, and Zomato is not in the memory.
- The pages have **no language picker**, so advice shows in English. The Hindi and Kannada wording code exists but is not reachable from the pages, and was never run against a real AI key.
- `public/memory.js`, `public/style.css` and `public/fonts/` belonged to the old `/app` page and are not loaded by the current pages. `tests/memory.test.js` no longer runs: the test loader stopped loading `memory.js` in commit `3dc37a8`.
- `npm test` currently has **1 failing test**: commit `9c3bf74` changed the headline to "You keep ₹… of every ₹100 sold on Swiggy." and the test still expects the old wording.

## What's next
A delete button for memory, a second real statement from another outlet, period-aware comparisons, Zomato in the memory, and a menu or purchase bills to replace the typed food cost.

## Run locally
    npm install
    npm run dev                      # http://localhost:3000 (pages are /, /demo, /actions, /insights)
    npm run dev -- --fake=bad        # fake AI that invents a number: the checker must catch it
                                     # other modes: good, junk, slow, down
    npm test                         # parsing, decisions, advice rules, number checker, wrong files
    npm run check -- path/to/swiggy.xlsx path/to/zomato.csv 35 20

The local server doesn't read `vercel.json`, so the `/app` redirect only works on Vercel. Keep real statements outside this folder (`*.xlsx` and `*.csv` are git-ignored).

## Deploy (Vercel)
Push to GitHub; Vercel deploys `master`. The AI wording is optional: set `OPENROUTER_API_KEY` or `GEMINI_API_KEY` in Vercel > Project > Settings > Environment Variables. Without one, the pages use plain wording.
