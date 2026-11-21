# Voice Khata

A khata (credit ledger) a kirana shopkeeper talks to across the counter. Hold one button, say
"Ramesh ka 340 udhaar, kal 200 diya tha", let go, and the phone answers in your language (median first audio
about 0.7 s in our tests, not yet measured on a phone) and updates the khata. No typing. Built for BolBharat (Gnani x HackBriven), track PS2.

**Live:** https://voice-khata-gray.vercel.app (built for Chrome on a low-end Android phone; on a laptop, hold the
space bar)

## What it does

| You say | It does |
|---|---|
| रमेश का तीन सौ चालीस उधार लिखो | two customers are called Ramesh, so it asks: "कौन से Ramesh? Ramesh Sharma या Ramesh Doodhwala?" |
| शर्मा जी वाले | adds ₹340 udhaar to Ramesh Sharma and reads it back with his new balance |
| नहीं, चार सौ तीस | fixes the entry it just wrote to ₹430 |
| Ramesh Sharma का total कितना है? | says his balance |
| आज कितना उधार गया? | says today's total credit and the number of entries |
| अनिल का पाँच सौ उधार, कल दो सौ दिया था | two entries: ₹500 udhaar today, ₹200 jama dated yesterday |
| ರಮೇಶ್ ಶರ್ಮಾ ಅವರಿಗೆ ಮುನ್ನೂರ ನಲವತ್ತು ರೂಪಾಯಿ ಸಾಲ ಬರೆಯಿರಿ | same flow in Kannada; English works too. The other seven Timbre languages have reply text but have not been run end to end |

When you pick a language it greets you and says it is an AI, in that language. If that greeting is cut off or
never plays, the next reply starts with the AI line instead; it counts as said only once a reply carrying it plays
to the end. Switching language owes the disclosure again.

## How it works

```mermaid
flowchart LR
  P["Phone browser<br/>hold to talk"] -- "16 kHz PCM, 1,024-byte frames" --> S["Vercel Function /api/ws<br/>WebSocket, Mumbai (bom1)"]
  S -- "frames, then commit on release" --> STT["Gnani Prisma v3.0<br/>realtime STT"]
  STT -- "transcript" --> S
  S -- "transcript + customer names" --> L["Groq gpt-oss-20b<br/>intent JSON"]
  L --> S
  S -- "reply text" --> TTS["Gnani Timbre v3.0<br/>realtime TTS"]
  TTS -- "PCM chunks" --> S
  S -- "audio + ledger changes" --> P
  P --- DB[("Khata in IndexedDB<br/>on the phone")]
```

1. While the button is held, an AudioWorklet turns the mic into 16 kHz 16-bit frames of exactly 1,024 bytes
   and streams them to our server, which relays them to Prisma.
2. On release the server sends Prisma a `commit` at once instead of waiting for silence, then waits for Prisma's
   final transcript (up to 2.5 s; in our runs it came in 120 to 510 ms). That is the endpointing.
3. The transcript and the customer list go to an LLM that returns one JSON intent: add entries, correct the
   last one, ask a total, ask today's total, or answer "which Ramesh".
4. Our own code (`api/_lib/ledger.ts`) does every sum and balance. The LLM only extracts the amount it heard;
   when the transcript holds exactly one amount and the turn adds one entry or corrects one, the transcript's
   amount is used if the LLM wrote a different one (`crossCheck` in `api/_lib/session.ts`).
5. The reply streams back from Timbre in chunks and plays as it arrives. Pressing the button again stops it
   (barge-in) and the server drops the rest of that reply.

## Gnani API Platform services used

| Service | How we call it | Settings that matter |
|---|---|---|
| **Prisma v3.0, realtime streaming STT** | `wss://api.vachana.ai/stt/v3/stream` | `model=prisma-v3.0`, one `language_code` per session, `format=transcribe` (the model writes amounts as digits), `keyterms` = the Latin-script customer names known when the session connects (max 200), `topic`, `x-min-silence-ms=2000` because the button release ends each utterance |
| **Timbre v3.0, realtime TTS** | `wss://api.vachana.ai/api/v1/tts` | voice `Shivani`, raw PCM 24 kHz, socket kept warm between turns; ₹ amounts are left to Timbre's text normalisation |

LLM: Groq `openai/gpt-oss-20b` with JSON output (falls back to `gpt-oss-120b`). Orchestration: our own
TypeScript on Vercel Functions WebSockets. No hosted agent platform, no telephony, no voice cloning.

Two things we found that differ from the docs (22 Nov 2026): the streaming endpoint rejects a comma-separated
language list such as `hi-IN,en-IN` (reproduce with `node scripts/probe-headers.mjs`), so each session uses the one language the shopkeeper picked; English words
inside Hindi still come through. And a late `complete` from one Timbre request can arrive after the next request
starts on the same socket, so we count audio only after that request's own `start`.

