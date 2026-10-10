// swift-tools-version: 6.0
import PackageDescription

// The scoring engine shared by the iPhone and Apple Watch apps: the event
// model, the fold that derives scores and sets, persistence, and the
// WatchConnectivity sync. Pure Swift, so `swift test` runs it on the Mac.
let package = Package(
    name: "ScoreboardKit",
    platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v14)],
    products: [
        .library(name: "ScoreboardKit", targets: ["ScoreboardKit"]),
    ],
    targets: [
        .target(name: "ScoreboardKit"),
        .testTarget(name: "ScoreboardKitTests", dependencies: ["ScoreboardKit"]),
    ]
)
