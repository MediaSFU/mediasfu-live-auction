# iOS / SwiftUI

This is the SwiftUI port of the live-auction starter. It follows the same
entry, invitation, room, bidding, lot settlement, moderation/media controls,
single-use invite, and cleanup flow as the Flutter and React Native apps.

## Add it to an app

1. Create an iOS 16+ SwiftUI target in Xcode.
2. Add the files in this folder to the target.
3. Add `https://github.com/MediaSFU/mediasfu-apple-sdk.git` as a Swift package
   dependency and link `MediaSFUAppleSDK` to the app target.
4. Add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the
   target's Info.plist.
5. Run the auction backend and set `AUCTION_API_URL` to its public origin when
   it is not available at the default development address.

Account API credentials belong only to the backend. The iOS wrapper uses
non-secret, shape-valid placeholders to select the no-UI pre-join path. The
backend creates or joins the room, and the SDK replaces those placeholders with
the room-scoped `roomName`, `secret`, and `link` before connecting the socket.
Bidder and viewer invitations remain opaque, single-use application grants.

On a physical iPhone, configure an HTTPS backend URL that the device can reach;
`127.0.0.1` refers to the phone itself. The frontend configuration contains a
backend origin only—never an account key or room secret.
