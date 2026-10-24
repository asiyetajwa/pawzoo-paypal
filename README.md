# Pawzoo

A pet-care agent that watches your dog's day on your home cameras, notices when food is running low, and pays for refills and walks with PayPal, but only after you approve the exact total on PayPal. Every payment leaves an itemized receipt for that pet.

Built on Pawzoo, a pet-care agent we made earlier this year. New for this edition: PayPal payments, owner approval on PayPal, receipts per pet, and tips.

## The trust rule

Pawzoo never pays on its own.

1. **It proposes.** "Hearth & Hound Salmon & Rice, 24 lb bag, is $58.99, plus a $3.00 tip for the driver: $61.99 in all, paid with PayPal. Shall I set it up?"
2. **You say yes.** Pawzoo creates a PayPal order for exactly those lines and hands you PayPal's approval link. No money moves.
3. **You approve on PayPal.** The same checkout PayPal shows any buyer, with the items and the tip listed.
4. **Pawzoo captures, and checks first.** It asks PayPal for the order again and captures only if PayPal reports it `APPROVED` for exactly the quoted total. A cancelled order is never charged, and an order is captured once.
5. **The receipt.** It lists the items, the tip, the total, the PayPal transaction id and the date. For food, it also shows when the bag arrives, how long a bag lasts at her current rate, and her next predicted run-out.

Receipts are kept per pet, so the history shows the loop working week after week: every refill, every walk, every tip.

## What Pawzoo does

- **Knows the dog's day** from home camera events: the walk (checked against what the front door camera saw), meals, naps, zoomies, and anyone leaving the house alone.
- **Forecasts food** from the bag size and how much she eats, and updates it when you say "she's on two and a half cups a day now".
- **Pays with PayPal:**
  - food refills, with an optional tip for the delivery driver;
  - the dog walker, with an optional tip, one approval and one capture covering both.
- **Books care,** such as grooming, vet check-ups and extra walks, paid at the visit.
- **Shows it on the TV:** the day reel, a moment, or an alert.

## How it uses PayPal

- **PayPal Agent Toolkit** (`@paypal/agent-toolkit`, TypeScript): Pawzoo's `create_paypal_order`, `capture_paypal_order` and order checks call the toolkit's `create_order`, `get_order` and `pay_order` (Orders v2), in the **sandbox**.
- **Line items, not a lump sum:** the food and the tip are separate lines on the PayPal order, the PayPal checkout and the receipt.
- **Owner approval on PayPal:** the order carries a return and cancel URL; PayPal sends the person back to Pawzoo, which then verifies and captures.
- **Offline stand-in:** without PayPal credentials, a clearly labelled stand-in plays PayPal's approval page with the same rules and no money, so anyone can run the demo.

## The MCP server

Pawzoo is an MCP server (Streamable HTTP, spec 2025-11-25) that any MCP host can use. Each tool returns a line to speak and an MCP Apps card.

| Tool | What it does |
|---|---|
| `get_pet_day`, `find_moment`, `play_on_tv`, `get_alerts`, `resolve_alert` | The dog's day from the cameras |
| `check_food`, `remember` | The food forecast, and facts the family tells Pawzoo |
| `propose_reorder` | A food refill with the exact price and an optional tip. Buys nothing |
| `get_walk_report`, `quote_walk_payment` | The walk as the camera saw it, and a payment quote with an optional tip |
| `create_paypal_order` | After a yes: a PayPal order for exactly the quoted lines, and PayPal's approval link |
| `capture_paypal_order` | After approval on PayPal: verify, capture, write the receipt |
| `order_receipt` | The pet's receipts, newest first |
| `find_care_slots`, `quote_booking`, `confirm_action` | Bookings, paid at the visit |

`skill/pawzoo/SKILL.md` tells an assistant how to use these tools.

The included simulator is a real MCP client: a screen-style assistant that picks tools with Claude Haiku 5.5 (or offline rules) and renders the cards.

## Run it

```bash
npm run setup        # installs and builds
npm start            # http://127.0.0.1:8787  (the simulator), /tv.html (the TV view), /mcp (the MCP endpoint)
npm test
```

Copy `.env.example` to `.env` to add:
- **PayPal sandbox credentials:** without them, the offline stand-in runs.
- **An Anthropic API key with a spending cap** (`PAWZOO_BUDGET_USD`): without it, rules and templates answer. Every model call is priced before it is sent and refused past the cap.
- **A camera webhook secret** for real cameras: a camera bridge posts signed webhooks to `/camera/webhook`. Without it, Pawzoo replays a recorded day.

To try a payment: ask "We're almost out of kibble. Reorder a bag, with a $3 tip for the driver", say "yes", press **Approve on PayPal**, and log in as your sandbox buyer.

## Layout

- `server/src/paypal.ts`: PayPal through the Agent Toolkit, and the offline stand-in.
- `server/src/agent.ts`: the day, the food forecast, quotes, payments, receipts and cadence. Deterministic: models only phrase.
- `server/src/mcp.ts`: the MCP tools.
- `server/src/claude.ts`: Claude calls behind the spend cap.
- `server/src/camera.ts`: signed camera webhooks, live and replay.
- `server/views`: the MCP Apps card.
- `web/`: the simulator and the TV view.

## License

MIT
