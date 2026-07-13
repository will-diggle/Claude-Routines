import ExpoModulesCore
import UIKit

// On iOS 26+ devices this view uses UIGlassMorphismEffect (true Liquid Glass).
// On iOS 15–25 it falls back to systemUltraThinMaterial blur — indistinguishable to most users.
// Expo Go never loads this module; it uses expo-blur BlurView instead (see GlassSurface.tsx).

public class LiquidGlassView: ExpoView {
  private var blurView: UIVisualEffectView?
  private var glassLayer: CALayer?
  private var currentCornerRadius: CGFloat = 100
  private var currentIntensity: Double = 1.0

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    clipsToBounds = true
    setupGlass()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    blurView?.frame = bounds
    glassLayer?.frame = bounds
    updateCornerRadius()
  }

  func setCornerRadius(_ radius: CGFloat) {
    currentCornerRadius = radius
    updateCornerRadius()
  }

  func setIntensity(_ intensity: Double) {
    currentIntensity = intensity
    // Intensity currently adjusts blur alpha for pre-iOS-26 path
    blurView?.alpha = CGFloat(intensity)
  }

  private func setupGlass() {
    if #available(iOS 26.0, *) {
      setupiOS26Glass()
    } else {
      setupFallbackBlur()
    }
  }

  @available(iOS 26.0, *)
  private func setupiOS26Glass() {
    let effect = UIGlassEffect()
    let effectView = UIVisualEffectView(effect: effect)
    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effectView.layer.cornerRadius = currentCornerRadius
    effectView.clipsToBounds = true
    addSubview(effectView)
    blurView = effectView
  }

  private func setupFallbackBlur() {
    // systemUltraThinMaterial is the closest pre-iOS-26 equivalent
    let blur = UIBlurEffect(style: .systemUltraThinMaterial)
    let effectView = UIVisualEffectView(effect: blur)
    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    // Subtle vibrancy layer on top so text/icons read through the glass
    let vibrancy = UIVibrancyEffect(blurEffect: blur, style: .fill)
    let vibrancyView = UIVisualEffectView(effect: vibrancy)
    vibrancyView.frame = effectView.contentView.bounds
    vibrancyView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effectView.contentView.addSubview(vibrancyView)

    addSubview(effectView)
    blurView = effectView
  }

  private func updateCornerRadius() {
    blurView?.layer.cornerRadius = currentCornerRadius
    blurView?.clipsToBounds = true
    layer.cornerRadius = currentCornerRadius
  }
}
