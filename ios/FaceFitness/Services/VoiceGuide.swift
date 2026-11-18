import AVFoundation
import Combine
import UIKit

@MainActor
final class VoiceGuide: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var error: String?
    private let speech = AVSpeechSynthesizer()
    private var currentUtterance: ObjectIdentifier?
    private var request: UUID?
    private let audioQueue = DispatchQueue(label: "kr.co.kinelo.facefitness.audio")
    override init() { super.init(); speech.delegate = self }

    func speak(_ text: String) {
        stop()
        let token = UUID()
        request = token
        error = nil
        // Audio-session transitions can block; serialize them away from UI work.
        audioQueue.async { [weak self] in
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try AVAudioSession.sharedInstance().setActive(true)
                Task { @MainActor [weak self] in
                    guard let self, self.request == token, UIApplication.shared.applicationState == .active else { return }
                    let utterance = AVSpeechUtterance(string: text)
                    utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
                    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
                    utterance.volume = 1
                    self.currentUtterance = ObjectIdentifier(utterance)
                    self.speech.speak(utterance)
                }
            } catch {
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                Task { @MainActor [weak self] in
                    guard let self, self.request == token else { return }
                    self.error = "음성을 재생하지 못했어요. 기기 음량과 오디오 연결을 확인해 주세요."
                }
            }
        }
    }
    func stop() {
        speech.stopSpeaking(at: .immediate)
        currentUtterance = nil
        request = nil
        releaseAudio()
    }
    private func releaseAudio() {
        audioQueue.async { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        completed(ObjectIdentifier(utterance))
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        completed(ObjectIdentifier(utterance))
    }
    private nonisolated func completed(_ utterance: ObjectIdentifier) {
        Task { @MainActor [weak self] in
            guard let self, self.currentUtterance == utterance else { return }
            self.currentUtterance = nil
            self.releaseAudio()
        }
    }
}
