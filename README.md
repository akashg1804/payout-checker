# Payout Checker

A decision board for small restaurant and cloud-kitchen owners who sell on Swiggy and Zomato.

Add your **Swiggy payout statement** (.xlsx) and your **Zomato business report** (.csv). You get three decisions:

1. **Are my Swiggy coupons worth it?** How many coupon orders must have been *extra* for the coupons to break even, given your food cost.
2. **Which app leaves me more per order?** Swiggy comes from the payout statement. Zomato's take-home is estimated from the commission you enter, because the Zomato report has no commission or fees.
3. **When should I push?** Orders by time of day on both apps.

A side panel lists what to ask Swiggy about (coupon cost, coupon orders at the stated minimum, cancellation charges, repeated ad charges) and drafts a message you send yourself.

Files are read in the browser and never uploaded.

## Job to be done
When I get my Swiggy payout and Zomato report, I want to see what I actually keep and which discounts and apps are worth it, so I can make better decisions in minutes instead of spending 1-1.5 hours a week (one owner's estimate).

## Current workflow -> future workflow
Today: download the reports, check lines by hand, guess whether coupons and ads are worth it, raise a ticket if something looks off.
With this: upload two files, enter food cost and commission, read three decisions and what to try next. Hand-checking disappears. The owner still decides and sends any message.

## Architecture: Input -> AI -> Logic -> Action -> Output
- **Input:** the two files, read in the browser (SheetJS), plus two numbers the owner types (food cost %, Zomato commission %).
- **AI (Claude):** explains the decisions in English, Hindi or Kannada and drafts the support message. It sees only summary numbers.
- **Logic (plain code):** recomputes every deduction, flags unusual items, computes coupon break-even and the per-order comparison, and checks the Zomato report's swapped labels by testing the arithmetic.
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
A menu with cost per portion, or monthly purchase bills, to replace the typed food cost; several months of history; and dish-level profit if an item-level export is available. Zomato only sends the business report, so its commission stays an estimate (shown as a range).

## Run locally
    npm install
    npm run dev                      # http://localhost:3000 (uses ANTHROPIC_API_KEY from .env.local if present)
    npm run dev -- --fake=bad        # fake Claude that invents a number: the checker must catch it
                                     # other modes: good, junk, slow, down
    npm test                         # parsing, decisions, advice rules, number checker, wrong files
    npm run check -- path/to/swiggy.xlsx path/to/zomato.csv 35 20

Copy `.env.example` to `.env.local` and add your key. `.env.local` is git-ignored. Keep real statements outside this folder.

## How the advice works
`advise()` in core.js picks Do / Measure / Stop for each decision from computed numbers. Claude only re-words it in English, Hindi or Kannada. `checkText()` then checks every number in Claude's text against what Claude was sent (Hindi and Kannada digits and Indian commas included). Any block that fails, uses a banned word, or comes back incomplete shows the plain version with a note. If Claude is unavailable or takes more than 12 seconds, the board stays in plain English.

**Not verified yet:** Claude's Hindi and Kannada wording has never been run against the real API, because no API key was available during the build. The number checker and the fallback were tested with the fake Claude modes (`npm run dev -- --fake=bad`) on a real statement. **Without a key, the page shows the advice in plain English** and says so at the top of the board, whichever language is picked.

## Deploy (Vercel)
Push to GitHub, import the repo in Vercel, deploy. For the Claude buttons add `ANTHROPIC_API_KEY` (optional; without it the page uses plain templates).