## Measured results

All test audio is synthetic: shop lines spoken by Timbre voices, never real customer recordings. "Chatter"
mixes a second voice saying another line underneath at 40% volume. First audio = button release to the first
byte of reply audio reaching the client, measured from a home laptop on Wi-Fi. The on-screen badge adds
the 150 ms the page keeps listening after release.

| Run | Turns correct | First audio p50 | p90 | File |
|---|---|---|---|---|
| Live, Hindi and code-mix (which-Ramesh question, correction, totals, two entries in one sentence) | 9/9 | 656 ms | 1,210 ms | `docs/results/live-e2e-hi-IN-clean.json` |
| Live, Kannada | 4/4 | 919 ms | 952 ms | `docs/results/live-e2e-kn-IN-clean.json` |
| Live, English | 5/5 | 831 ms | 1,034 ms | `docs/results/live-e2e-en-IN-clean.json` |
| Local server, Hindi with chatter | 9/9 | 1,049 ms | 1,572 ms | `docs/results/local-e2e-hi-IN-noise.json` |

A turn counts as correct when the amount, the credit or payment direction and the customer all match, or the
reply carries the expected names or ₹ total and changes nothing. The committed records came from these runs;
running `scripts/e2e.mjs` yourself writes new ones to `test-audio/` (git-ignored). Speech step alone (`docs/results/spike-stt-tts.json`): with
`format=transcribe` Prisma wrote the amount as exact digits on 9/9 clean lines and 9/9 with chatter (median
release to text 339 ms and 327 ms); with `format=codemix` it wrote amounts as words (0/9 digits), so we use
`transcribe`. Timbre's first audio on a warm socket was 158 to 212 ms.

These are small synthetic runs, not field data. Real shop noise and real voices will do worse.

## Responsible AI and compliance

| Rule | What we do |
|---|---|
| AI disclosure | The greeting says it is an AI in the chosen language; until a turn carrying that line has played to the end, every reply starts with it (`greeting()` in `api/_lib/replies.ts`, `reply()` and `disclosure()` in `api/_lib/session.ts`) |
| Data | The seeded khata is synthetic (`resetDemo()` in `public/store.js`); entries you speak are saved only in that phone's IndexedDB. The server holds the ledger in memory while the socket is open and writes no transcript, ledger or audio to disk or a database. Audio, transcripts and customer names go to Gnani and Groq for processing. Server logs hold timings, the intent kind, the reply key and the model name; error lines can include an upstream error message. Vercel keeps function logs under its own policy |
| Money | Records credit and payments only. Replies confirm entries and state balances. No lending, and no reminders are sent to anyone |
| Secrets | Keys live in `.env.local` (git-ignored) and Vercel environment variables. The browser never sees a key: browsers cannot set WebSocket headers, so the server relays |
| Voices | Stock Timbre voice only. No cloning |

## Run it yourself

```bash
git clone https://github.com/Atishyy27/voice-khata && cd voice-khata
npm install
cp .env.example .env.local        # add GNANI_API_KEY and GROQ_API_KEY
npx tsx scripts/dev.ts            # http://localhost:3000
npm test                          # ledger, amount and reply unit tests
node scripts/e2e.mjs [ws-url] [hi-IN|kn-IN|en-IN] [--noise]   # spoken end-to-end turns
```

Deploy: `vercel deploy --prod` with `GNANI_API_KEY` and `GROQ_API_KEY` set in the project. `vercel.json` pins the
Mumbai region and the function's 300 s limit; the page reconnects when a socket closes.

## Files

| Path | What it is |
|---|---|
| `api/ws.ts` | WebSocket entry (Vercel Function) |
| `api/_lib/session.ts` | one conversation: relay audio, turn timing, barge-in, disclosure |
| `api/_lib/stt.ts`, `api/_lib/tts.ts` | Prisma and Timbre socket wrappers |
| `api/_lib/parse.ts` | utterance to intent JSON |
| `api/_lib/ledger.ts`, `api/_lib/numbers.ts`, `api/_lib/replies.ts` | khata maths, amount reading, reply text (written for 10 languages, run in 3) |
| `public/` | the page: `app.js`, `worklet.js` (mic to 16 kHz frames), `player.js` (gapless playback), `store.js` (IndexedDB) |
| `scripts/` | `dev.ts` local server, `spike.mjs` speech test, `e2e.mjs` end-to-end test, `probe-headers.mjs` language-list check |

## Known limits

- Replies exist for all 10 Timbre languages, but none has been checked by a native speaker yet. Hindi, English and
  Kannada were run end to end; server error messages are in Hindi only.
- One language per session (see the docs note above). Change it from the language link on the page.
- Tested on synthetic voices with synthetic chatter, not in a real shop.
