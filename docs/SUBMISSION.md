# Devpost Submission Draft

Copy each section into the Devpost form.
- **Hackathon:** PayPal AI Hackathon 2026.
- **Deadline:** November 12, 2026, 20:00 UTC (confirm on the official page).
- **Prize target:** Best Use of Agentic Commerce; also eligible for the grand prizes.

## Links

- **Demo video (YouTube, about 1:22):** to add once uploaded (file: `film/out/PawzooLandscape.mp4`, rendered from the repo).
- **Repository (public, MIT license):** https://github.com/asiyetajwa/pawzoo-paypal
- **Thumbnail:** `docs/thumbnail.jpg` (3:2) and `docs/thumbnail-youtube.jpg` (16:9).

The film shows real PayPal sandbox payments, approved by a sandbox buyer on PayPal's own checkout. The narration is an ElevenLabs voice.

## Project name

Pawzoo

## Tagline

A pet-care agent that pays for refills, walks and tips with PayPal, only after you approve the exact total on PayPal, and keeps a receipt for every pet.

## Built with

TypeScript, Node.js, Express, PayPal Agent Toolkit, PayPal Orders v2 (sandbox), Model Context Protocol, MCP Apps, Claude Haiku 5.5, Anthropic API, Remotion, Playwright, ElevenLabs

## Description

### Built on Pawzoo

Pawzoo started as a pet-care agent we made earlier this year: an MCP server that turns home camera events into a dog's day, with a simulator and interactive cards. It could quote an order, but it never moved money.

New for this entry:
- PayPal payments through PayPal's Agent Toolkit;
- the owner's approval on PayPal;
- verified capture;
- itemized receipts per pet, with tips;
- the receipt history.

The repository starts with one commit importing that base, and every commit after it is new work.

### Inspiration

Agents that buy things for you are only useful if you can trust them with your money. For a pet, the purchases are small and constant: food that runs out on a schedule, a walker to pay and tip every week. We wanted an agent that handles those, proposes each one with the exact price, never pays without you, and leaves a paper trail you can check.

### What it does

Pawzoo watches the dog's day on home cameras and keeps count of her food. When she is running low:
1. **It proposes.** "Hearth & Hound Salmon & Rice, 24 lb bag, is $58.99, plus a $3.00 tip for the driver: $61.99 in all, paid with PayPal. Shall I set it up?" Nothing is bought.
2. **You say yes.** Pawzoo creates a PayPal order through PayPal's Agent Toolkit, for exactly those line items. Still no money moves.
3. **You approve on PayPal,** in PayPal's own checkout.
4. **Pawzoo verifies, then captures.** It asks PayPal for the order again and captures only if PayPal reports it APPROVED for exactly the quoted total. A cancelled order is never charged; an order is captured once.
5. **The receipt:** the items, the tip, the total, the PayPal transaction id, the date, and for food the delivery date, how long a bag lasts at her current rate and her next predicted run-out.

Tips are line items on the same order: one approval, one capture, one receipt showing both lines, whether it is the delivery driver or the dog walker. Every receipt is kept per pet, so the history shows the loop working week after week.

### How we built it

- **An MCP server** (Streamable HTTP, spec 2025-11-25) with MCP Apps cards. Any MCP host can use it. The tools are:
  - `propose_reorder`, `quote_walk_payment`
  - `create_paypal_order`, `capture_paypal_order`
  - `order_receipt`
- **PayPal Agent Toolkit** (TypeScript): `create_order`, `get_order` and `pay_order` against Orders v2 in the sandbox, with return and cancel URLs back to Pawzoo.
- **Deterministic money logic:** quotes, line items, totals, the approval check and the receipts are plain code. The model, Claude Haiku 5.5, only picks tools and phrases answers, behind a spending cap enforced in code.
- **A simulator** that is a real MCP client, and an **offline stand-in for PayPal**: clearly labelled, same rules, no money, for running without credentials.
- **Tests** for the whole loop, including approval before capture, the exact-total check, cancellation and one-time capture.

### Challenges we ran into

- **PayPal's create response leaves out the amounts.** In our first live sandbox run, Pawzoo's own check refused to go ahead because the order total read as zero. The guard worked; we now read the order back from PayPal and verify its total before showing the approval link.
- **The toolkit wraps captures** as `{status, response}`, so our capture parser had to unwrap it.
- **Keeping the history honest.** Receipts survive the demo's daily reset, and every receipt in the film is a real sandbox capture with its PayPal transaction id.

### Accomplishments that we're proud of

- **An agent that cannot pay on its own.** It proposes, you approve on PayPal, and the capture is checked against the exact total.
- **Receipts a person can check:** the PayPal transaction id is on every one.
- **Tips as first-class line items,** for the delivery driver and the dog walker.

### What we learned

Agentic commerce is mostly about the boundary between "the agent decided" and "the person agreed". Putting that boundary on PayPal's own approval page, and checking it again before capture, made the agent simpler, not harder.

### What's next for Pawzoo

- Recurring refills on a predicted schedule, each one still approved by the owner.
- Refunds through the toolkit when a delivery goes wrong.
- More pets per household, each with its own receipts.
