import SwiftUI

@main
struct FaceFitnessApp: App {
    @StateObject private var history = HistoryStore()
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(history)
                .tint(Brand.accent)
                .preferredColorScheme(.dark)
        }
    }
}

enum Brand {
    static let accent = Color("AccentColor")
    static let background = Color(uiColor: .systemGroupedBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 52)
            .padding(.horizontal, 16)
            .foregroundStyle(.black)
            .background(Brand.accent.opacity(configuration.isPressed ? 0.75 : 1), in: RoundedRectangle(cornerRadius: 16))
    }
}
