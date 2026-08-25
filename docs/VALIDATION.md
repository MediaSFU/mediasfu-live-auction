# Tested compatibility and evidence

This report distinguishes source or build verification from behavior observed
in a live MediaSFU room. A successful compiler or test run does not, by itself,
prove camera capture, microphone capture, remote playout, screen sharing, or
room teardown.

## Tested platform coverage

| Surface | Automated verification | Live-room verification |
| --- | --- | --- |
| Backend + React | Focused tests and the Vite production build pass | Two browser participants produced and consumed video, synchronized a bid, ended the auction, and left no active auction state |
| Angular | Production build passes | Complete live-room media acceptance on the target browser before release |
| Vue | Type check and Vite production build pass | Complete live-room media acceptance on the target browser before release |
| React Native | Focused presentation tests, ESLint, and the Android Metro production bundle pass | Complete emulator/device media acceptance before release |
| Expo | TypeScript, ESLint, and Expo production Web export pass | Complete Web and development-build media acceptance before release |
| Flutter | Analysis, auction-rule tests, and Android debug APK assembly pass | Complete emulator/device media acceptance before release |
| Kotlin/Android | Unit tests, lint, and debug APK assembly pass | Complete emulator/device media acceptance before release |
| Unity | The application and adapter contracts are present | Unity Editor/player and live-media acceptance are required before release |

## React live-room acceptance

The React acceptance used two independent browser participants in the same real
MediaSFU room. A labeled, animated synthetic camera source was used to make the
test repeatable. Signaling, SDK media production, WebRTC transport, remote decode,
auction state, and teardown were real; the source was not a physical camera.

Observed outcomes:

- the host created a room and opened a bidder invitation;
- the bidder redeemed the invitation and joined the same room;
- both participants published video and decoded the other participant's
  1280×720 stream;
- a $100 bid submitted by the bidder appeared in the host console;
- ending the auction returned the host to entry and stopped the live bidder
  session; and
- no active auction remained in the backend store after cleanup.

### Evidence manifest

| Image | What it proves | What it does not prove |
| --- | --- | --- |
| [`01-host-camera-live.png`](evidence/react/01-host-camera-live.png) | Host joined a live room and rendered the labeled SDK-produced video source | Physical-camera capture or remote consumption |
| [`02-two-person-host.png`](evidence/react/02-two-person-host.png) | Host console rendered self and bidder video while showing the synchronized leading bid | Microphone quality, screen sharing, or native runtime behavior |
| [`03-bidder-remote-media.png`](evidence/react/03-bidder-remote-media.png) | Bidder view rendered the host's remote video and the submitted bid state | Physical-camera capture or agent-generated content |

The screenshots contain no reusable credentials, room URLs, passcodes, or room
identifiers.

## Reproduce the automated checks

From the repository root:

```bash
npm test
npm run build
npm run check:public
```

Platform-specific commands are documented in each app README. Live-room testing
requires MediaSFU credentials on the backend only; never place them in frontend
source, screenshots, URLs, or committed logs.

## Reliability coverage

Focused regression tests now verify that:

- create, join, explicit end, and page-exit cleanup reject an HTTP 2xx upstream
  response when its JSON body says `success: false`;
- a rejected join rolls its single-use grant back so the user can retry;
- a failed end never marks the local auction as ended or claims clear residue;
- the room status leaves **Securing room** after a direct failure, a bounded
  connection grace period, or loss of a room that was already live;
- host page-exit cleanup runs at most once and ignores teardown-time promise
  rejection without exposing its authorization token; and
- microphone and camera actions remain attached to explicit user controls, not
  the SDK parameter-publication callback.

The upstream room request timeout defaults to eight seconds and is bounded to
1–15 seconds through `MEDIASFU_UPSTREAM_TIMEOUT_MS`.

## Runtime acceptance still required

Browser microphone capture and screen sharing, native permission and audio-route
behavior, iOS/macOS execution, and Unity Editor/player execution remain
unclaimed until they are observed on their target runtimes.
