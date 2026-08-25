# Unity live-auction port

`AuctionApp` connects a Unity presentation to the shared auction backend and MediaSFU room lifecycle. It creates or joins with room-scoped credentials, enables camera and microphone controls, synchronizes lots and bids, and exposes participant media for a UGUI, UI Toolkit, or 3D auction surface.

The included Package Manager manifest pins the MediaSFU Unity SDK to `0.1.0-preview.2` and its mediasoup client to `0.1.0-preview.1` from the official GitHub repositories.

## Scene integration

1. Add `AuctionApp` to a scene object and configure the reachable backend URL.
2. Bind the MediaSFU client callbacks to the auction controller.
3. Render remote video through the Unity SDK's native video surface or a target texture.
4. Keep remote audio active even when its participant is not on the main stage.
5. Route host actions through the backend so credentials and authoritative auction state remain server-side.

The included source defines the application flow; platform media rendering still depends on the MediaSFU Unity native plugin and target-player integration. See [platform support](../../docs/PLATFORM_PARITY.md) and [tested compatibility](../../docs/VALIDATION.md).
