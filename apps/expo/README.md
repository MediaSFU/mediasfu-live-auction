# Expo live-auction app

The Expo app brings the same headless MediaSFU auction experience to Expo Web and native development clients. It supports secure room creation and joining, bidder or viewer invitations, live lots and bids, host controls, chat, screen-first video presentation, and independent remote audio.

## Run the app

Start the shared backend, then:

```powershell
npm install
npm run web
# or: npm start
# or: npm run android
```

The frontend receives only room-scoped data from the backend. Never place MediaSFU account credentials in Expo configuration or application source.

See [platform support](../../docs/PLATFORM_PARITY.md) and [tested compatibility](../../docs/VALIDATION.md).
