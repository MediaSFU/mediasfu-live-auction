import SwiftUI

@main struct MediaSFULiveAuctionApp: App {
  var body: some Scene { WindowGroup { AuctionRootView() } }
}

@MainActor final class AuctionModel: ObservableObject {
  @Published var name = "Auctioneer"
  @Published var grant = ""
  @Published var role = "host"
  @Published var auction: AuctionState?
  @Published var token = ""
  @Published var meetingId = ""
  @Published var roomData: [String: Any] = [:]
  @Published var busy = false
  @Published var notice = ""
  @Published var invites: [(String, String)] = []
  let api = AuctionAPI()
  var isHost: Bool { role == "host" }
  func enter() {
    busy = true
    notice = ""
    Task {
      do {
        let value: [String: Any]
        if grant.isEmpty {
          value = try await api.create(hostName: name)
        } else {
          value = try await api.redeem(grant: grant, displayName: name)
          role = value["role"] as? String ?? "viewer"
          meetingId = value["meetingId"] as? String ?? ""
        }
        let auctionValue = value["auction"] as? [String: Any] ?? [:]
        auction = AuctionState(auctionValue)
        token = (value[isHost ? "hostToken" : "participantToken"] as? String) ?? ""
        roomData = value["data"] as? [String: Any] ?? [:]
        if meetingId.isEmpty {
          meetingId =
            roomData["meetingID"] as? String ?? roomData["meetingId"] as? String ?? roomData[
              "roomName"] as? String ?? ""
        }
      } catch { notice = error.localizedDescription }
      busy = false
    }
  }
  func poll() {
    guard let auction, !token.isEmpty else { return }
    Task {
      if let value = try? await api.snapshot(id: auction.id, token: token),
        let state = value["auction"] as? [String: Any]
      {
        self.auction = AuctionState(state)
      }
    }
  }
  func bid(_ increment: Int) {
    guard let auction, let lot = auction.openLot else { return }
    busy = true
    Task {
      do {
        let amount = max(lot.reserve, lot.highest + increment)
        let value = try await api.bid(id: auction.id, token: token, amountCents: amount)
        if let state = value["state"] as? [String: Any] { self.auction = AuctionState(state) }
      } catch { notice = error.localizedDescription }
      busy = false
    }
  }
  func settle() {
    guard let auction else { return }
    Task {
      do {
        let value = try await api.settle(id: auction.id, token: token)
        if let state = value["auction"] as? [String: Any] { self.auction = AuctionState(state) }
      } catch { notice = error.localizedDescription }
    }
  }
  func makeInvite(role: String) {
    guard let auction else { return }
    Task {
      do {
        let grant = try await api.invite(id: auction.id, token: token, role: role)
        invites.append(
          (
            role,
            "mediasfu-auction://join?invite=\(grant.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? grant)"
          ))
      } catch { notice = error.localizedDescription }
    }
  }
  func end() {
    guard let auction else { return }
    busy = true
    Task {
      do {
        try await api.end(id: auction.id, token: token)
        self.auction = nil
        token = ""
        roomData = [:]
      } catch { notice = error.localizedDescription }
      busy = false
    }
  }
}

private let auctionNavy = Color(red: 0.027, green: 0.051, blue: 0.11)
private let auctionPanel = Color(red: 0.063, green: 0.106, blue: 0.165)
private let auctionGold = Color(red: 1, green: 0.84, blue: 0.04)
private let auctionTeal = Color(red: 0.21, green: 0.74, blue: 0.69)

