import Foundation

// Set this to your Cloudflare Worker URL (EXPO_PUBLIC_DATA_URL from .env)
private let workerURL = "https://bilinguist-brief.williamdiggz.workers.dev"

enum BriefingServiceError: Error {
  case notPublished
  case network(Error)
  case decode(Error)
  case http(Int)
}

struct BriefingService {
  static func fetchBundle() async throws -> DailyBundle {
    let url = URL(string: "\(workerURL)/latest")!
    var req = URLRequest(url: url)
    req.cachePolicy = .reloadIgnoringLocalCacheData

    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await URLSession.shared.data(for: req)
    } catch {
      throw BriefingServiceError.network(error)
    }

    if let http = response as? HTTPURLResponse, http.statusCode != 200 {
      throw BriefingServiceError.http(http.statusCode)
    }

    do {
      let decoder = JSONDecoder()
      return try decoder.decode(DailyBundle.self, from: data)
    } catch {
      throw BriefingServiceError.decode(error)
    }
  }
}
