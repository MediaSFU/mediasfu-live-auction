import Foundation
import SwiftUI
import UIKit

#if canImport(MediaSFUAppleSDK)
  import MediaSFUAppleSDK
#elseif canImport(MediaSFUSDK)
  import MediaSFUSDK
  import MediaSFUIosBridge
#endif
#if canImport(MediaSFUMediasoupClient)
  import MediaSFUMediasoupClient
#endif

struct MediaSFURoomConfiguration {
  var apiUserName = ProcessInfo.processInfo.environment["MEDIASFU_API_USERNAME"] ?? ""
  var apiKey = ProcessInfo.processInfo.environment["MEDIASFU_API_KEY"] ?? ""
  var cloudRoomsEndpoint =
    ProcessInfo.processInfo.environment["MEDIASFU_CLOUD_ROOMS_ENDPOINT"] ?? ""
  var localLink = ""
  var userName: String
  var roomName: String
  /// Optional room-scoped handoff returned by the auction backend.
  var roomApiToken = ""
  var roomLink = ""
  var action = "join"
  var eventType = "conference"
  var connectMediaSFU = true
}

@MainActor final class MediaSFURoomController: ObservableObject {
  @Published private(set) var state = "Preparing room…"
  #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
    private var bridge: MediaSFUIosHostBridge?
  #endif
  #if canImport(MediaSFUMediasoupClient)
    private var device: MSCDevice?
  #endif
  func makeViewController(configuration: MediaSFURoomConfiguration) -> UIViewController {
    #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
      let host = MediaSFUIosHostBridge()
      let config = host.makeLaunchConfig()
      let hasBackendHandoff =
        !configuration.roomApiToken.isEmpty && !configuration.roomLink.isEmpty
      config.apiUserName = hasBackendHandoff ? "dummyUsr" : configuration.apiUserName
      config.apiKey =
        hasBackendHandoff ? String(repeating: "0", count: 64) : configuration.apiKey
      config.cloudRoomsEndpoint = configuration.cloudRoomsEndpoint
      config.localLink = configuration.localLink
      config.userName = configuration.userName
      config.roomName = configuration.roomName
      config.roomApiToken = configuration.roomApiToken
      config.roomLink = configuration.roomLink
      config.action = configuration.action
      config.eventType = configuration.eventType
      config.connectMediaSFU = configuration.connectMediaSFU
      config.autoProceed = true
      bridge = host
      #if canImport(MediaSFUMediasoupClient)
        let nativeDevice = MSCDevice()
        device = nativeDevice
        _ = MediaSFUKmpBridgeInstaller.installMediaSFUMediasoupClientBridgeIfSupported(
          device: nativeDevice)
      #endif
      state = "Connecting…"
      Task { [weak self] in
        for _ in 0..<80 {
          try? await Task.sleep(for: .milliseconds(250))
          let summary = host.latestRuntimeProbeSummary()
          if summary.contains("lastSignalStage=join-ok") {
            self?.state = "Connected"
            return
          }
          if summary.contains("lastSignalStage=join-fail")
            || summary.contains("lastSignalStage=rest-fail")
          {
            self?.state = "Connection needs attention"
            return
          }
        }
        if self?.state == "Connecting…" { self?.state = "Still connecting…" }
      }
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
    func toggleAudio() { _ = bridge?.triggerToggleAudio() }
    func toggleVideo() { _ = bridge?.triggerToggleVideo() }
    func toggleScreenShare() { _ = bridge?.triggerToggleScreenShare() }
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
