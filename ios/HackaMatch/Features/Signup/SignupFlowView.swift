import SwiftUI

/**
 Sign-up, one step at a time, with the email last (P1-24). Someone new
 gets a code by email and joins once it's verified; someone already signed
 in (`asksEmail: false`) joins straight from the last step.
 */
struct SignupFlowView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model: SignupModel
    @State private var working = false
    @State private var error: String?
    @State private var codeSentTo: String?

    init(asksEmail: Bool, resume: SignupAnswers?) {
        _model = State(initialValue: SignupModel(asksEmail: asksEmail, resume: resume))
    }

    var body: some View {
        VStack(spacing: 0) {
            progress
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let loadError = model.loadError {
                        VStack(spacing: 12) {
                            Text(loadError).foregroundStyle(Theme.muted)
                            Button("Retry") { Task { await load() } }
                        }
                        .frame(maxWidth: .infinity)
                    } else if model.taxonomy == nil {
                        ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                    } else {
                        switch model.step {
                        case .hackathons: HackathonsStep(model: model)
                        case .areas: AreasStep(model: model)
                        case .skills: SkillsStep(model: model)
                        case .details: DetailsStep(model: model)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.bg)
        .safeAreaInset(edge: .bottom) { footer }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if model.step != .hackathons || model.asksEmail {
                    Button {
                        if !model.back() { dismiss() }
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .accessibilityLabel("Back")
                }
            }
            if !model.asksEmail {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign out") { Task { await app.signOut() } }
                }
            }
        }
        .navigationDestination(item: $codeSentTo) { email in
            CodeEntryView(email: email, answers: model.answers)
        }
        .task { if model.taxonomy == nil { await load() } }
    }

    private var progress: some View {
        let index = model.step.rawValue
        let count = SignupModel.Step.allCases.count
        return VStack(alignment: .leading, spacing: 8) {
            Text("Step \(index + 1) of \(count)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
            HStack(spacing: 6) {
                ForEach(0..<count, id: \.self) { step in
                    Capsule()
                        .fill(step <= index ? Theme.accent : Theme.line)
                        .frame(height: 4)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(index + 1) of \(count)")
    }

    private var footer: some View {
        VStack(spacing: 10) {
            if let error {
                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(Theme.dangerInk)
                    .multilineTextAlignment(.center)
            }
            if model.step == .details {
                Button {
                    Task { await submit() }
                } label: {
                    if working { ProgressView().tint(Theme.accentInk) } else { Text("Join HackaMatch") }
                }
                .buttonStyle(.primary)
                .disabled(!model.canContinue || working)
                HStack(spacing: 4) {
                    Text("By joining you agree to the")
                    Link("Terms", destination: AppConfig.webURL("terms")).underline()
                    Text("and")
                    Link("Privacy policy", destination: AppConfig.webURL("privacy")).underline()
                }
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            } else {
                Button("Continue") {
                    error = nil
                    model.next()
                }
                .buttonStyle(.primary)
                .disabled(!model.canContinue)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(Theme.bg)
    }

    private func load() async {
        do {
            async let events = app.api.events()
            async let taxonomy = app.api.taxonomy()
            model.load(events: try await events, taxonomy: try await taxonomy)
        } catch {
            model.failedToLoad((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func submit() async {
        guard model.canContinue, !working else { return }
        working = true
        error = nil
        defer { working = false }
        do {
            if model.asksEmail {
                try await app.api.requestCode(email: model.normalizedEmail)
                codeSentTo = model.normalizedEmail
            } else {
                try await app.join(model.answers)
            }
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}

// MARK: Steps

private struct StepTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.title.bold())
                .accessibilityAddTraits(.isHeader)
            Text(subtitle).foregroundStyle(Theme.muted)
        }
    }
}

private struct HackathonsStep: View {
    let model: SignupModel

    var body: some View {
        StepTitle(title: "Pick your hackathon", subtitle: "You can always edit this later")
        VStack(spacing: 10) {
            ForEach(model.events) { event in
                ChoiceRow(
                    title: event.name, detail: DateText.range(event.startDate, event.endDate),
                    selected: model.eventIds.contains(event.id)
                ) { model.toggleEvent(event.id) }
            }
        }
        HStack {
            Rectangle().fill(Theme.line).frame(height: 1)
            Text("or").font(.subheadline).foregroundStyle(Theme.muted)
            Rectangle().fill(Theme.line).frame(height: 1)
        }
        .accessibilityHidden(true)
        ChoiceRow(title: "Undecided yet", detail: nil, selected: model.undecided) {
            model.toggleUndecided()
        }
    }
}

/// A full-width choice with a check when picked.
private struct ChoiceRow: View {
    let title: String
    let detail: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                    if let detail {
                        Text(detail).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(selected ? Theme.accent : Theme.line)
            }
            .padding(16)
            .background(selected ? Theme.accentSoft : Theme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16).stroke(selected ? Theme.accent : .clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(detail.map { "\(title), \($0)" } ?? title)
        .accessibilityIdentifier(title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A search box that only finds supported names; "No results" otherwise.
private struct SearchBox: View {
    let prompt: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
            TextField(prompt, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 46)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct AreasStep: View {
    @Bindable var model: SignupModel

    var body: some View {
        StepTitle(
            title: "What areas interest you?",
            subtitle: "Pick up to \(model.maxAreas) · \(model.areas.count) picked")
        SearchBox(prompt: "Search areas", text: $model.areaQuery)
        let suggestions = model.areaSuggestions
        if !model.areaQuery.trimmingCharacters(in: .whitespaces).isEmpty || !suggestions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: model.areaQuery.isEmpty ? "Related" : "Results")
                if suggestions.isEmpty {
                    Text("No results").font(.subheadline).foregroundStyle(Theme.muted)
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(suggestions, id: \.area.slug) { item in
                            ChipView(
                                label: item.area.label, tone: item.related ? .accent : .neutral,
                                selected: model.areas.contains(item.area.slug)
                            ) { model.toggleArea(item.area.slug) }
                        }
                    }
                }
            }
        }
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Popular")
            FlowLayout(spacing: 8) {
                ForEach(model.areaChips, id: \.slug) { area in
                    ChipView(label: area.label, selected: model.areas.contains(area.slug)) {
                        model.toggleArea(area.slug)
                    }
                }
            }
        }
    }
}

struct SkillsStep: View {
    @Bindable var model: SignupModel

    var body: some View {
        StepTitle(
            title: "What are your top skills?",
            subtitle: "Pick up to \(model.maxSkills) · \(model.skills.count) picked")
        SearchBox(prompt: "Search skills and tools", text: $model.skillQuery)
        if !model.skillQuery.trimmingCharacters(in: .whitespaces).isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Results")
                let results = model.skillSuggestions
                if results.isEmpty {
                    Text("No results").font(.subheadline).foregroundStyle(Theme.muted)
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(results, id: \.slug) { skill in
                            ChipView(label: skill.label, selected: model.skills.contains(skill.slug)) {
                                model.toggleSkill(skill.slug)
                            }
                        }
                    }
                }
            }
        }
        ForEach(SkillGroup.allCases, id: \.self) { group in
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: group == .technical ? "Technical" : "Business")
                FlowLayout(spacing: 8) {
                    ForEach(model.skillChips(group), id: \.slug) { skill in
                        ChipView(label: skill.label, selected: model.skills.contains(skill.slug)) {
                            model.toggleSkill(skill.slug)
                        }
                    }
                }
            }
        }
    }
}

private struct DetailsStep: View {
    @Bindable var model: SignupModel

    var body: some View {
        StepTitle(title: "Almost there", subtitle: "Tell people who you are")
        LabeledField(label: "First name", note: "Required") {
            TextField("Maya", text: $model.firstName)
                .textContentType(.givenName)
                .accessibilityIdentifier("First name")
        }
        LabeledField(label: "Last name", note: "Optional") {
            TextField("Patel", text: $model.lastName)
                .textContentType(.familyName)
                .accessibilityIdentifier("Last name")
        }
        Text("Only your initial is shown to others, like Maya P.")
            .font(.footnote)
            .foregroundStyle(Theme.muted)
        if model.asksEmail {
            LabeledField(label: "Email", note: "Required") {
                TextField("netid@cornell.edu", text: $model.email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("Email")
            }
            Text("We'll email you a code to finish joining.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
        }
    }
}

private struct LabeledField<Field: View>: View {
    let label: String
    let note: String
    @ViewBuilder let field: Field

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label).font(.subheadline.weight(.medium))
                Spacer()
                Text(note).font(.subheadline).foregroundStyle(Theme.muted)
            }
            .accessibilityHidden(true)
            field
                .textFieldStyle(FieldStyle())
                .accessibilityLabel(label)
        }
    }
}
