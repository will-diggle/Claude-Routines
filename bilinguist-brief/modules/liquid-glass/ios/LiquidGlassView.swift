import ExpoModulesCore
import UIKit

public class LiquidGlassView: ExpoView {
  private var effectView: UIVisualEffectView?
  private var currentCornerRadius: CGFloat = 100

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    // Do not set clipsToBounds here — the RN parent pill already clips to
    // borderRadius:100 via overflow:hidden. Letting the effectView self-clip
    // allows UIGlassEffect's rim specular highlights to render unmasked.
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

  private func setupGlass() {
    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect()
      let ev = UIVisualEffectView(effect: effect)
      ev.frame = bounds
      ev.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(ev)
      effectView = ev
    } else {
      let blur = UIBlurEffect(style: .systemUltraThinMaterial)
      let ev = UIVisualEffectView(effect: blur)
      ev.frame = bounds
      ev.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(ev)
      effectView = ev
    }
  }

  private func updateCornerRadius() {
    effectView?.layer.cornerRadius = currentCornerRadius
    effectView?.clipsToBounds = true
    layer.cornerRadius = currentCornerRadius
  }
}
