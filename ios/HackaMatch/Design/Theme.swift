import SwiftUI
import UIKit

nonisolated private func rgb(_ hex: UInt32) -> UIColor {
    UIColor(
        red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
        blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}

extension Color {
    /// A color with a light and a dark value, like the web's CSS variables.
    nonisolated init(light: UInt32, dark: UInt32) {
        self.init(
            uiColor: UIColor { traits in
                traits.userInterfaceStyle == .dark ? rgb(dark) : rgb(light)
            })
    }
}

/// The design tokens from `src/app/globals.css` (docs/design.md): neutral surfaces, one indigo accent.
nonisolated enum Theme {
    static let bg = Color(light: 0xffffff, dark: 0x0b0b0f)
    static let surface = Color(light: 0xf5f5f7, dark: 0x17171d)
    static let surface2 = Color(light: 0xebebef, dark: 0x22222a)
    static let ink = Color(light: 0x16161a, dark: 0xededf2)
    static let muted = Color(light: 0x6b6b76, dark: 0x9b9ba8)
    static let line = Color(light: 0xe4e4ea, dark: 0x2a2a33)
    static let accent = Color(light: 0x4f46e5, dark: 0x818cf8)
    static let accentInk = Color(light: 0xffffff, dark: 0x0b0b0f)
    static let accentSoft = Color(light: 0xeef0ff, dark: 0x1f2050)
    static let accentSoftInk = Color(light: 0x3730a3, dark: 0xc7cbff)
    static let successSoft = Color(light: 0xe7f7ee, dark: 0x0f2a1b)
    static let successInk = Color(light: 0x166534, dark: 0x86efac)
    static let successLine = Color(light: 0x22c55e, dark: 0x22c55e)
    static let dangerSoft = Color(light: 0xfdecec, dark: 0x3a1414)
    static let dangerInk = Color(light: 0xb42318, dark: 0xfca5a5)
}
