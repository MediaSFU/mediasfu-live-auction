import Foundation
import SwiftUI
import UIKit

#if canImport(MediaSFUAppleSDK)
  import MediaSFUAppleSDK
#elseif canImport(MediaSFUSDK)
  import MediaSFUSDK
  #if canImport(MediaSFUIosBridge)
    import MediaSFUIosBridge
  #endif
#endif
#if canImport(MediaSFUMediasoupClient)
  import MediaSFUMediasoupClient
#endif
#if canImport(WebRTC)
  import WebRTC
#endif

struct MediaSFURoomConfiguration {
  var userName: String
  var roomName: String
  /// Optional room-scoped handoff returned by the auction backend.
  var roomApiToken = ""
  var roomLink = ""
  var islevel = "0"
  var adminPasscode = ""
  var action = "join"
  var eventType = "conference"
  var connectMediaSFU = true
  var canPublishMedia = false
}

@MainActor final class MediaSFURoomController: ObservableObject {
  @Published private(set) var state = "Preparing room…"
  #if canImport(WebRTC)
    @Published private(set) var localVideoTrack: RTCVideoTrack?
    @Published private(set) var remoteVideoTracks: [RTCVideoTrack] = []
  #endif
  #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
    private var bridge: MediaSFUIosHostBridge?
    private var observationTask: Task<Void, Never>?
    private var canPublishMedia = false
  #endif
  #if canImport(MediaSFUMediasoupClient)
    private var device: MSCDevice?
  #endif
  func makeViewController(configuration: MediaSFURoomConfiguration) -> UIViewController {
    #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
      let host = MediaSFUIosHostBridge()
      let config = host.makeLaunchConfig()
      // The backend handoff replaces these non-secret bootstrap values before signaling.
      config.apiUserName = "roomUser"
      config.apiKey = String(repeating: "0", count: 64)
      config.cloudRoomsEndpoint = ""
      config.localLink = ""
      config.userName = configuration.userName
      config.roomName = configuration.roomName
      config.roomApiToken = configuration.roomApiToken
      config.roomLink = configuration.roomLink
      config.islevel = configuration.islevel
      config.adminPasscode = configuration.adminPasscode
      config.action = configuration.action
      config.eventType = configuration.eventType
      config.connectMediaSFU = configuration.connectMediaSFU
      config.autoProceed = true
      canPublishMedia = configuration.canPublishMedia
      bridge = host
      #if canImport(MediaSFUMediasoupClient)
        let nativeDevice = MSCDevice()
        device = nativeDevice
        _ = MediaSFUKmpBridgeInstaller.installMediaSFUMediasoupClientBridgeIfSupported(
          device: nativeDevice)
      #endif
      state = "Connecting…"
      observe(host: host)
      return host.makeHostViewController(config: config)
    #else
      let controller = UIViewController()
      controller.view.backgroundColor = .systemBackground
      let label = UILabel()
      label.text = "Add MediaSFUAppleSDK to enable the room UI."
      label.numberOfLines = 0
      label.textAlignment = .center
      label.translatesAutoresizingMaskIntoConstraints = false
      controller.view.addSubview(label)
      NSLayoutConstraint.activate([
        label.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor, constant: 24),
        label.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor, constant: -24),
        label.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor),
      ])
      state = "SDK package not linked"
      return controller
    #endif
  }
  #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
    private func observe(host: MediaSFUIosHostBridge) {
      observationTask?.cancel()
      observationTask = Task { [weak self] in
        var attempts = 0
        while !Task.isCancelled {
          try? await Task.sleep(nanoseconds: 250_000_000)
          guard let self else { return }
          attempts += 1
          let summary = host.latestRuntimeProbeSummary()
          if summary.contains("lastSignalStage=join-ok")
            || (summary.contains("participants=")
              && summary.contains("participants=0") == false)
          {
            state = "Connected"
          }
          if summary.contains("lastSignalStage=join-fail")
            || summary.contains("lastSignalStage=rest-fail")
          {
            state = "Connection needs attention"
          } else if attempts == 80 && state == "Connecting…" {
            state = "Still connecting…"
          }
          #if canImport(WebRTC)
            let local = host.latestLocalVideoTrack() as? RTCVideoTrack
            let remote = host.latestRemoteVideoTracks().compactMap { $0 as? RTCVideoTrack }
            if localVideoTrack?.trackId != local?.trackId { localVideoTrack = local }
            if remoteVideoTracks.map(\.trackId) != remote.map(\.trackId) {
              remoteVideoTracks = remote
            }
          #endif
        }
      }
    }

    func toggleAudio() {
      guard canPublishMedia else { return }
      _ = bridge?.triggerToggleAudio()
    }
    func toggleVideo() {
      guard canPublishMedia else { return }
      _ = bridge?.triggerToggleVideo()
    }
    func toggleScreenShare() {
      guard canPublishMedia else { return }
      _ = bridge?.triggerToggleScreenShare()
    }
  #else
    func toggleAudio() {}
    func toggleVideo() {}
    func toggleScreenShare() {}
  #endif
}

