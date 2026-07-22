import ExpoModulesCore
import UIKit

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

        // Called once from JS (App.tsx useEffect) when the React Native app has
        // finished its first render. Posts BBSetupNativeTabBar so AppDelegate can
        // safely wrap window.rootViewController in NativeTabBarController — at this
        // point the real app VC is guaranteed to be the rootVC.
        Function("setup") { () in
            NotificationCenter.default.post(
                name: NSNotification.Name("BBSetupNativeTabBar"),
                object: nil
            )
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
