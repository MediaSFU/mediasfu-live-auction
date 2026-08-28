# iOS / SwiftUI

This is the SwiftUI port of the live-auction starter. It follows the same
entry, invitation, room, bidding, lot settlement, moderation/media controls,
single-use invite, and cleanup flow as the Flutter and React Native apps.

Add these files to an iOS 16+ Xcode target and add
`https://github.com/MediaSFU/mediasfu-apple-sdk.git` (`0.1.5` or later). Add
camera and microphone usage descriptions to `Info.plist`. Set `AUCTION_API_URL`
to the auction backend origin. `MEDIASFU_API_USERNAME`, `MEDIASFU_API_KEY`, and
the optional cloud-room endpoint are read only from the launch environment;
keep real values on the backend in production.
