import Foundation
import Security

/// The session in the Keychain, readable only on this device after its first unlock.
nonisolated struct SessionStore: Sendable {
    var service = "com.hackamatch.app.session"
    private let account = "session"

    private var base: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func load() -> APISession? {
        var query = base
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
            let data = item as? Data
        else { return nil }
        return try? JSONDecoder().decode(APISession.self, from: data)
    }

    func save(_ session: APISession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        clear()
        var item = base
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    func clear() {
        SecItemDelete(base as CFDictionary)
    }
}
