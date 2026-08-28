# Platform parity

The live-auction ports share one backend and the same auction contract. Their UI
is framework-owned while MediaSFU supplies room lifecycle, tracks, participants,
audio renderers, and moderation capabilities.

## Implemented source

| Capability | React | Angular | Vue | React Native | Expo | Flutter | Kotlin | Swift/iOS | Unity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Host create; bidder/viewer join | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Opaque, single-use role invites | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Bid, increment, reserve, settle, end | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Main/secondary media resolution | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Camera, microphone, screen-share controls | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Remote audio renderer integration | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Requires device validation | Requires Unity scene audio binding |
| Chat | Yes | Yes | Yes | Yes | Yes | Yes | Yes | UI boundary included | Yes |
| Host moderation where exposed by SDK | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Room controls exposed | Yes |
| Responsive auction presentation | Yes | Yes | Yes | Yes | Yes | Yes | Yes | SwiftUI presentation included | Scene UI included; test it in the Editor/player |

“Yes” means the repository includes the behavior for that platform. It does not
mean that native media has been observed on a device. See
[VALIDATION.md](VALIDATION.md) for completed build and runtime tests.

The Swift/iOS port is in `apps/ios`. It uses the published MediaSFUAppleSDK
room host and the same backend auction contract. Validate camera, microphone,
screen capture, and native media on a physical device before distribution.

## Shared behavior

- The backend owns API credentials and returns room-scoped create/join data.
- Invite URLs carry an opaque, expiring, single-use grant with a bidder or viewer
  role. They never carry API keys or room credentials.
- Screen share wins the main stage. Otherwise the host/local camera is preferred,
  followed by a live remote camera. Ended tracks are rejected.
- Screen content uses `contain`; cameras use `cover`; only the local camera preview
  is mirrored.
- Every remote audio renderer supplied by the SDK is mounted, independent of the
  visible video card.
- Ending a lot settles its current leader. Ending the auction tears down auction
  state and asks the SDK to leave/end the MediaSFU room.

## Deliberate platform differences

- Browser apps can copy invite URLs directly. Native apps use the platform share
  or clipboard boundary available to that sample.
- Permission prompts, device selection, audio routing, and screen-capture consent
  remain platform-native.
- The Unity port exposes lifecycle and media bridge contracts, but local/remote
  video rendering and Editor/player execution remain unverified.
- Flutter package resolution, clean analysis, focused auction-rule tests, and
  Android debug APK assembly pass. Live native media remains a separate runtime
  acceptance requirement.

## Release checklist

Before releasing an app, use published MediaSFU SDK versions, rerun its automated
checks, and complete the live-room scenarios listed in
[VALIDATION.md](VALIDATION.md) on the target runtime. Keep reusable MediaSFU
credentials behind the backend proxy throughout development and deployment.
