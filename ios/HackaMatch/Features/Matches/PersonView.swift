import SwiftUI

/**
 Someone's profile from a waiting or sent match: their card, where the
 member stands with them, and Interested / Pass while it waits on the member.
 The other person's answer is never shown before a reveal.
 */
struct PersonView: View {
    let personId: String

    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var page: PersonPage?
    @State private var error: String?
    @State private var working = false
    @State private var confirmBlock = false
    @State private var reporting = false

    var body: some View {
        Group {
            if let page {
                ScrollView {
                    VStack(spacing: 16) {
                        PersonCardView(person: page.person, expanded: true)
                        status(page)
                    }
                    .padding(16)
                }
            } else if let error {
                ContentUnavailableView {
                    Label("This profile isn't available", systemImage: "person.crop.circle.badge.xmark")
                } description: {
                    Text(error)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.surface)
        .navigationTitle(page?.person.displayName ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let person = page?.person {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Report \(person.displayName)", systemImage: "flag") { reporting = true }
                        Button("Block \(person.displayName)", systemImage: "hand.raised", role: .destructive) {
                            confirmBlock = true
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Report or block")
                }
            }
        }
        .confirmationDialog(
            "Block \(page?.person.displayName ?? "")?", isPresented: $confirmBlock, titleVisibility: .visible
        ) {
            Button("Block", role: .destructive) { Task { await block() } }
        } message: {
            Text("You won't see each other again.")
        }
        .sheet(isPresented: $reporting) {
            if let person = page?.person {
                ReportSheet(userId: person.id, name: person.displayName) {
                    app.flash("Reported and blocked. Thank you.", isError: false)
                    dismiss()
                }
            }
        }
        .task { await load() }
    }

    @ViewBuilder private func status(_ page: PersonPage) -> some View {
        switch page.status {
        case "none", "waiting":
            HStack(spacing: 12) {
                Button {
                    Task { await answer(.pass) }
                } label: {
                    Label("Pass", systemImage: "xmark").frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.bordered)
                Button {
                    Task { await answer(.interested) }
                } label: {
                    Label("Interested", systemImage: "heart.fill").frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.borderedProminent)
            }
            .font(.headline)
            .disabled(working)
        case "matched":
            if let matchId = page.matchId {
                NavigationLink(value: PairRoute(matchId: matchId)) {
                    Label("You matched. Open your match", systemImage: "arrow.right")
                        .labelStyle(TrailingIconLabelStyle())
                }
                .buttonStyle(.primary)
            }
        case "sent":
            Text("You said you're interested. We'll email you both if it's mutual.")
                .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        default:
            Text("You passed.").font(.subheadline).foregroundStyle(Theme.muted)
        }
    }

    private func load() async {
        do {
            page = try await app.api.person(id: personId)
            error = nil
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }

    private func answer(_ response: DeckResponse) async {
        working = true
        defer { working = false }
        do {
            let result = try await app.api.answer(userId: personId, response: response)
            if result.matchedName != nil {
                app.flash("It's a match! Check your email.", isError: false)
            }
            await load()
            await app.refreshMe()
            if response == .pass { dismiss() }
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func block() async {
        do {
            try await app.api.block(userId: personId)
            app.flash("Blocked. You won't see each other again.", isError: false)
            dismiss()
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }
}
