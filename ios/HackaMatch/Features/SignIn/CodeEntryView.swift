import SwiftUI

/**
 The second half of signing in: the 6-digit code from the email. It checks
 itself once six digits are in. With sign-up's answers, verifying also
 joins the pool.
 */
struct CodeEntryView: View {
    let email: String
    let answers: SignupAnswers?

    @Environment(AppModel.self) private var app
    @State private var code = ""
    @State private var error: String?
    @State private var resent = false
    @State private var working = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Check your email")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                Text("We sent a 6-digit code to \(email).")
                    .foregroundStyle(Theme.muted)
            }

            TextField("123456", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.system(size: 32, weight: .bold, design: .monospaced))
                .multilineTextAlignment(.center)
                .padding(.vertical, 14)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                .focused($focused)
                .accessibilityLabel("Sign-in code")
                .accessibilityIdentifier("Sign-in code")
                .onChange(of: code) { _, value in
                    let digits = String(value.filter(\.isNumber).prefix(6))
                    if digits != value { code = digits }
                    if digits.count == 6 { Task { await verify() } }
                }

            if let error {
                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(Theme.dangerInk)
                    .accessibilityAddTraits(.isStaticText)
            }

            Button {
                Task { await verify() }
            } label: {
                if working { ProgressView().tint(Theme.accentInk) } else { Text("Continue") }
            }
            .buttonStyle(.primary)
            .disabled(code.count != 6 || working)

            Button(resent ? "Sent. Check your inbox." : "Send a new code") {
                Task { await resend() }
            }
            .font(.subheadline.weight(.semibold))
            .disabled(working || resent)
            .frame(maxWidth: .infinity)

            Spacer()
        }
        .padding(24)
        .background(Theme.bg)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { focused = true }
    }

    private func verify() async {
        guard code.count == 6, !working else { return }
        working = true
        error = nil
        defer { working = false }
        do {
            _ = try await app.api.verify(email: email, code: code)
            try await app.signedIn(answers: answers)
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
            code = ""
        }
    }

    private func resend() async {
        do {
            try await app.api.requestCode(email: email)
            resent = true
            error = nil
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}

/// Signing in to an existing account: the email, then the code.
struct SignInView: View {
    @Environment(AppModel.self) private var app
    @State private var email = ""
    @State private var error: String?
    @State private var working = false
    @State private var sentTo: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Sign in")
                .font(.largeTitle.bold())
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 6) {
                Text("School email").font(.subheadline.weight(.medium))
                TextField("netid@cornell.edu", text: $email)
                    .textFieldStyle(FieldStyle())
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .onSubmit { Task { await send() } }
                    .accessibilityIdentifier("Email")
            }
            if let error {
                Text(error).font(.subheadline).foregroundStyle(Theme.dangerInk)
            }
            Button {
                Task { await send() }
            } label: {
                if working {
                    ProgressView().tint(Theme.accentInk)
                } else {
                    Text("Email me a code")
                }
            }
            .buttonStyle(.primary)
            .disabled(!email.contains("@") || working)
            Spacer()
        }
        .padding(24)
        .background(Theme.bg)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $sentTo) { email in
            CodeEntryView(email: email, answers: nil)
        }
    }

    private func send() async {
        let address = email.trimmingCharacters(in: .whitespaces).lowercased()
        guard address.contains("@"), !working else { return }
        working = true
        error = nil
        defer { working = false }
        do {
            try await app.api.requestCode(email: address)
            sentTo = address
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }
}

/// The text-field look from the web: a rounded box with a hairline.
struct FieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .background(Theme.bg, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
    }
}
