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
      onMain { self?.overlay?.setLanguages(codes) }
    }

    Function("setActiveTab") { [weak self] (tab: String) in
      onMain { self?.overlay?.setActiveTab(tab) }
    }

    Function("setBottomInset") { [weak self] (inset: Double) in
      onMain { self?.overlay?.setBottomInset(CGFloat(inset)) }
    }

    Function("setDark") { [weak self] (isDark: Bool) in
      onMain { self?.overlay?.setDark(isDark) }
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

// Runs synchronously when already on the main thread, otherwise dispatches.
// The unconditional DispatchQueue.main.async these functions used before
// always deferred to the next run-loop tick, even from calls that already
// arrived on main — during a screen transition that queued behind other
// main-thread work and showed up as a visible delay in the pill icons.
private func onMain(_ block: @escaping () -> Void) {
  if Thread.isMainThread {
    block()
  } else {
    DispatchQueue.main.async(execute: block)
  }
}
