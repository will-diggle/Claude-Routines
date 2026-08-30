import ExpoModulesCore
import UIKit

public class LiquidGlassModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiquidGlass")

    // Reports which branch setupGlass() takes. JS can see whether the module
    // loaded, but not whether UIGlassEffect or the blur fallback was applied —
    // both look like frosted blur on screen.
    Function("diagnostics") { () -> [String: Any] in
      var glassBranch = false
      if #available(iOS 26.0, *) { glassBranch = true }
      return [
        "glassBranch": glassBranch,
        "osVersion":   UIDevice.current.systemVersion,
      ]
    }

    View(LiquidGlassView.self) {
      Prop("cornerRadius") { (view: LiquidGlassView, value: Double) in
        view.setCornerRadius(CGFloat(value))
      }
      Prop("intensity") { (view: LiquidGlassView, value: Double) in
        view.setIntensity(value)
      }
      Prop("colorScheme") { (view: LiquidGlassView, value: String) in
        view.setColorScheme(value)
      }
    }
  }
}
