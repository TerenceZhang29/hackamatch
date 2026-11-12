import SwiftUI

/**
 The person card (P1-24, docs/design.md): an accent band with the avatar
 over it, the name, then Going to (shared hackathons first, in green), Interest
 areas and Top skills. `expanded` is the full profile: every hackathon and skill.
 Never contact details.
 */
struct PersonCardView: View {
    let person: Person
    var expanded = false

    private var goingTo: [GoingTo] { expanded ? person.goingTo : Array(person.goingTo.prefix(3)) }
    private var skills: [Tag] { expanded ? person.skills : Array(person.skills.prefix(3)) }

    var body: some View {
        VStack(spacing: 0) {
            Theme.accentSoft.frame(height: 44)
            AvatarView(name: person.displayName, size: 72)
                .overlay(Circle().stroke(Theme.bg, lineWidth: 4))
                .padding(.top, -36)
            HStack(spacing: 8) {
                Text(person.displayName)
                    .font(.title2.weight(.heavy))
                    .accessibilityAddTraits(.isHeader)
                if person.isDemo {
                    ChipView(label: "Demo", tone: .accent)
                }
            }
            .padding(.top, 8)

            VStack(alignment: .leading, spacing: 18) {
                if !goingTo.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: "Going to")
                        ForEach(goingTo) { event in
                            GoingToRow(event: event)
                        }
                    }
                }
                if !person.areas.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: "Interest areas")
                        TagChips(tags: person.areas)
                    }
                }
                if !skills.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: expanded ? "Skills" : "Top skills")
                        TagChips(tags: skills, tone: .accent)
                    }
                }
                if expanded, let summary = person.summary {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: "About")
                        Text(summary).font(.body)
                    }
                }
                if !expanded, person.goingTo.count > 3 || person.skills.count > 3 {
                    Label("Tap for the full profile", systemImage: "chevron.up")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .frame(maxWidth: .infinity)
        .background(Theme.bg)
        .clipShape(RoundedRectangle(cornerRadius: 28))
        .shadow(color: .black.opacity(0.08), radius: 15, y: 10)
    }
}

private struct GoingToRow: View {
    let event: GoingTo

    var body: some View {
        HStack(spacing: 12) {
            DateTile(isoDate: event.startDate, shared: event.shared)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.name).font(.subheadline.weight(.semibold))
                if event.shared {
                    Label("You're going too", systemImage: "checkmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.successInk)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(event.shared ? 6 : 8)
        .background(event.shared ? Theme.successSoft : Theme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14).stroke(
                event.shared ? Theme.successLine : .clear, lineWidth: 2)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(event.name), \(DateText.short(event.startDate))\(event.shared ? ", you're going too" : "")")
    }
}
