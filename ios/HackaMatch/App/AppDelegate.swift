import OSLog
import UIKit
import UserNotifications

/// The app's log, readable in Console.app or `log stream --predicate 'subsystem == "com.hackamatch.app"'`.
nonisolated let pushLog = Logger(subsystem: "com.hackamatch.app", category: "push")

/**
 What SwiftUI can't do itself: the push token from APNs, and notifications,
 including Interested and Pass pressed on one without opening the app.
 */
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let app = AppModel()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        // Answering from the lock screen asks for Face ID first: nobody else can answer for you.
        let interested = UNNotificationAction(
            identifier: NotificationAction.interested, title: "Interested", options: [.authenticationRequired])
        let pass = UNNotificationAction(
            identifier: NotificationAction.pass, title: "Pass", options: [.authenticationRequired])
        center.setNotificationCategories([
            UNNotificationCategory(
                identifier: NotificationAction.category, actions: [interested, pass], intentIdentifiers: [])
        ])
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = NotificationAction.hex(deviceToken)
        pushLog.info("APNs token received (\(deviceToken.count) bytes)")
        Task { await app.deviceRegistered(token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        pushLog.error("APNs registration failed: \(error.localizedDescription, privacy: .public)")
    }

    /// In the foreground too: the banner, and the badge.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound, .badge]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        let kind = info["kind"] as? String
        let matchId = info["matchId"] as? String
        let action = response.actionIdentifier
        await app.notificationAnswered(action: action, kind: kind, matchId: matchId)
    }
}
