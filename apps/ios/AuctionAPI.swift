import Foundation

enum AuctionAPIError: LocalizedError {
    case unavailable, invalidResponse, server(String)
    var errorDescription: String? { switch self { case .unavailable: return "Unable to reach the auction service."; case .invalidResponse: return "The auction service returned an invalid response."; case .server(let message): return message } }
}

@MainActor final class AuctionAPI {
    let origin: URL
    init(origin: URL? = URL(string: ProcessInfo.processInfo.environment["AUCTION_API_URL"] ?? "http://127.0.0.1:8791")!) { self.origin = origin ?? URL(string: "http://127.0.0.1:8791")! }
    func create(hostName: String) async throws -> [String: Any] { try await request(path: "/api/auctions", method: "POST", body: ["hostName": hostName]) }
    func redeem(grant: String, displayName: String) async throws -> [String: Any] { try await request(path: "/api/invites/redeem", method: "POST", body: ["grant": grant, "displayName": displayName]) }
    func snapshot(id: String, token: String) async throws -> [String: Any] { try await request(path: "/api/auctions/\(id)", token: token) }
    func bid(id: String, token: String, amountCents: Int) async throws -> [String: Any] { try await request(path: "/api/auctions/\(id)/bids", method: "POST", token: token, body: ["amountCents": amountCents, "idempotencyKey": "bid_\(UUID().uuidString)"]) }
    func settle(id: String, token: String) async throws -> [String: Any] { try await request(path: "/api/auctions/\(id)/settle", method: "POST", token: token, body: [:]) }
    func invite(id: String, token: String, role: String) async throws -> String { let value = try await request(path: "/api/auctions/\(id)/invites", method: "POST", token: token, body: ["role": role]); return value["grant"] as? String ?? "" }
    func end(id: String, token: String) async throws { let value = try await request(path: "/api/auctions/\(id)/end", method: "POST", token: token, body: [:]); let data = value["data"] as? [String: Any]; guard data?["outcome"] as? String == "ended", data?["residue"] as? String == "clear" else { throw AuctionAPIError.server("Room cleanup was not confirmed.") } }
    private func request(path: String, method: String = "GET", token: String = "", body: [String: Any]? = nil) async throws -> [String: Any] {
        guard let url = URL(string: path, relativeTo: origin)?.absoluteURL else { throw AuctionAPIError.invalidResponse }
        var request = URLRequest(url: url); request.httpMethod = method; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }; request.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key"); if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        do { let (data, response) = try await URLSession.shared.data(for: request); guard let http = response as? HTTPURLResponse else { throw AuctionAPIError.invalidResponse }; let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]; if !(200..<300).contains(http.statusCode) || (value["success"] as? Bool) == false { throw AuctionAPIError.server(value["error"] as? String ?? "The auction request failed.") }; return value } catch let error as AuctionAPIError { throw error } catch { throw AuctionAPIError.unavailable }
    }
}

struct AuctionLot: Identifiable {
    let id: Int; let title: String; let art: String; let reserve: Int; let highest: Int; let bids: Int; let bidder: String; let state: String; let position: Int
    var displayPrice: String { "$\(max(reserve, highest) / 100)" }
}
struct AuctionState {
    let id: String; let hostName: String; let status: String; let lots: [AuctionLot]
    var openLot: AuctionLot? { lots.first(where: { $0.state == "open" }) ?? lots.last }
    init(_ value: [String: Any]) { id = value["id"] as? String ?? ""; hostName = value["hostName"] as? String ?? "Auctioneer"; status = value["status"] as? String ?? "open"; lots = (value["lots"] as? [[String: Any]] ?? []).enumerated().map { index, lot in AuctionLot(id: index, title: lot["title"] as? String ?? "Preparing lot", art: lot["art"] as? String ?? "◆", reserve: lot["reserveCents"] as? Int ?? 0, highest: lot["highestBidCents"] as? Int ?? 0, bids: lot["bidCount"] as? Int ?? 0, bidder: lot["highestBidderName"] as? String ?? "", state: lot["state"] as? String ?? "", position: lot["position"] as? Int ?? index) } }
}
