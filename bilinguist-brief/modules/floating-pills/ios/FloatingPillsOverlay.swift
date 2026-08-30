import UIKit

// ── Colour map matching FlagCircle.tsx FLAG_COLORS ────────────────────────────
private let FLAG_COLORS: [String: UIColor] = [
  "fr": UIColor(red: 0/255,   green: 35/255,  blue: 149/255, alpha: 1),
  "de": UIColor(red: 255/255, green: 206/255, blue: 0/255,   alpha: 1),
  "sv": UIColor(red: 0/255,   green: 106/255, blue: 167/255, alpha: 1),
  "en": UIColor(red: 207/255, green: 20/255,  blue: 43/255,  alpha: 1),
  "it": UIColor(red: 0/255,   green: 146/255, blue: 70/255,  alpha: 1),
  "es": UIColor(red: 170/255, green: 21/255,  blue: 27/255,  alpha: 1),
  "tr": UIColor(red: 227/255, green: 10/255,  blue: 23/255,  alpha: 1),
  "hu": UIColor(red: 67/255,  green: 111/255, blue: 77/255,  alpha: 1),
  "ar": UIColor(red: 0/255,   green: 108/255, blue: 53/255,  alpha: 1),
]

private let FLAG_EMOJI: [String: String] = [
  "fr":"🇫🇷","de":"🇩🇪","sv":"🇸🇪","en":"🇬🇧",
  "it":"🇮🇹","es":"🇪🇸","tr":"🇹🇷","hu":"🇭🇺","ar":"🇸🇦",
]

// ── Tab definitions matching FloatingTabBar.tsx ───────────────────────────────
private let TABS: [(route: String, iconOn: String, iconOff: String)] = [
  ("Preferences", "slider.horizontal.3",         "slider.horizontal.3"),
  ("Briefing",    "newspaper.fill",               "newspaper"),
  ("Practice",    "graduationcap.fill",           "graduationcap"),
]

// ─────────────────────────────────────────────────────────────────────────────
class FloatingPillsOverlay: UIView {

  var onTabPress:  ((String) -> Void)?
  var onLangPress: ((String) -> Void)?

  // ── Geometry ──────────────────────────────────────────────────────────────
  private let PILL_H:   CGFloat = 54
  private let SIDE_PAD: CGFloat = 16
  private let GAP:      CGFloat = 12
  private let FLAG_D:   CGFloat = 36   // flag circle diameter — matches RN
  private var bottomInset: CGFloat = 34

  // ── Pills ─────────────────────────────────────────────────────────────────
  private let leftPill:  UIVisualEffectView
  private let rightPill: UIVisualEffectView

  // Content lives inside contentView (renders above the glass)
  private var flagViews:  [UIView]   = []
  private var tabButtons: [UIButton] = []
  private let flagStack  = UIStackView()
  private let tabStack   = UIStackView()

  private var languages:  [String] = []
  private var activeTab   = "Briefing"

