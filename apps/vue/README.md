# Vue live-auction app

Build a custom Vue auction room with `mediasfu-vue` in headless mode. Vue owns the live stage, responsive participant cards, timed lots, bidding controls, chat, and moderation while the shared backend protects MediaSFU credentials and maintains authoritative auction state.

## Run the app

Start the shared backend, then:

```powershell
npm install
npm run dev
```

Screen share takes priority on the stage, cameras use a face-friendly crop, screen content remains uncropped, and every remote audio renderer stays mounted. See [platform support](../../docs/PLATFORM_PARITY.md) and [tested compatibility](../../docs/VALIDATION.md).
