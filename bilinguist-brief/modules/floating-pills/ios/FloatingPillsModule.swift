import ExpoModulesCore
import UIKit

public class FloatingPillsModule: Module {
  private var overlay: FloatingPillsOverlay?

  public func definition() -> ModuleDefinition {
    Name("FloatingPills")
    Events("onTabPress")

    AsyncFunction("mount") { [weak self] (promise: Promise) in
      DispatchQueue.main.async {
        self?.mountOverlay()
        promise.resolve(nil)
      }
    }

    AsyncFunction("unmount") { [weak self] (promise: Promise) in
      DispatchQueue.main.async {
        self?.overlay?.removeFromSuperview()
        self?.overlay = nil
        promise.resolve(nil)
      }
    }

    Function("setLanguages") { [weak self] (codes: [String]) in
      DispatchQueue.main.async { self?.overlay?.setLanguages(codes) }
    }

    Function("setActiveTab") { [weak self] (tab: String) in
      DispatchQueue.main.async { self?.overlay?.setActiveTab(tab) }
    }

    Function("setBottomInset") { [weak self] (inset: Double) in
      DispatchQueue.main.async { self?.overlay?.setBottomInset(CGFloat(inset)) }
    }

    Function("setDark") { [weak self] (isDark: Bool) in
      DispatchQueue.main.async { self?.overlay?.setDark(isDark) }
    }
  }

  private func mountOverlay() {
    guard overlay == nil else { return }

    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }

    guard let window else { return }

    let ov = FloatingPillsOverlay(frame: window.bounds)
    ov.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    ov.onTabPress = { [weak self] tab in
      self?.sendEvent("onTabPress", ["tab": tab])
    }
    window.addSubview(ov)
    overlay = ov
  }
}
