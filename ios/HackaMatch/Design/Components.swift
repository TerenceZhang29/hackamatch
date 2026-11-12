import SwiftUI

// MARK: Buttons

/// The one main action on a screen: full width, accent, 52 points tall.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        PrimaryButtonLabel(configuration: configuration)
    }

    private struct PrimaryButtonLabel: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Theme.accent, in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(Theme.accentInk)
                .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.45)
        }
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

// MARK: Chips

/// A tag, or a choice when `onTap` is given. Selected choices are filled and carry ✓.
struct ChipView: View {
    enum Tone { case neutral, accent, success }

    let label: String
    var tone: Tone = .neutral
    var selected = false
    var onTap: (() -> Void)?

    var body: some View {
        if let onTap {
            Button(action: onTap) { content }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityAddTraits(selected ? .isSelected : [])
        } else {
            content
        }
    }

    private var content: some View {
        HStack(spacing: 4) {
            if selected {
                Image(systemName: "checkmark").font(.caption.weight(.bold))
            }
            Text(label)
        }
        .font(.subheadline.weight(.medium))
        .padding(.horizontal, 12)
        .frame(minHeight: 32)
        .foregroundStyle(foreground)
        .background(background, in: Capsule())
    }

    private var foreground: Color {
        if selected { return Theme.bg }
        switch tone {
        case .neutral: return Theme.ink
        case .accent: return Theme.accentSoftInk
        case .success: return Theme.successInk
        }
    }

    private var background: Color {
        if selected { return Theme.ink }
        switch tone {
        case .neutral: return Theme.surface2
        case .accent: return Theme.accentSoft
        case .success: return Theme.successSoft
        }
    }
}

/// Lays its children out in rows, wrapping like text: for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var width: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            width = max(width, x - spacing)
        }
        return CGSize(width: min(width, maxWidth), height: y + rowHeight)
    }

    func placeSubviews(
        in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
    ) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Tags as chips that wrap.
struct TagChips: View {
    let tags: [Tag]
    var tone: ChipView.Tone = .neutral

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(tags, id: \.slug) { tag in
                ChipView(label: tag.label, tone: tone)
            }
        }
    }
}

// MARK: Avatar and dates

/// An initials circle with a stable color per name. Decorative: the name is always next to it.
struct AvatarView: View {
    let name: String
    var size: CGFloat = 40

    private static let palette: [(Color, Color)] = [
        (Color(light: 0xe0e7ff, dark: 0x1e1b4b), Color(light: 0x3730a3, dark: 0xc7d2fe)),
        (Color(light: 0xe0f2fe, dark: 0x082f49), Color(light: 0x075985, dark: 0xbae6fd)),
        (Color(light: 0xd1fae5, dark: 0x022c22), Color(light: 0x065f46, dark: 0xa7f3d0)),
        (Color(light: 0xfef3c7, dark: 0x451a03), Color(light: 0x92400e, dark: 0xfde68a)),
        (Color(light: 0xffe4e6, dark: 0x4c0519), Color(light: 0x9f1239, dark: 0xfecdd3)),
        (Color(light: 0xede9fe, dark: 0x2e1065), Color(light: 0x5b21b6, dark: 0xddd6fe)),
    ]

    /// "Maya P." → "MP", "Omar" → "OM", the same as the web.
    static func initials(_ name: String) -> String {
        let parts = name.filter { $0.isLetter || $0.isNumber || $0.isWhitespace }
            .split(whereSeparator: \.isWhitespace)
        if parts.count > 1, let first = parts.first?.first, let last = parts.last?.first {
            return String([first, last]).uppercased()
        }
        return parts.first.map { String($0.prefix(2)).uppercased() } ?? "?"
    }

    var body: some View {
        var hash: UInt32 = 0
        for unit in name.utf16 { hash = hash &* 31 &+ UInt32(unit) }
        let (background, foreground) = Self.palette[Int(hash % UInt32(Self.palette.count))]
        return Text(Self.initials(name))
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: size, height: size)
            .background(background, in: Circle())
            .accessibilityHidden(true)
    }
}

/// Dates as the web shows them, from ISO days ("2026-11-09"), with no time zone shifts.
nonisolated enum DateText {
    private static let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]

    static func parts(_ iso: String) -> (month: String, day: Int)? {
        let pieces = iso.split(separator: "-").compactMap { Int($0) }
        guard pieces.count == 3, (1...12).contains(pieces[1]) else { return nil }
        return (months[pieces[1] - 1], pieces[2])
    }

    /// "Nov 9"
    static func short(_ iso: String) -> String {
        parts(iso).map { "\($0.month) \($0.day)" } ?? iso
    }

    /// "Nov 11 – Nov 12", or "Nov 11" for one day.
    static func range(_ start: String, _ end: String) -> String {
        start == end ? short(start) : "\(short(start)) – \(short(end))"
    }
}

/// A small calendar tile: "NOV" over "9", green when the viewer is going too.
struct DateTile: View {
    let isoDate: String
    var shared = false

    var body: some View {
        let parts = DateText.parts(isoDate)
        VStack(spacing: 1) {
            Text(parts?.month.uppercased() ?? "")
                .font(.system(size: 10, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(shared ? Theme.successInk : Theme.accent)
            Text(parts.map { String($0.day) } ?? "")
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(shared ? Theme.successInk : Theme.ink)
        }
        .frame(width: 44, height: 46)
        .background(Theme.bg, in: RoundedRectangle(cornerRadius: 10))
        .accessibilityHidden(true)
    }
}

// MARK: Notices

/// One line of status at the top of a screen.
struct NoticeBanner: View {
    let text: String
    var isError = true

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.medium))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .foregroundStyle(isError ? Theme.dangerInk : Theme.ink)
            .background(isError ? Theme.dangerSoft : Theme.bg, in: Capsule())
            .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
            .accessibilityAddTraits(.isStaticText)
    }
}

/// A section title in small capitals, like the web's card headings.
struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(0.6)
            .foregroundStyle(Theme.muted)
            .accessibilityAddTraits(.isHeader)
    }
}
