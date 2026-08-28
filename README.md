# MediaSFU Live Auction — multi-SDK starter

A premium, headless MediaSFU live-auction starter with one lean backend and
framework-owned UI. The host creates a salesroom, shares opaque bidder or viewer
links, publishes camera and microphone through MediaSFU, runs a timed three-lot
auction, accepts idempotent bids, and closes each lot from one focused console.

The auction starter demonstrates realtime bidding and media. It deliberately
does **not** process payments, transfer inventory, calculate tax, or create legal
settlement records.

## What ships

- `server`: SQLite/WAL auction state, opaque invitation grants, server-side
  MediaSFU room create/join/end proxy, bounded upstream requests, bid
  idempotency, and polling-friendly APIs.
- `apps/react`: complete premium web experience using `mediasfu-reactjs` in
  headless mode (`returnUI={false}`).
- `apps/angular`, `apps/vue`: framework ports that consume the same backend and
  auction presentation contract.
- `apps/react-native`, `apps/expo`, `apps/flutter`, `apps/kotlin-android`, `apps/ios`, and
  `apps/unity`: native implementations and integration boundaries. Each app
  README lists the build and live-media tests completed for that target. A
  successful build does not by itself demonstrate a two-participant media path.
- `packages/auction-contract`: transport-neutral state, role, media, and visual
  invariants used by every implementation.

## Run the canonical React app

Requirements: Node.js 22 or later and MediaSFU API credentials.

```powershell
Copy-Item .env.example server/.env
# Add your API username and key to server/.env. Do not put them in frontend code.
npm install
npm test
npm run build
npm --workspace server start
npm --workspace apps/react run dev
```

Open `http://127.0.0.1:4176`.

Get API credentials in the [MediaSFU developer console](https://mediasfu.com/documentation),
exercise room APIs in the [MediaSFU Sandbox](https://mediasfu.com/sandbox), and
read the [MediaSFU documentation](https://mediasfu.com/documentation).

MediaSFU Cloud is the managed service. **MediaSFU Open is a self-hosted media
server that you run, secure, and operate on your own infrastructure**; configuring
its URL connects this starter to that existing deployment.

## Security model

API credentials exist only in `server/.env`. Browser and native apps receive
room-scoped create/join responses. Public links contain a random, expiring,
single-use grant—not an API key, room credential, or internal database ID.

For production, put authenticated identity and authorization ahead of the sample
host bootstrap, use HTTPS, restrict CORS, add rate limits, and choose a durable
multi-node data adapter if you run more than one backend instance.

### Retry-safe room requests

Room creation and invitation redemption accept `Idempotency-Key`. Generate one
opaque 8–128 character key for each logical create or join, retain it while the
request can be retried, and send the same key with an exact retry. A later,
intentional create or join must use a new key.

```js
const idempotencyKey = crypto.randomUUID();
await fetch('/api/auctions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify({ hostName: 'Auctioneer' }),
});
```

The backend validates and forwards this header to MediaSFU. It is separate from
the auction bid idempotency key: room keys protect room create/join retries,
while bid keys protect repeated bid submissions.

## Media and UI contract

Every participant always has a card: live video, audio-only identity, or camera-off
identity. Screen share takes the main stage and is never mirrored or cropped;
camera faces use `cover`, screens use `contain`. The local camera is mirrored only
for self-preview. Every remote audio renderer is mounted. Prepared SDK cards are
not treated as proof that a track is live. Microphone and camera capture are
user-initiated from the salesroom controls; entering a room never turns either
device on automatically.

If a room ends elsewhere or cannot finish connecting, the React starter changes
from **Securing room** to a recoverable **Room unavailable** state instead of
spinning forever. The host's page-exit handler also sends a one-shot,
authenticated, best-effort cleanup request. The backend bounds that upstream
request and only reports cleanup after MediaSFU confirms success.

See [platform support](docs/PLATFORM_PARITY.md) for the feature matrix and
[test the integration](docs/VALIDATION.md) for the platform test procedure.

## License

Licensed under the [MIT License](LICENSE).