struct MediaSFUNativeRoomView: UIViewControllerRepresentable {
  @ObservedObject var controller: MediaSFURoomController
  let configuration: MediaSFURoomConfiguration
  func makeUIViewController(context: Context) -> UIViewController {
    controller.makeViewController(configuration: configuration)
  }
  func updateUIViewController(_ controller: UIViewController, context: Context) {}
}

#if canImport(WebRTC)
  private struct MediaSFUVideoTrackRenderer: UIViewRepresentable {
    let track: RTCVideoTrack
    var mirrored = false
    final class Coordinator {
      var track: RTCVideoTrack?
      weak var renderer: RTCMTLVideoView?
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> RTCMTLVideoView {
      let view = RTCMTLVideoView(frame: .zero)
      view.videoContentMode = .scaleAspectFill
      context.coordinator.renderer = view
      attach(to: view, context: context)
      return view
    }
    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
      attach(to: view, context: context)
    }
    private func attach(to view: RTCMTLVideoView, context: Context) {
      if context.coordinator.track !== track {
        context.coordinator.track?.remove(view)
        context.coordinator.track = track
        track.add(view)
      }
      view.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
    }
    static func dismantleUIView(_ view: RTCMTLVideoView, coordinator: Coordinator) {
      coordinator.track?.remove(view)
    }
  }

  struct MediaSFUHeadlessVideoStage: View {
    @ObservedObject var controller: MediaSFURoomController
    let accent: SwiftUI.Color
    let emptyTitle: String
    let prefersLocalPrimary: Bool
    private var hasPrimaryTrack: Bool {
      prefersLocalPrimary
        ? controller.localVideoTrack != nil : !controller.remoteVideoTracks.isEmpty
    }
    var body: some View {
      ZStack(alignment: .bottomLeading) {
        Color.black
        if prefersLocalPrimary, let local = controller.localVideoTrack {
          MediaSFUVideoTrackRenderer(track: local, mirrored: true).id(local.trackId)
        } else if !prefersLocalPrimary, let remote = controller.remoteVideoTracks.first {
          MediaSFUVideoTrackRenderer(track: remote).id(remote.trackId)
        } else {
          VStack(spacing: 10) {
            Image(systemName: "video.slash.fill").font(.title).foregroundStyle(accent)
            Text(emptyTitle).font(.subheadline.weight(.bold)).foregroundStyle(.white)
            Text(controller.state).font(.caption).foregroundStyle(.white.opacity(0.58))
          }
        }
        if hasPrimaryTrack {
          HStack(spacing: 6) {
            Circle().fill(Color.green).frame(width: 7, height: 7)
            Text("Auctioneer camera").font(.caption2.weight(.black))
          }.foregroundStyle(.white).padding(.horizontal, 9).padding(.vertical, 6)
            .background(.black.opacity(0.62)).clipShape(Capsule()).padding(12)
        }
      }.clipped()
    }
  }

  struct MediaSFUBidderVideoFloor: View {
    @ObservedObject var controller: MediaSFURoomController
    let accent: SwiftUI.Color

    var body: some View {
      if controller.remoteVideoTracks.isEmpty {
        HStack(spacing: 12) {
          Image(systemName: "person.crop.rectangle.badge.plus").foregroundStyle(accent)
          VStack(alignment: .leading, spacing: 3) {
            Text("No bidders on camera yet").font(.subheadline.weight(.bold))
            Text("Connected bidders keep a visible seat here.")
              .font(.caption).foregroundStyle(.secondary)
          }
        }.frame(maxWidth: .infinity, alignment: .leading)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 10) {
            ForEach(Array(controller.remoteVideoTracks.enumerated()), id: \.element.trackId) {
              index, track in
              ZStack(alignment: .bottomLeading) {
                MediaSFUVideoTrackRenderer(track: track).id("bidder-\(track.trackId)")
                Text(index == 0 ? "Bidder camera" : "Bidder \(index + 1)")
                  .font(.caption2.weight(.black)).foregroundStyle(.white)
                  .padding(.horizontal, 8).padding(.vertical, 5)
                  .background(.black.opacity(0.68)).clipShape(Capsule()).padding(8)
              }
              .frame(width: 132, height: 92)
              .background(Color.black)
              .clipShape(RoundedRectangle(cornerRadius: 13))
              .overlay(RoundedRectangle(cornerRadius: 13).stroke(accent.opacity(0.5)))
            }
          }
        }
      }
    }
  }
#else
  struct MediaSFUHeadlessVideoStage: View {
    @ObservedObject var controller: MediaSFURoomController
    let accent: SwiftUI.Color
    let emptyTitle: String
    let prefersLocalPrimary: Bool
    var body: some View { Color.black.overlay(Text(emptyTitle).foregroundStyle(.white)) }
  }

  struct MediaSFUBidderVideoFloor: View {
    @ObservedObject var controller: MediaSFURoomController
    let accent: SwiftUI.Color
    var body: some View { Text("No bidders on camera yet").foregroundStyle(.secondary) }
  }
#endif
