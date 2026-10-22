# Payout Checker

A decision board for small restaurant and cloud-kitchen owners who sell on Swiggy and Zomato.

Add your **Swiggy payout statement** (.xlsx) and your **Zomato business report** (.csv). You get three decisions:

1. **Are my Swiggy coupons worth it?** How many coupon orders must have been *extra* for the coupons to break even, given your food cost.
2. **Which app leaves me more per order?** Swiggy comes from the payout statement. Zomato's take-home is estimated from the commission you enter, because the Zomato report has no commission or fees.
3. **When should I push?** Orders by time of day on both apps.

A section lists what to ask Swiggy about (coupon cost, coupon orders at the stated minimum, cancellation charges, repeated ad charges) and drafts a message you send yourself.

**It remembers.** Save a payout and the page keeps a small summary on your device. Add the next statement and it shows **what changed** (sales, orders, coupons you funded, how much of every ₹100 you kept, net per order), which cost moved most, and whether last time's coupon decision **worked**.

Files are read in the browser and never uploaded.

## How memory works
- After an analysis, **Save this payout** stores a summary in this browser's local storage: dates, sales, orders, coupon cost, how much of each ₹100 went where, net payout, and the coupon decision. **No order rows, order IDs or customer details are stored.**
- The next statement is compared with the latest saved one that ended before it began. If the two cover different numbers of days, totals are shown per week.
- "Did it work?" is read from the two statements (coupon funding per week, orders per week against the limit in the advice). The owner does not have to say what they did, and the page says other things changed too.
- **Delete my history** clears it. Saving the same period twice replaces it. Nothing leaves the device.
- **Try the demo** walks through two made-up payouts, one after the other: August is saved, then September arrives and the page shows what changed and whether the coupon advice worked. It uses a separate store that lives in the tab only, so made-up data never reaches a real history.

## Job to be done
When I get my Swiggy payout and Zomato report, I want to see what I actually keep and which discounts and apps are worth it, so I can make better decisions in minutes instead of spending 1-1.5 hours a week (one owner's estimate).

## Current workflow -> future workflow
Today: download the reports, check lines by hand, guess whether coupons and ads are worth it, raise a ticket if something looks off.
With this: upload two files, enter food cost and commission, read three decisions and what to try next. Hand-checking disappears. The owner still decides and sends any message.

## Architecture: Input -> AI -> Logic -> Action -> Output
- **Input:** the two files, read in the browser (SheetJS), plus two numbers the owner types (food cost %, Zomato commission %). A saved summary of earlier payouts, if the owner chose to keep one, is read from local storage.
- **AI model:** explains the decisions in English, Hindi or Kannada and drafts the support message. It sees only summary numbers.
- **Logic (plain code):** compares with the last saved payout and decides whether last time's coupon advice worked (`memory.js`), recomputes every deduction, flags unusual items, computes coupon break-even and the per-order comparison, and checks the Zomato report's swapped labels by testing the arithmetic.
- **Action:** shows the board; the owner copies a drafted message and sends it through Swiggy's own channel.
- **Output:** three decisions, each with the evidence and a "try next" experiment.

## What stays human
Whether coupons really brought extra orders, the real commission and food cost, and sending any message.

## Why AI here, and why not more
Arithmetic must be exact, so it is code. AI is used where wording and judgement matter: plain-language explanation in the owner's language and a drafted message. The Zomato report's labels can be wrong (orders and sales swapped); code detects this by checking the discount arithmetic.

## Failure cases
1. A wrong file gives a clear error and no numbers.
2. Zomato figures are estimates: if the commission entered is wrong, the comparison moves. The board says so and shows the break-even commission.
3. A mismatch flag is a question, never a claim of wrongdoing. The owner checks before sending anything.

## Limits
One outlet, one month, Swiggy payout plus Zomato report only. No evidence yet that owners will pay. Zomato take-home is estimated, and the board leaves out gateway fees and TDS on Zomato.

## What's next
A menu with cost per portion, or monthly purchase bills, to replace the typed food cost; Zomato in the memory (its report has no period label yet); outcome tracking for the platform and timing decisions, not only coupons; an optional cloud copy with sign-in, if owners want history across devices; and dish-level profit if an item-level export is available. Zomato only sends the business report, so its commission stays an estimate (shown as a range).

## Files
`public/index.html` (the home page that explains the product), `public/app.html` (the app: files, board, demo), `style.css`, `core.js` (parsing, maths, advice, number checker), `memory.js` (summaries, comparison, verdict), `app.js` (screens), `api/claude.js` (server function for the AI wording), `tests/` (22 tests, `npm test`). Fonts (Bricolage Grotesque, Source Serif 4) are self-hosted under the SIL Open Font License.

## The flow
Home (`/`) explains the product and has two buttons: **Try the demo** (`/app?demo=1`, which starts the two-payout demo) and **Use my own files** (`/app#files`, which opens the file panel). The app (`/app`) reads the files, shows the board, and keeps the saved-payouts rail.

## Run locally
    npm install
    npm run dev                      # http://localhost:3000 (uses GEMINI_API_KEY / OPENROUTER_API_KEY from .env.local if present)
    npm run dev -- --fake=bad        # fake AI that invents a number: the checker must catch it
                                     # other modes: good, junk, slow, down
    npm test                         # parsing, decisions, advice rules, number checker, wrong files
    npm run check -- path/to/swiggy.xlsx path/to/zomato.csv 35 20

Copy `.env.example` to `.env.local` and add your key. `.env.local` is git-ignored. Keep real statements outside this folder.

## How the advice works
`advise()` in core.js picks Do / Measure / Stop for each decision from computed numbers. The AI model only re-words it in English, Hindi or Kannada. `checkText()` then checks every number in the AI model's text against the data it was given (Hindi and Kannada digits and Indian commas included). Any block that fails, uses a banned word, or comes back incomplete shows the plain version with a note. If the AI model is unavailable or takes more than 12 seconds, the board stays in plain English.

**Not verified yet:** the AI model's Hindi and Kannada wording has never been run against the real API, because no API key was available during the build. The number checker and the fallback were tested with the fake AI modes (`npm run dev -- --fake=bad`) on a real statement. **Without a key, the page shows the advice in plain English** and says so at the top of the board, whichever language is picked.

## Deploy (Vercel)
Push to GitHub, import the repo in Vercel, deploy. For the AI wording buttons add `GEMINI_API_KEY / OPENROUTER_API_KEY` (optional; without one of these keys the page uses plain templates).
