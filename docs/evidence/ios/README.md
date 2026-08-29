# Live Auction iOS validation

The screenshots below come from one automated auction between two independent
SwiftUI clients running on iOS 26.2 simulators:

- [Host receives bidder video](01-swift-host-receives-bidder-video.png)
- [Bidder receives host video](02-swift-bidder-receives-host-video.png)

The host created and joined an auction, enabled its camera, generated a
single-use bidder invitation, and transferred it to the second client. Both
clients published deterministic simulator camera tracks through the native
Apple SDK media path. The tests required a remote camera track on each side and
passed in both directions.

This validates auction creation and redemption, room connection, camera
publication, remote-track discovery, and rendering within the Swift auction
UI. It does not replace physical-device checks for real camera capture,
microphone playout, or ReplayKit screen sharing.
