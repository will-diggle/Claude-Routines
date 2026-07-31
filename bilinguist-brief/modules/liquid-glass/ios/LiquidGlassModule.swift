import ExpoModulesCore

public class LiquidGlassModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiquidGlass")
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
