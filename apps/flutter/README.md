# Flutter live-auction app

The Flutter app uses `mediasfu_sdk` headlessly so the auction interface remains fully native. It combines secure backend room creation, bidder and viewer roles, realtime lots and bids, MediaSFU microphone and camera controls, screen-aware video fitting, remote audio, chat, and host moderation.

## Run the app

Start the shared backend, then:

```powershell
flutter pub get
flutter run
```

Android emulators connect to `http://10.0.2.2:8791`; desktop targets use the reachable backend origin configured by the app. Account credentials stay in the backend environment and must never be included in Dart source, assets, or build defines.

See [platform support](../../docs/PLATFORM_PARITY.md) and [tested compatibility](../../docs/VALIDATION.md).
