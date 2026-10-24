# Pawzoo

**Your Ring cameras already see your dog's day. Pawzoo lets Alexa+ do something about it, and puts the day on your Fire TV.**

**[Watch the 77-second demo](https://youtu.be/TU6OOYvhF2o)** · **[Download the Fire TV app](https://github.com/asiyetajwa/pawzoo/releases/latest/download/pawzoo-tv.apk)**

Pawzoo is one product across three Amazon devices:

| Device | What Pawzoo does |
|---|---|
| **Ring** (sees) | Signed Ring webhooks tell Pawzoo when the walker arrives, when the dog leaves with them and comes back, and when the dog goes out of the front door alone. |
| **Alexa+** (acts) | A self-hosted MCP server. "How was Biscuit's day?" Pawzoo checks the walk against what the camera saw, projects when the food runs out and offers to reorder, pays and tips the walker, and books the groomer. Anything that spends money waits for a yes. |
| **Fire TV** (shows) | At 7 PM the family watches "Biscuit's Day": a reel cut from the day's camera clips, driven by the remote or by asking Alexa+ "show me when the walker came on the TV". If the dog gets out, the TV takes over with the front door camera. |

> Pawzoo is a hackathon project. The household, dog, walker, businesses and products in the demo are fictional, every purchase is simulated and nothing is charged. Pawzoo gives no veterinary advice.

## Run It

You need Node.js 22 or later. Works on Windows, macOS and Linux.

```bash
git clone <this repo> pawzoo
cd pawzoo
npm run setup      # installs and builds the server and the web apps
npm start          # http://127.0.0.1:8787
npm run stop       # stops any Pawzoo server still holding the port
```

No accounts or keys are needed: without them Pawzoo uses rules, templates and a local file, and says so in "Under the Hood".

Optional services: copy `.env.example` to `.env` and uncomment what you have.

- **AWS:** `AWS_REGION`, `BEDROCK_MODEL_ID` (we use Amazon Nova 2 Lite, `us.amazon.nova-2-lite-v1:0`) and `PAWZOO_TABLE`. Credentials come from your AWS CLI profile. `npm run check:aws` proves Bedrock and DynamoDB answer before you start; "Under the Hood" then shows which model chose the tools and wrote the digest, and that state is in DynamoDB.
- **ElevenLabs:** `ELEVENLABS_API_KEY` (with the Text to Speech permission) gives Pawzoo a spoken voice.

Open:

- **http://127.0.0.1:8787**: Pawzoo as an Alexa+ add-on on a screen device (simulated). Click a suggestion or the microphone (Chrome or Edge), or type. "Under the Hood" shows the live MCP traffic, Ring events and demo controls.
- **http://127.0.0.1:8787/tv.html**: the TV experience in a browser.
- **MCP endpoint**: `http://127.0.0.1:8787/mcp` (Streamable HTTP). Any MCP client can connect.

The demo replays a recorded Ring day and opens at 7 PM, with the whole day on camera. Use the demo controls to jump the clock (7 AM, 9 AM, 2 PM, 7 PM), make the dog get out, or reset.

**Demo film:** a 77-second walkthrough built from captures of these screens with Remotion, in [`demo/`](demo) (`npm run capture`, then `npm run render`).

### Fire TV

The Fire TV app is in [`tv/`](tv) (React Native for TV with Expo, built on Amazon's [react-native-multi-tv-app-sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample) configuration). It runs on Fire OS and on the Android TV emulator.

1. **Download** [`pawzoo-tv.apk`](https://github.com/asiyetajwa/pawzoo/releases/latest/download/pawzoo-tv.apk) from the [latest release](https://github.com/asiyetajwa/pawzoo/releases/latest).
2. **Install it.**
   - Fire TV: turn on Settings, My Fire TV, Developer Options, Apps from Unknown Sources, then sideload with `adb install pawzoo-tv.apk` or the Downloader app.
   - Android TV emulator, Android phone or tablet: `adb install pawzoo-tv.apk`, or open the file on the device.
3. **Open Pawzoo.** It plays a sample day built into the app, so it works with no server at all: play the reel with the remote or by touch, and press Show an Alert to see the escape screen.
4. **Optional, live:** on your computer run `npm run start:tv`. It listens on your network and prints the address to type (for example `192.168.1.20:8787`). In the app, press Connect and type it. The TV then follows your Ring day live, and Alexa+ can put moments on it. The Android TV emulator finds a server on its own computer automatically.

Build it yourself: `cd tv && npm ci && npm run prebuild && npm run apk` (needs the Android SDK). The sample day is generated from a running server with `node scripts/sample.mjs`.

## How It Works

```
Ring camera ──signed webhook──▶ /ring/webhook ──▶ agent: walks, meals, escapes ──▶ state (file or DynamoDB)
                                                                  │
Alexa+ (MCP client) ──initialize / tools/list / tools/call──▶ /mcp ── tools + MCP Apps card
                                                                  │
Fire TV app ◀──────────── /api/stream (server-sent events) ◀──────┘   cast reel, cast moment, escape alert
```

- **Deterministic agent, generative voice.** Walk verification, food projection, alerts and slot ranking are plain code in [`server/src/agent.ts`](server/src/agent.ts), so numbers are never invented. Amazon Bedrock only phrases the evening digest ([`server/src/digest.ts`](server/src/digest.ts)) and, in the simulator, chooses tools from the live `tools/list` ([`server/src/assistant.ts`](server/src/assistant.ts)). Without AWS credentials both fall back to templates and rules, so the demo always runs.
- **State across sessions.** Pawzoo remembers what the family tells it ("she's on two and a half cups a day now" moves the food forecast; "Saturday mornings are calmer at the groomer" ranks the slots) and a week of walks ("this week's only short one was two days ago, at 18 minutes").
- **Nothing spends money without a yes.** `quote_food_order`, `quote_walk_payment` and `quote_booking` return a one-time `confirmation_id`; only `confirm_action` with that id acts. The card's Confirm button and a spoken "yes" take the same path.
- **Privacy.** Pawzoo uses Ring's motion classes (person, animal, vehicle). It never identifies faces; it knows the walker from the family's own booking.

## Where the Required Technology Runs

| Track | In the code |
|---|---|
| **Alexa+**: self-hosted MCP server, spec 2025-11-25, Streamable HTTP | [`server/src/mcp.ts`](server/src/mcp.ts) (`McpServer`, 13 tools, MCP Apps card via `registerAppTool` / `registerAppResource`), served by `createMcpHandler` in [`server/src/index.ts`](server/src/index.ts). The test suite connects a real MCP client and asserts the negotiated protocol is `2025-11-25` ([`server/test/e2e.test.ts`](server/test/e2e.test.ts)). The simulator is a real MCP client in the browser ([`web/src/mcp.ts`](web/src/mcp.ts)) and an MCP Apps host ([`web/src/main.ts`](web/src/main.ts)). An Agent Skill for any agent using Pawzoo is in [`skill/pawzoo/SKILL.md`](skill/pawzoo/SKILL.md). |
| **Ring**: Ring (Amazon Vision) API | [`server/src/ring.ts`](server/src/ring.ts): HMAC-SHA256 `X-Signature` webhook verification, device list, event history for human/animal/vehicle classes, clip and snapshot download. Replay mode signs recorded webhooks with the same key and sends them through the same path ([`server/src/runtime.ts`](server/src/runtime.ts)). |
| **Fire TV**: Fire OS app | [`tv/src/App.tsx`](tv/src/App.tsx): React Native for TV, D-pad focus, media keys, `react-native-video`, live casts over server-sent events. |
| **AWS** | Amazon Bedrock (Converse API: digest and tool choice) and Amazon DynamoDB (household state). See Configuration. |

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT`, `HOST` | `8787`, `127.0.0.1` | Where the server listens. `npm run start:tv` listens on the network so a Fire TV can connect. |
| `PAWZOO_START_TIME` | `19:00` | The demo's clock on start and Reset (Chicago time). |
| `PAWZOO_LIVE_CLOCK` | unset | `1` follows the real time instead of the demo clock. |
| `PAWZOO_PUBLIC_URL` | `http://127.0.0.1:8787` | Origin the MCP Apps card loads snapshots from. |
| `PAWZOO_ALLOWED_ORIGINS` | localhost | Origins allowed to call `/mcp` from a browser (DNS rebinding protection). |
| `BEDROCK_MODEL_ID`, `AWS_REGION` | unset | Turn on Amazon Bedrock for the digest and the simulator's tool choice. |
| `PAWZOO_TABLE` | unset | DynamoDB table (partition key `householdId`, string). Unset: a local JSON file (`PAWZOO_STATE_FILE`, default `server/data/state.json`). |
| `BEDROCK_TIMEOUT_MS` | `20000` | How long to wait for Bedrock before falling back. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | unset, Jessica | Spoken answers through ElevenLabs. The key needs the Text to Speech permission. |
| `PAWZOO_MEDIA_DIR` | `media/` | Where replay clips and snapshots are served from. |
| `RING_ACCESS_TOKEN`, `RING_WEBHOOK_SECRET`, `RING_DEVICE_MAP` | unset | Live Ring account: API token, webhook signing key, and which device is which camera (`{"<device_id>":"front-door"}`). |
| `PAWZOO_DEMO_DATE` | today | The date the replayed Ring day happens on. |

## Biscuit

Biscuit, her family and her house are original Pawzoo artwork: soft clay figures in small dioramas, modelled in code with three.js ([`animation/clay/clay.js`](animation/clay/clay.js)). `cd animation && npm ci && npm run render` re-renders every replay clip and snapshot into `media/` (needs ffmpeg; it draws with software WebGL, so no GPU is needed). The clips stand in for Ring recordings in replay mode.

## Tests

```bash
npm test
```

Thirteen tests. Eleven end-to-end tests drive the real server through a real MCP client over HTTP: protocol negotiation, the tool list and card, the walk checked against camera events, confirmation-gated payments and orders, memory changing the food forecast, slot ranking, Ring signature rejection, the escape alert reaching the TV, voice switched off without a key, and the offline assistant. Two more run the Bedrock path against a local stand-in for the Converse API, including models that reject `temperature`.

## Built With

Model Context Protocol TypeScript SDK v2 and MCP Apps, Ring (Amazon Vision) API, React Native for TV (react-native-tvos) with Expo, Amazon Bedrock, Amazon DynamoDB. Building notes: [docs/FRICTION_LOG.md](docs/FRICTION_LOG.md).

## License

[MIT](LICENSE)
