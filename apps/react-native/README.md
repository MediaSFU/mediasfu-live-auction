# React Native live-auction app

`AuctionApp.js` uses `mediasfu-reactnative` headlessly to deliver a fully branded native auction room. It supports secure room creation and invitation redemption, live lots and bids, screen-first media presentation, local-only camera mirroring, remote audio, chat, and host controls.

## Run on Android

Start the shared backend, then:

```powershell
npm install
npm start
npm run android
```

Android emulators use `http://10.0.2.2:8791`; a physical device requires a reachable HTTPS backend. MediaSFU account credentials belong only in the backend environment and must never be bundled with the app.

See [platform support](../../docs/PLATFORM_PARITY.md) and [tested compatibility](../../docs/VALIDATION.md).
