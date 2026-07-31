import ExpoModulesCore
import UIKit

public class LiquidGlassView: ExpoView {
  private var effectView: UIVisualEffectView?
  private var currentCornerRadius: CGFloat = 100

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    setupGlass()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    effectView?.frame = bounds
    updateCornerRadius()
  }

  func setCornerRadius(_ radius: CGFloat) {
    currentCornerRadius = radius
    updateCornerRadius()
  }

  func setIntensity(_ intensity: Double) {
    effectView?.alpha = CGFloat(intensity)
  }

  func setColorScheme(_ scheme: String) {
    switch scheme {
    case "dark":  overrideUserInterfaceStyle = .dark
    case "light": overrideUserInterfaceStyle = .light
    default:      overrideUserInterfaceStyle = .unspecified
    }
  }

  private func setupGlass() {
    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect()
      effect.isInteractive = true
      let ev = UIVisualEffectView(effect: effect)
      ev.frame = bounds
      addSubview(ev)
      effectView = ev
    } else {
      let blur = UIBlurEffect(style: .systemUltraThinMaterial)
      let ev = UIVisualEffectView(effect: blur)
      ev.frame = bounds
      addSubview(ev)
      effectView = ev
    }
  }

  private func updateCornerRadius() {
    guard let ev = effectView else { return }
    if #available(iOS 26.0, *) {
      #if compiler(>=6.2)
      let r = UICornerRadius(floatLiteral: currentCornerRadius)
      ev.cornerConfiguration = .corners(
        topLeftRadius: r, topRightRadius: r,
        bottomLeftRadius: r, bottomRightRadius: r
      )
      #else
      ev.layer.cornerRadius = currentCornerRadius
      #endif
    } else {
      ev.layer.cornerRadius = currentCornerRadius
      ev.clipsToBounds = true
    }
  }
}
