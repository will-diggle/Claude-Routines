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
    // Children are React's to lay out now that they are no longer re-parented.
    updateCornerRadius()
  }

  // React mounts children directly onto this view, and under the New
  // Architecture it requires them to stay there: unmountChildComponentView
  // asserts the child is still a direct subview, so moving one into the effect
  // view's contentView aborts the app the moment that child unmounts.
  //
  // Keep the effect as a backdrop behind React's children instead. The cost is
  // UIGlassEffect's interactive press response, which only fires for touches
  // landing inside contentView — the glass still renders, it just no longer
  // reacts to a finger on its own.
  public override func didAddSubview(_ subview: UIView) {
    super.didAddSubview(subview)
    guard let ev = effectView, subview !== ev else { return }
    sendSubviewToBack(ev)
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
