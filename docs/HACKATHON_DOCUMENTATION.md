# AFTER. — Hackathon Documentation

## Problem
Restaurant owners receive payout statements from delivery platforms packed with commissions, discounts, fees, taxes and order-level rows. The payout tells them what was paid, but not clearly why they kept it or what they should change next.

## Solution
AFTER. turns an existing payout statement into a simple decision loop:

**Payout → Understand → Decide → Test → Next payout → Learn**

The prototype reads the Swiggy payout and optional Zomato business report in the browser, performs deterministic calculations, highlights the largest economic levers, and produces three practical decisions: what to change, what to measure, and when to stop/reverse the experiment.

## Product flow
1. **Landing:** five spreadsheet-style sheets appear together as the visual metaphor for payout noise. As the user scrolls, they are thrown off-screen; the problem then resolves into a simple Apple-style explanation of why a payout is hard to act on.
2. **Problem:** the owner sees that sales are not the same as take-home.
3. **Solution:** AFTER. reduces the statement to three answers — what you kept, what to do, and what to learn next.
4. **Demo:** the first action is a guided demo with made-up data. Uploading a real statement is deliberately secondary so the first-run experience is not cluttered.
5. **Decision board:** the result prioritises three clickable cards — coupons, platforms and timing. Each card expands only when the owner wants the numbers behind the conclusion. The full audit trail is tucked away below the decision layer.
6. **Memory:** a payout can be saved locally so the next payout can compare against the previous decision.

## Technical architecture
- **Frontend:** HTML, CSS, JavaScript
- **Spreadsheet parsing:** SheetJS (`xlsx`) in the browser
- **Decision logic:** deterministic JavaScript in `public/core.js`
- **AI:** optional Claude endpoint in `api/claude.js` for rewording advice and drafting support messages
- **Memory:** browser `localStorage` for the prototype
- **Deployment:** Vercel

## Why AI is used
AI is deliberately not responsible for arithmetic. The app calculates the numbers in code first. Claude is used for language: making the conclusions easier to understand and drafting a support message. A number checker rejects AI wording if it introduces unsupported numbers.

## Proof of concept
The current prototype demonstrates the complete core loop with sample/real payout files: parse → calculate → explain → recommend → save → compare on the next payout.

## Current limitations
- Prototype is designed around one outlet and a monthly payout.
- Zomato take-home is an estimate because the available business report does not contain all required fee information.
- Memory is local to the browser in the POC.
- No claim is made that coupon orders were truly incremental; the app provides a break-even threshold and a test recommendation.

## Future
- Persistent database-backed payout history.
- Multi-outlet history and benchmarking.
- Menu-level food-cost integration.
- Automatic month-over-month experiments and outcome tracking.
- More platform integrations.
