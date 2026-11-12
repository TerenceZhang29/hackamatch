import SwiftUI

/**
 The Me tab, like the web's `/me`: name, areas and skills, hackathons,
 pausing matches, blocked people, signing out and deleting the account.
 */
struct MeView: View {
    @Environment(AppModel.self) private var app
    @State private var events: [EventListItem] = []
    @State private var blocked: [BlockedPerson] = []
    @State private var editingName = false
    @State private var editingTags = false
    @State private var deleting = false
    @State private var busyEvent: String?

    var body: some View {
        List {
            if let me = app.me {
                Section {
                    HStack(spacing: 14) {
                        AvatarView(name: me.displayName, size: 60)
                        VStack(alignment: .leading, spacing: 2) {
                            Text([me.firstName, me.lastName].filter { !$0.isEmpty }.joined(separator: " "))
                                .font(.title3.weight(.bold))
                            Text("Shown as \(me.displayName)").font(.subheadline).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button("Edit") { editingName = true }
                            .accessibilityLabel("Edit your name")
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    if me.areas.isEmpty && me.skills.isEmpty {
                        Text("None yet").foregroundStyle(Theme.muted)
                    }
                    if !me.areas.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "Interest areas")
                            TagChips(tags: me.areas)
                        }
                        .padding(.vertical, 4)
                    }
                    if !me.skills.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "Skills")
                            TagChips(tags: me.skills, tone: .accent)
                        }
                        .padding(.vertical, 4)
                    }
                    Button("Edit areas and skills") { editingTags = true }
                } header: {
                    Text("Your areas and skills")
                }

                Section("Hackathons") {
                    if events.isEmpty {
                        Text("No upcoming hackathons yet.").foregroundStyle(Theme.muted)
                    }
                    ForEach(events) { event in
                        Toggle(
                            isOn: Binding(
                                get: { me.eventIds.contains(event.id) },
                                set: { on in Task { await setGoing(event, on) } })
                        ) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(event.name)
                                Text(DateText.range(event.startDate, event.endDate))
                                    .font(.footnote).foregroundStyle(Theme.muted)
                            }
                        }
                        .disabled(busyEvent == event.id)
                    }
                }

                Section {
                    if let pause = me.pause {
                        Label(pause.label, systemImage: "pause.circle").foregroundStyle(Theme.ink)
                    }
                    Menu(me.pause == nil ? "Pause matches" : "Change") {
                        ForEach(PauseChoice.allCases.filter { me.pause == nil ? $0 != .resume : true }) { choice in
                            Button(choice.label) { Task { await pause(choice) } }
                        }
                    }
                } header: {
                    Text("Notifications")
                } footer: {
                    Text("Emails go to \(me.email). Paused, you're out of the pool and get no matches.")
                }

                if !blocked.isEmpty {
                    Section("Blocked people") {
                        ForEach(blocked) { person in
                            HStack {
                                Text(person.displayName)
                                Spacer()
                                Button("Unblock") { Task { await unblock(person) } }
                                    .buttonStyle(.bordered)
                                    .accessibilityLabel("Unblock \(person.displayName)")
                            }
                        }
                    }
                }

                Section {
                    Button("Sign out") { Task { await app.signOut() } }
                    Button("Delete account", role: .destructive) { deleting = true }
                }

                Section {
                    Link("Terms", destination: AppConfig.webURL("terms"))
                    Link("Privacy", destination: AppConfig.webURL("privacy"))
                }
            }
        }
        .navigationTitle("Me")
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $editingName) { NameEditor() }
        .sheet(isPresented: $editingTags) { TagsEditor() }
        .sheet(isPresented: $deleting) { DeleteAccountSheet() }
    }

    private func load() async {
        await app.refreshMe()
        async let upcoming = app.api.events()
        async let blockedList = app.api.blocked()
        events = (try? await upcoming) ?? events
        blocked = (try? await blockedList) ?? blocked
    }

    private func setGoing(_ event: EventListItem, _ on: Bool) async {
        busyEvent = event.id
        defer { busyEvent = nil }
        do {
            _ = try await app.api.setGoing(slug: event.slug, on ? .going : .notGoing)
            await app.refreshMe()
        } catch let error as APIError where error.code == "confirm_needed" {
            app.flash("You've matched with people for \(event.name). Say you're not going on its page.")
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func pause(_ choice: PauseChoice) async {
        do {
            app.update(try await app.api.setPause(choice))
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func unblock(_ person: BlockedPerson) async {
        do {
            blocked = try await app.api.unblock(userId: person.id)
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }
}

/// First name (required) and last name (optional); only the initial is shown.
private struct NameEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("First name", text: $firstName).textContentType(.givenName)
                    TextField("Last name (optional)", text: $lastName).textContentType(.familyName)
                } footer: {
                    Text("Only your initial is shown to others, like Maya P.")
                }
                if let error { Text(error).foregroundStyle(Theme.dangerInk) }
            }
            .navigationTitle("Your name")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(firstName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                firstName = app.me?.firstName ?? ""
                lastName = app.me?.lastName ?? ""
            }
        }
    }

    private func save() async {
        do {
            app.update(
                try await app.api.updateName(
                    NameEdit(
                        firstName: firstName.trimmingCharacters(in: .whitespaces),
                        lastName: lastName.trimmingCharacters(in: .whitespaces))))
            dismiss()
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}

/// The same pickers as sign-up, starting from the member's tags.
private struct TagsEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model: SignupModel?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let model {
                        AreasStep(model: model)
                        Divider()
                        SkillsStep(model: model)
                    } else {
                        ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                    }
                    if let error { Text(error).foregroundStyle(Theme.dangerInk) }
                }
                .padding(20)
            }
            .navigationTitle("Areas and skills")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(model == nil)
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        guard model == nil, let me = app.me else { return }
        do {
            let taxonomy = try await app.api.taxonomy()
            let editor = SignupModel(
                asksEmail: false,
                resume: SignupAnswers(
                    firstName: me.firstName, lastName: me.lastName, eventIds: [], undecided: true,
                    domains: me.areas.map(\.slug), skills: me.skills.map(\.slug)))
            // A profile can hold more tags than sign-up allows; editing keeps them all.
            editor.load(events: [], taxonomy: Taxonomy(
                areas: taxonomy.areas, skills: taxonomy.skills,
                maxAreas: max(taxonomy.maxAreas, me.areas.count),
                maxSkills: max(taxonomy.maxSkills, me.skills.count)))
            model = editor
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }

    private func save() async {
        guard let model else { return }
        do {
            app.update(try await app.api.updateTags(TagsEdit(areas: model.areas, skills: model.skills)))
            dismiss()
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}

/// Type "delete" to confirm, as on the web. Everything goes, at once.
private struct DeleteAccountSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var confirm = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Type delete", text: $confirm)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("Type delete")
                } footer: {
                    Text("Your profile, matches and teams are removed straight away. This can't be undone.")
                }
                Section {
                    Button("Delete my account", role: .destructive) { Task { await delete() } }
                        .disabled(confirm.trimmingCharacters(in: .whitespaces).lowercased() != "delete" || working)
                }
                if let error { Text(error).foregroundStyle(Theme.dangerInk) }
            }
            .navigationTitle("Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func delete() async {
        working = true
        defer { working = false }
        do {
            try await app.deleteAccount()
            dismiss()
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}
