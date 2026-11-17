// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FaceFitnessCore",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "FaceFitnessCore", targets: ["FaceFitnessCore"])],
    targets: [
        .target(name: "FaceFitnessCore"),
        .testTarget(name: "FaceFitnessCoreTests", dependencies: ["FaceFitnessCore"])
    ]
)
