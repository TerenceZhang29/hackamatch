import SwiftUI

/**
 A person's full profile, opened from the deck: every hackathon and skill,
 Pass and Interested, and "Report or block" (App Review guideline 1.2).
 Blocking or reporting takes them out of the deck for good.
 */
struct ProfileSheet: View {
    let person: Person
    let model: DeckModel
    let onAnswer: (DeckResponse) -> Void

    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var confirmBlock = false
    @State private var reporting = false
    @State private var error: String?

    /// Answers only for the card on top: the buttons act on it.
    private var isTop: Bool { model.cards.first?.id == person.id }

    var body: some View {
        NavigationStack {
            ScrollView {
                PersonCardView(person: person, expanded: true)
                    .padding(16)
                if let error {
                    Text(error).font(.subheadline).foregroundStyle(Theme.dangerInk)
                }
            }
            .background(Theme.surface)
            .safeAreaInset(edge: .bottom) {
                if isTop {
                    HStack(spacing: 12) {
                        Button {
                            dismiss()
                            onAnswer(.pass)
                        } label: {
                            Label("Pass", systemImage: "xmark")
                                .frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .buttonStyle(.bordered)
                        Button {
                            dismiss()
                            onAnswer(.interested)
                        } label: {
                            Label("Interested", systemImage: "heart.fill")
                                .frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .font(.headline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Theme.surface)
                }
            }
            .navigationTitle(person.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
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
            .confirmationDialog(
                "Block \(person.displayName)?", isPresented: $confirmBlock, titleVisibility: .visible
            ) {
                Button("Block", role: .destructive) { Task { await block() } }
            } message: {
                Text("You won't see each other again.")
            }
            .sheet(isPresented: $reporting) {
                ReportForm(person: person) {
                    model.remove(person.id)
                    model.notice = "Reported and blocked. Thank you."
                    dismiss()
                }
            }
        }
    }

    private func block() async {
        do {
            try await app.api.block(userId: person.id)
            model.remove(person.id)
            model.notice = "Blocked. You won't see each other again."
            dismiss()
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}

/// A reason and an optional note; reporting also blocks.
private struct ReportForm: View {
    let person: Person
    let onDone: () -> Void

    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var reason: ReportReason?
    @State private var note = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Reason", selection: $reason) {
                        Text("Pick a reason").tag(ReportReason?.none)
                        ForEach(ReportReason.allCases) { reason in
                            Text(reason.label).tag(ReportReason?.some(reason))
                        }
                    }
                    TextField("What happened? (optional)", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                } footer: {
                    Text("HackaMatch reviews every report within 24 hours. \(person.displayName) won't know who reported them, and you won't see each other again.")
                }
                if let error {
                    Text(error).foregroundStyle(Theme.dangerInk)
                }
            }
            .navigationTitle("Report \(person.displayName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Report") { Task { await submit() } }
                        .disabled(reason == nil || working)
                }
            }
        }
    }

    private func submit() async {
        guard let reason else { return }
        working = true
        defer { working = false }
        do {
            let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
            try await app.api.report(
                userId: person.id, reason: reason, note: trimmed.isEmpty ? nil : String(trimmed.prefix(1000)))
            dismiss()
            onDone()
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}