struct AuctionRootView: View {
  @StateObject private var model = AuctionModel()
  var body: some View {
    Group {
      if model.auction == nil {
        AuctionEntryView(model: model)
      } else {
        AuctionRoomView(model: model)
      }
    }.preferredColorScheme(.dark).onOpenURL { url in
      if let grant = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(
        where: { $0.name == "invite" })?.value
      {
        model.grant = grant
        model.name = "Bidder1"
      }
    }
  }
}
struct AuctionEntryView: View {
  @ObservedObject var model: AuctionModel
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        HStack {
          Text("MEDIASFU SOLUTION STARTER")
            .font(.caption2.weight(.black)).tracking(1.7).foregroundStyle(auctionGold)
          Spacer()
          Text("◆").font(.system(size: 28, weight: .black)).foregroundStyle(auctionGold)
            .frame(width: 58, height: 58).background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 18))
        }
        .padding(.bottom, 28)

        Text(model.grant.isEmpty ? "Run a live auction" : "Enter the salesroom")
          .font(.system(size: 43, weight: .black, design: .rounded)).tracking(-1.2)
          .foregroundStyle(.white)
        Text(
          model.grant.isEmpty
            ? "Premium realtime media, bidder controls, and authoritative bidding—without exposing API credentials."
            : "Your private invitation decides whether you can bid or watch."
        )
        .font(.body).foregroundStyle(Color.white.opacity(0.64)).lineSpacing(5).padding(
          .vertical, 22)

        Text("Display name").font(.subheadline.weight(.bold)).foregroundStyle(
          Color.white.opacity(0.82)
        ).padding(.bottom, 8)
        TextField("Auctioneer", text: $model.name)
          .textInputAutocapitalization(.never).autocorrectionDisabled()
          .padding(.horizontal, 16).frame(height: 54)
          .background(Color.white.opacity(0.075))
          .overlay(RoundedRectangle(cornerRadius: 15).stroke(Color.white.opacity(0.16)))
          .clipShape(RoundedRectangle(cornerRadius: 15)).foregroundStyle(.white)

        if !model.notice.isEmpty {
          Text(model.notice).foregroundStyle(Color(red: 1, green: 0.46, blue: 0.42)).font(.footnote)
            .padding(.top, 12)
        }

        Button {
          model.enter()
        } label: {
          HStack {
            Text(
              model.busy
                ? "Opening…" : model.grant.isEmpty ? "Open auctioneer console" : "Enter auction"
            )
            .fontWeight(.black)
            Spacer()
            Text("→").font(.title3)
          }
          .foregroundStyle(auctionNavy).padding(.horizontal, 18).frame(height: 56)
          .background(auctionGold).clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain).disabled(model.busy).opacity(model.busy ? 0.6 : 1).padding(.top, 18)

        Text("Payments and settlement are deliberately outside this starter.")
          .font(.footnote).foregroundStyle(Color.white.opacity(0.44)).lineSpacing(3).padding(
            .top, 22)
      }
      .padding(28)
      .background(
        LinearGradient(
          colors: [auctionPanel, Color(red: 0.042, green: 0.075, blue: 0.13)],
          startPoint: .topLeading, endPoint: .bottomTrailing)
      )
      .clipShape(RoundedRectangle(cornerRadius: 30))
      .overlay(RoundedRectangle(cornerRadius: 30).stroke(Color.white.opacity(0.09)))
      .shadow(color: .black.opacity(0.4), radius: 30, y: 20)
      .frame(maxWidth: 520).padding(.horizontal, 18).padding(.vertical, 30)
    }
    .background(
      ZStack {
        auctionNavy
        Circle().fill(auctionGold.opacity(0.08)).frame(width: 360, height: 360).blur(radius: 30)
          .offset(x: 190, y: -290)
        Circle().fill(auctionTeal.opacity(0.07)).frame(width: 330, height: 330).blur(radius: 34)
          .offset(x: -190, y: 360)
      }.ignoresSafeArea()
    )
  }
}
struct AuctionRoomView: View {
  @ObservedObject var model: AuctionModel
  @StateObject private var room = MediaSFURoomController()
  @State private var chat = ""
  private var mediaSFURoomName: String { model.roomData["roomName"] as? String ?? model.meetingId }
  private var roomApiToken: String { model.roomData["secret"] as? String ?? "" }
  private var roomLink: String { model.roomData["link"] as? String ?? "" }
  var body: some View {
    ZStack {
      auctionNavy.ignoresSafeArea()
      MediaSFUNativeRoomView(
        controller: room,
        configuration: MediaSFURoomConfiguration(
          userName: model.name, roomName: mediaSFURoomName, roomApiToken: roomApiToken,
          roomLink: roomLink, eventType: "conference")
      ).ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
      auctionNavy.ignoresSafeArea()
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          HStack {
            VStack(alignment: .leading) {
              Text("◆ NORTHSTAR AUCTION HOUSE").foregroundStyle(auctionGold).font(
                .caption.weight(.black))
              Text("Powered by MediaSFU · headless realtime").foregroundStyle(.secondary).font(
                .caption)
            }
            Spacer()
            Text(room.state).font(.caption)
            if model.isHost { Button("End", role: .destructive) { model.end() } }
          }.padding(14).background(auctionPanel).clipShape(RoundedRectangle(cornerRadius: 14))
          VStack(alignment: .leading, spacing: 12) {
            HStack {
              VStack(alignment: .leading, spacing: 5) {
                Text("AUCTIONEER").foregroundStyle(auctionGold).font(.caption2.weight(.black))
                Text(model.name).font(.title2.weight(.black))
                Text("Camera and mic off").foregroundStyle(.secondary).font(.caption)
              }
              Spacer()
              Text(String(model.name.prefix(1)).uppercased()).font(
                .system(size: 34, weight: .black)
              ).foregroundStyle(auctionNavy).frame(width: 76, height: 76).background(auctionGold)
                .clipShape(Circle())
            }
            if model.role != "viewer" {
              HStack(spacing: 10) {
                Button {
                  room.toggleAudio()
                } label: {
                  Label("Mic", systemImage: "mic.fill")
                }
                Button {
                  room.toggleVideo()
                } label: {
                  Label("Camera", systemImage: "video.fill")
                }
                Button {
                  room.toggleScreenShare()
                } label: {
                  Label("Share", systemImage: "arrow.up.rectangle.fill")
                }
              }.buttonStyle(.bordered)
            }
          }.padding(18).background(
            LinearGradient(
              colors: [auctionPanel, Color(red: 0.04, green: 0.08, blue: 0.14)],
              startPoint: .topLeading, endPoint: .bottomTrailing)
          ).clipShape(RoundedRectangle(cornerRadius: 18))
          if let lot = model.auction?.openLot {
            VStack(alignment: .leading, spacing: 8) {
              Text(lot.art).font(.system(size: 64)).frame(maxWidth: .infinity)
              Text("LOT \(lot.position + 1) · NOW BIDDING").foregroundStyle(auctionGold).font(
                .caption.weight(.black))
              Text(lot.title).font(.title2.weight(.black))
              Text(lot.displayPrice).foregroundStyle(auctionGold).font(
                .system(size: 34, weight: .black))
              Text(lot.bidder.isEmpty ? "Reserve" : "\(lot.bidder) leads · \(lot.bids) bids")
                .foregroundStyle(.secondary)
              if model.role == "bidder" {
                HStack {
                  ForEach([2500, 10000, 50000], id: \.self) { increment in
                    Button("Bid \(max(lot.reserve, lot.highest + increment) / 100)") {
                      model.bid(increment)
                    }.buttonStyle(.borderedProminent).tint(auctionGold).foregroundStyle(.black)
                  }
                }
              }
              if model.isHost {
                Button("🔨 Close lot and advance") { model.settle() }.buttonStyle(.borderedProminent)
                  .tint(auctionTeal)
              }
              if model.role == "viewer" {
                Text("View-only invitation · bidding and publishing are disabled.").foregroundStyle(
                  .secondary)
              }
            }.padding(18).background(auctionPanel).clipShape(RoundedRectangle(cornerRadius: 18))
          }
          AuctionPanel(model: model, chat: $chat)
          if model.isHost {
            VStack(alignment: .leading, spacing: 8) {
              Text("PRIVATE SINGLE-USE INVITES").foregroundStyle(auctionGold).font(
                .caption.weight(.black))
              Text("Bidder links can bid and publish. Viewer links join read-only.")
                .foregroundStyle(.secondary)
              HStack {
                Button("Bidder link") { model.makeInvite(role: "bidder") }
                Button("Viewer link") { model.makeInvite(role: "viewer") }
              }.buttonStyle(.bordered)
              ForEach(Array(model.invites.enumerated()), id: \.offset) { _, invite in
                ShareLink(item: invite.1) { Text("Share \(invite.0) link") }
              }
            }.padding(16).background(auctionPanel).clipShape(RoundedRectangle(cornerRadius: 16))
          }
          if !model.notice.isEmpty { Text(model.notice).foregroundStyle(.red) }
        }.padding(14)
      }
    }.task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1.5))
        model.poll()
      }
    }.onDisappear { if model.isHost && model.auction != nil { model.end() } }
  }
}
private struct AuctionPanel: View {
  @ObservedObject var model: AuctionModel
  @Binding var chat: String
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("BIDDING FLOOR & SALESROOM CHAT").foregroundStyle(auctionGold).font(
        .caption.weight(.black))
      Text(
        "Every connected participant keeps an identity card. Use the Messages control in the MediaSFU room for live chat."
      ).foregroundStyle(.secondary)
      HStack {
        TextField("Message the salesroom", text: $chat).textFieldStyle(.roundedBorder)
        Button("Open chat") {
          model.notice = "Open the Messages control in the MediaSFU room UI to send this message."
        }.disabled(model.role == "viewer")
      }
    }.padding(16).background(auctionPanel).clipShape(RoundedRectangle(cornerRadius: 16))
  }
}
