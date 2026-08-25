# Angular live-auction app

Build a custom Angular auction room with MediaSFU headless media. `AuctionComponent` uses `MediasfuHeadlessService` and `MediasfuGeneric` with `returnUI=false`, leaving Angular in control of the live stage, lots, bids, moderation controls, chat, and participant floor.

## Run the app

Start the shared backend from the repository root, then:

```powershell
npm install
npm run dev
```

The app calls the backend proxy for room creation and joining; MediaSFU API credentials must never be added to Angular environment files or browser code. Screen share receives stage priority, camera tiles preserve identity when video is off, and remote audio remains mounted independently of the visible video grid.

See [platform support](../../docs/PLATFORM_PARITY.md) and [tested compatibility](../../docs/VALIDATION.md).
