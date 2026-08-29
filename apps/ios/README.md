# Live Auction for iOS

This folder contains the native SwiftUI version of Live Auction. It includes
auction creation, single-use bidder and viewer invitations, live bidding, lot
settlement, moderation controls, MediaSFU audio/video, and room cleanup.

## Requirements

- Xcode with an iOS 16 or newer app target
- The Live Auction backend from this repository
- The [MediaSFU Apple SDK](https://github.com/MediaSFU/mediasfu-apple-sdk)

## Add the app to an Xcode project

1. Add the Swift files in this folder to your app target.
2. In Xcode, choose **File → Add Package Dependencies**, enter the Apple SDK
   repository URL above, and link `MediaSFUAppleSDK` to the app target.
3. Add these keys to the app's Info.plist:

   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Use your camera during an auction.</string>
   <key>NSMicrophoneUsageDescription</key>
   <string>Use your microphone during an auction.</string>
   <key>CADisableMinimumFrameDurationOnPhone</key>
   <true/>
   ```

4. Start the auction backend. The simulator uses `http://127.0.0.1:8791` by
   default. To use another backend, set the `AUCTION_API_URL` scheme environment
   variable to its origin.
5. Build and run. Create an auction as the host, create a bidder or viewer
   invitation, and open that invitation on a second client.

`AUCTION_API_URL` identifies the auction application backend, not a MediaSFU
room endpoint. Standard MediaSFU cloud routing needs no endpoint override or
`localLink` in this app. Keep MediaSFU account credentials on the backend; the
app receives a room-scoped handoff after the auction is created or joined.

For a physical iPhone, use an HTTPS backend URL reachable from the phone.
`127.0.0.1` on the phone does not refer to the development Mac.

## Invitations

Bidder and viewer invitations are single-use application links. The assigned
participant name and role are redeemed by the backend, then used to enter the
matching MediaSFU room. Share invitations only with their intended recipient.
