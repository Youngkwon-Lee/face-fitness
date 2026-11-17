import ARKit
import SceneKit
import SwiftUI

struct FaceObservation: Sendable {
    let anchorID: UUID
    let timestamp: TimeInterval
    let brow: Double
    let eyes: Double
    let smile: Double
    let lips: Double
    let mouthShape: Double

    func signal(for movement: String) -> Double {
        switch movement {
        case "brow": brow
        case "eyes": eyes
        case "smile": smile
        case "lips": lips
        default: mouthShape
        }
    }
}

/// Face geometry and blend shapes live only in memory. No identity matching,
/// frame outputs, files, network, or diagnostic logging of face data.
final class FaceTrackingPipeline: NSObject, ARSessionDelegate, ARSCNViewDelegate, @unchecked Sendable {
    let session = ARSession()
    private let lock = NSLock()
    private var request: Int?
    private var startedAt: TimeInterval = 0
    private var lastDelivered: TimeInterval = 0
    private let sample: @Sendable (Int, FaceObservation?) -> Void
    private let interrupted: @Sendable (Int) -> Void

    init(sample: @escaping @Sendable (Int, FaceObservation?) -> Void, interrupted: @escaping @Sendable (Int) -> Void) {
        self.sample = sample
        self.interrupted = interrupted
        super.init()
        session.delegate = self
        session.delegateQueue = DispatchQueue(label: "kr.co.kinelo.facefitness.tracking")
    }
    func start(request: Int) {
        lock.lock()
        self.request = request
        startedAt = ProcessInfo.processInfo.systemUptime
        lastDelivered = 0
        lock.unlock()
        let configuration = ARFaceTrackingConfiguration()
        configuration.maximumNumberOfTrackedFaces = 1
        configuration.isLightEstimationEnabled = false
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }
    func stop() {
        lock.lock(); request = nil; lock.unlock()
        session.pause()
    }
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        lock.lock()
        guard let request, frame.timestamp >= startedAt, frame.timestamp - lastDelivered >= 0.075 else { lock.unlock(); return }
        lastDelivered = frame.timestamp
        lock.unlock()
        guard let anchor = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first, anchor.isTracked else {
            sample(request, nil); return
        }
        let shapes = anchor.blendShapes
        func value(_ key: ARFaceAnchor.BlendShapeLocation) -> Double { shapes[key]?.doubleValue ?? 0 }
        let smile = (value(.mouthSmileLeft) + value(.mouthSmileRight)) / 2
        sample(request, FaceObservation(anchorID: anchor.identifier, timestamp: frame.timestamp,
            brow: max(value(.browInnerUp), (value(.browOuterUpLeft) + value(.browOuterUpRight)) / 2),
            eyes: (value(.eyeBlinkLeft) + value(.eyeBlinkRight)) / 2,
            smile: smile, lips: value(.mouthPucker),
            mouthShape: max(value(.jawOpen), value(.mouthPucker), value(.mouthFunnel), smile)))
    }
    func sessionWasInterrupted(_ session: ARSession) { fail() }
    func session(_ session: ARSession, didFailWithError error: Error) { fail() }
    private func fail() {
        lock.lock(); let current = request; lock.unlock()
        if let current { interrupted(current) }
    }
    func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
        guard let face = anchor as? ARFaceAnchor, let device = renderer.device,
              let geometry = ARSCNFaceGeometry(device: device) else { return nil }
        geometry.update(from: face.geometry)
        let material = geometry.firstMaterial!
        material.fillMode = .lines
        material.lightingModel = .constant
        material.diffuse.contents = UIColor.systemMint.withAlphaComponent(0.65)
        material.isDoubleSided = true
        material.writesToDepthBuffer = false
        material.readsFromDepthBuffer = false
        let node = SCNNode(geometry: geometry)
        node.renderingOrder = 100
        return node
    }
    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let face = anchor as? ARFaceAnchor, let geometry = node.geometry as? ARSCNFaceGeometry else { return }
        geometry.update(from: face.geometry)
        node.isHidden = !face.isTracked
    }
}

struct FaceMeshPreview: UIViewRepresentable {
    let pipeline: FaceTrackingPipeline
    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = pipeline.session
        view.session.delegate = pipeline
        view.delegate = pipeline
        view.preferredFramesPerSecond = 30
        view.automaticallyUpdatesLighting = false
        view.accessibilityLabel = "전면 카메라와 얼굴 메쉬"
        return view
    }
    func updateUIView(_ view: ARSCNView, context: Context) {}
    static func dismantleUIView(_ view: ARSCNView, coordinator: ()) {
        view.delegate = nil
        view.session.pause()
    }
}
