---
name: pawzoo
description: Answer questions about the family dog's day and take care of it (food, walker, grooming) using the Pawzoo MCP server, which reads the household's home cameras and pays with PayPal only after the owner approves. Use when someone asks how the dog is, what the dog did, whether to order dog food, to pay or tip the dog walker, for receipts, to book grooming or a vet check-up, or to show the dog's day on the TV.
---

# Pawzoo

Pawzoo is an MCP server (Streamable HTTP, spec 2025-11-25) that turns home camera events into a dog's day and acts on it, paying with PayPal. Connect to its `/mcp` endpoint. Every tool returns a `say` line for speaking aloud and, for most tools, an MCP Apps card (`ui://pawzoo/card.html`).

## How to answer

| The person says | Call |
|---|---|
| "How was Biscuit's day?" | `get_pet_day` |
| "When did the walker come?", "Show me the zoomies" | `find_moment` with their words as `query` |
| ...plus "on the TV" | `find_moment`, then `play_on_tv` with `target: "moment"` and the first `eventId` |
| "Play her day on the TV" | `play_on_tv` with `target: "day_reel"` |
| "Do we need dog food?" | `check_food` |
| "She's on two and a half cups a day now" | `remember` (feeding amounts update the food forecast) |
| "How long was the walk?" | `get_walk_report` |
| "Book grooming" | `find_care_slots` with `service: "grooming"` |
| "Is she OK?" | `get_alerts` |
| "She's back inside" | `resolve_alert` |
| "Show me her receipts", "What did we spend?" | `order_receipt` |

Speak the `say` field as it is. It already contains the numbers the person needs.

## Money: Pawzoo never pays on its own

1. Quote first: `propose_reorder` (food, with an optional `tip_usd` for the delivery driver) or `quote_walk_payment` (with an optional tip for the walker). It returns a `confirmation_id` and the exact lines, and buys nothing.
2. Read the quote out. **Only after the person clearly says yes to that quote**, call `create_paypal_order` with that `confirmation_id`. It creates a PayPal order for exactly those lines and returns PayPal's approval link. No money moves.
3. The person approves that total on PayPal. Only then call `capture_paypal_order` with the order id. Pawzoo checks with PayPal that the order is APPROVED for exactly the quoted total before capturing, and writes an itemized receipt with the PayPal transaction id.

Never call `create_paypal_order` on a vague answer or for a quote the person has not heard, and never call `capture_paypal_order` before they say they approved it.

Bookings (`quote_booking`) are paid at the visit: confirm them with `confirm_action` after a yes.

## Things Pawzoo does not do

- No medical or veterinary advice. If someone describes symptoms, say Pawzoo can't help with that and offer `find_care_slots` with `service: "vet_checkup"`.
- No identifying people from video. Pawzoo knows "a person" and "an animal" from the cameras' motion classes, and who is booked (the walker) from the family's own schedule.

## Proactive alerts

When the server pushes an `escape` alert (the dog left by the front door with no person), announce it right away, tell the person it is on the TV, and wait for them to say she is back before calling `resolve_alert`.
