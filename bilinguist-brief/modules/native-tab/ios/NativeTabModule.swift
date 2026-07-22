import ExpoModulesCore
import UIKit

// Listens for tab-change notifications posted by NativeTabBarController (in the main
// app target) and forwards them to React Native as JS events. Using NotificationCenter
// avoids any cross-target import between the main app and this pod.
public class NativeTabModule: Module {
    private var observer: NSObjectProtocol?

    public func definition() -> ModuleDefinition {
        Name("NativeTab")

        Events("onTabChange")

        OnCreate {
            self.observer = NotificationCenter.default.addObserver(
                forName: NSNotification.Name("BBNativeTabChange"),
                object: nil,
                queue: .main
            ) { [weak self] notification in
                guard let index = notification.userInfo?["index"] as? Int else { return }
                self?.sendEvent("onTabChange", ["index": index])
            }
        }

        OnDestroy {
            if let obs = self.observer {
                NotificationCenter.default.removeObserver(obs)
                self.observer = nil
            }
        }

        // Called from JS to keep the native tab bar in sync when RN navigates
        // programmatically (e.g. deep links, notification taps).
        Function("setSelectedTab") { (index: Int) in
            DispatchQueue.main.async {
                guard
                    let windowScene = UIApplication.shared.connectedScenes
                        .compactMap({ $0 as? UIWindowScene })
                        .first(where: { $0.activationState == .foregroundActive }),
                    let window = windowScene.windows.first(where: { $0.isKeyWindow }),
                    let tabVC = window.rootViewController as? UITabBarController
                else { return }
                tabVC.selectedIndex = index
            }
        }
    }
}