  // ── Init ──────────────────────────────────────────────────────────────────
  override init(frame: CGRect) {
    if #available(iOS 26.0, *) {
      let lg = UIGlassEffect(); lg.isInteractive = true
      leftPill  = UIVisualEffectView(effect: lg)
      let rg = UIGlassEffect(); rg.isInteractive = true
      rightPill = UIVisualEffectView(effect: rg)
    } else {
      leftPill  = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
      rightPill = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
    }
    super.init(frame: frame)
    backgroundColor = .clear
    isUserInteractionEnabled = true
    buildPills()
  }
  required init?(coder: NSCoder) { fatalError() }

  // ── Build ─────────────────────────────────────────────────────────────────
  private func buildPills() {
    for pill in [leftPill, rightPill] {
      pill.layer.shadowColor   = UIColor.black.cgColor
      pill.layer.shadowOpacity = 0.20
      pill.layer.shadowRadius  = 20
      pill.layer.shadowOffset  = CGSize(width: 0, height: 6)
      addSubview(pill)
    }

    // Left pill: horizontal stack of flag circles — inside contentView
    flagStack.axis        = .horizontal
    flagStack.spacing     = 6
    flagStack.alignment   = .center
    flagStack.isUserInteractionEnabled = false
    leftPill.contentView.addSubview(flagStack)

    // Right pill: three nav buttons — inside contentView
    tabStack.axis         = .horizontal
    tabStack.spacing      = 0
    tabStack.alignment    = .center
    tabStack.distribution = .fillEqually
    rightPill.contentView.addSubview(tabStack)

    buildTabButtons()
  }

  private func buildTabButtons() {
    for (i, tab) in TABS.enumerated() {
      let isActive = tab.route == activeTab
      let symbolName = isActive ? tab.iconOn : tab.iconOff
      let cfg = UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)
      let img = UIImage(systemName: symbolName, withConfiguration: cfg)
      let btn = UIButton(type: .system)
      btn.setImage(img, for: .normal)
      btn.tintColor = isActive ? .label : UIColor.label.withAlphaComponent(0.38)
      btn.tag = i
      btn.addTarget(self, action: #selector(tabTapped(_:)), for: .touchUpInside)
      tabButtons.append(btn)
      tabStack.addArrangedSubview(btn)
    }
  }

  // ── Flag circles — replicates FlagCircle.tsx ─────────────────────────────
  private func makeFlagCircle(code: String) -> UIView {
    let container = UIView(frame: CGRect(x: 0, y: 0, width: FLAG_D, height: FLAG_D))
    let color = FLAG_COLORS[code] ?? .systemGray
    container.backgroundColor = color.withAlphaComponent(0.9)
    container.layer.cornerRadius = FLAG_D / 2
    container.clipsToBounds = true

    let lbl = UILabel(frame: container.bounds)
    lbl.text          = FLAG_EMOJI[code] ?? "🌐"
    lbl.font          = .systemFont(ofSize: 20)
    lbl.textAlignment = .center
    lbl.isUserInteractionEnabled = false
    container.addSubview(lbl)

    // Subtle inner border (matches FlagCircle ring style)
    let ring = CALayer()
    ring.frame          = container.bounds
    ring.cornerRadius   = FLAG_D / 2
    ring.borderWidth    = 1.5
    ring.borderColor    = UIColor.white.withAlphaComponent(0.3).cgColor
    container.layer.addSublayer(ring)

    return container
  }

  // ── Public API ────────────────────────────────────────────────────────────
  func setLanguages(_ codes: [String]) {
    languages = codes
    flagStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    flagViews.removeAll()

    let visible = Array(codes.prefix(5))
    for code in visible {
      let v = makeFlagCircle(code: code)
      v.widthAnchor.constraint(equalToConstant: FLAG_D).isActive  = true
      v.heightAnchor.constraint(equalToConstant: FLAG_D).isActive = true
      v.translatesAutoresizingMaskIntoConstraints = false
      flagStack.addArrangedSubview(v)
      flagViews.append(v)
    }

    if visible.isEmpty {
      let lbl = UILabel()
      lbl.text = "🌐"; lbl.font = .systemFont(ofSize: 22)
      flagStack.addArrangedSubview(lbl)
    }

    setNeedsLayout(); layoutIfNeeded()
  }

  func setActiveTab(_ tab: String) {
    activeTab = tab
    for (i, btn) in tabButtons.enumerated() {
      let isActive = TABS[i].route == tab
      let sym = isActive ? TABS[i].iconOn : TABS[i].iconOff
      let cfg = UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)
      btn.setImage(UIImage(systemName: sym, withConfiguration: cfg), for: .normal)
      btn.tintColor = isActive ? .label : UIColor.label.withAlphaComponent(0.38)
    }
  }

  func setBottomInset(_ inset: CGFloat) {
    bottomInset = inset + 16
    setNeedsLayout()
  }

  func setDark(_ isDark: Bool) {
    overrideUserInterfaceStyle = isDark ? .dark : .light
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  override func layoutSubviews() {
    super.layoutSubviews()

    let W = bounds.width
    let pillY = bounds.height - bottomInset - PILL_H
    let r = PILL_H / 2

    // Right pill — fixed width (54 × 3 buttons = 162, padded to ~180)
    let rightW: CGFloat = 180
    rightPill.frame = CGRect(x: W - SIDE_PAD - rightW, y: pillY, width: rightW, height: PILL_H)
    applyCorners(to: rightPill, radius: r)
    tabStack.frame = rightPill.contentView.bounds

    // Left pill — width from flag circles
    let count  = max(1, min(languages.count, 5))
    let leftW  = CGFloat(count) * (FLAG_D + 6) - 6 + 28   // stacked flags + padding
    leftPill.frame = CGRect(x: SIDE_PAD, y: pillY, width: leftW, height: PILL_H)
    applyCorners(to: leftPill, radius: r)
    // Centre the flag stack vertically inside contentView
    let stackW = CGFloat(count) * (FLAG_D + 6) - 6
    flagStack.frame = CGRect(
      x: (leftW - stackW) / 2,
      y: (PILL_H - FLAG_D) / 2,
      width: stackW,
      height: FLAG_D
    )
  }

  private func applyCorners(to pill: UIVisualEffectView, radius: CGFloat) {
    if #available(iOS 26.0, *) {
      #if compiler(>=6.2)
      let r = UICornerRadius(floatLiteral: radius)
      pill.cornerConfiguration = .corners(
        topLeftRadius: r, topRightRadius: r,
        bottomLeftRadius: r, bottomRightRadius: r
      )
      #else
      pill.layer.cornerRadius = radius
      #endif
    } else {
      pill.layer.cornerRadius = radius
      pill.clipsToBounds = true
    }
  }

  // ── Touch passthrough — only pills intercept touches ─────────────────────
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    for pill in [leftPill, rightPill] {
      let local = convert(point, to: pill)
      if pill.bounds.contains(local) {
        return pill.hitTest(local, with: event) ?? pill
      }
    }
    return nil
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  @objc private func tabTapped(_ sender: UIButton) {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    onTabPress?(TABS[sender.tag].route)
  }
}
