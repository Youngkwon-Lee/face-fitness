import AVFoundation
import SwiftUI
import UIKit

private final class CapturePipeline: @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "kr.co.kinelo.facefitness.camera")
    private var configured = false

    func start(completion: @escaping @Sendable (Bool) -> Void) {
        queue.async { [self] in
            if !configured {
                guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
                      let input = try? AVCaptureDeviceInput(device: camera) else { completion(false); return }
                session.beginConfiguration()
                session.sessionPreset = .medium
                guard session.canAddInput(input) else { session.commitConfiguration(); completion(false); return }
                session.addInput(input)
                // Preview only: no photo/movie output, frame processing or microphone.
                session.commitConfiguration()
                configured = true
            }
            if !session.isRunning { session.startRunning() }
            completion(session.isRunning)
        }
    }
    func stop() {
        queue.async { [self] in if session.isRunning { session.stopRunning() } }
    }
}

@MainActor
final class CameraModel: ObservableObject {
    enum State: Equatable { case off, requesting, active, denied, unavailable, interrupted }
    @Published private(set) var state: State = .off
    private let pipeline = CapturePipeline()
    private var generation = 0
    private var permissionInFlight = false
    private var pendingPermission: Int?
    private var observers: [NSObjectProtocol] = []
    var session: AVCaptureSession { pipeline.session }
    var message: String {
        switch state {
        case .off: "카메라는 꺼져 있어요"
        case .requesting: "카메라를 준비하고 있어요"
        case .active: "거울 모드 · 사진과 영상은 저장하지 않아요"
        case .denied: "카메라 접근이 꺼져 있어요. 안내 그림으로 계속할 수 있습니다."
        case .unavailable: "전면 카메라를 사용할 수 없어요. 안내 그림으로 계속하세요."
        case .interrupted: "카메라가 중단됐어요. 준비되면 다시 켜주세요."
        }
    }
    init() {
        for name in [AVCaptureSession.wasInterruptedNotification, AVCaptureSession.runtimeErrorNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: pipeline.session, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in self?.stop(as: .interrupted) }
            })
        }
    }
    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
        pipeline.stop()
    }
    func toggle() {
        if state == .active || state == .requesting { stop(); return }
        generation += 1
        let request = generation
        state = .requesting
        Task { @MainActor [weak self] in
            guard let self else { return }
            let allowed: Bool
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized: allowed = true
            case .notDetermined:
                permissionInFlight = true
                allowed = await AVCaptureDevice.requestAccess(for: .video)
                permissionInFlight = false
            default: allowed = false
            }
            guard request == generation else { return }
            guard allowed else { state = .denied; return }
            if UIApplication.shared.applicationState == .active { beginCapture(request: request) }
            else { pendingPermission = request }
        }
    }
    // The permission dialog itself makes a scene inactive. Keep only that first
    // explicit camera request; a real background transition always cancels it.
    func suspend(background: Bool) {
        if !background && (permissionInFlight || pendingPermission != nil) { pipeline.stop(); return }
        stop()
    }
    func completePendingPermission() {
        guard let request = pendingPermission, request == generation else { return }
        pendingPermission = nil
        beginCapture(request: request)
    }
    private func beginCapture(request: Int) {
        pipeline.start { [weak self] running in
            Task { @MainActor [weak self] in
                guard let self, request == self.generation else { return }
                guard UIApplication.shared.applicationState == .active else { self.stop(); return }
                self.state = running ? .active : .unavailable
            }
        }
    }
    func stop(as state: State = .off) {
        generation += 1
        pendingPermission = nil
        pipeline.stop()
        self.state = state
    }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> MirrorView {
        let view = MirrorView()
        view.preview.session = session
        view.preview.videoGravity = .resizeAspectFill
        return view
    }
    func updateUIView(_ uiView: MirrorView, context: Context) { uiView.setNeedsLayout() }
}

final class MirrorView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    override func layoutSubviews() {
        super.layoutSubviews()
        guard let connection = preview.connection else { return }
        let orientation = window?.windowScene?.interfaceOrientation ?? .portrait
        let angle: CGFloat
        switch orientation {
        case .landscapeLeft: angle = 180
        case .landscapeRight: angle = 0
        case .portraitUpsideDown: angle = 270
        default: angle = 90
        }
        if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = true
        }
    }
}
