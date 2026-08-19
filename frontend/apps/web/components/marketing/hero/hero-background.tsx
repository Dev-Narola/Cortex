/**
 * HeroBackground — the ambient field that
 * sits *behind* the hero content.
 *
 * **F8 Part 1.** Pure CSS, no JS, no SVG.
 * The visual is a soft radial gradient
 * (ember + volt) that fills the hero
 * section. The spec allows:
 *
 *   - abstract node-network rendering
 *   - gradient mesh textures
 *   - actual product UI
 *   - no generic AI robot/brain imagery
 *
 * A gradient mesh is the lightest option
 * and the right choice for "atmosphere"
 * (the actual node field lives in
 * `<HeroVisual />`, which sits in front of
 * this background).
 *
 * **Why a single gradient layer.** Multiple
 * overlapping radial gradients risk
 * "muddy" middle tones. The design system
 * uses OKLCH tokens so the ember ↔ volt
 * transition stays perceptually clean.
 *
 * **Decorative.** Marked `aria-hidden`
 * (the headline + supporting copy already
 * carry the meaning in text — a screen
 * reader doesn't need to interpret a
 * gradient).
 */
export function HeroBackground() {
  return (
    <div
      aria-hidden
      data-testid="hero-background"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Primary ember glow (top-left). */}
      <div
        className="absolute -top-32 -left-24 h-[40rem] w-[40rem] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, oklch(0.85 0.13 50 / 0.55), transparent 65%)",
        }}
      />
      {/* Volt glow (bottom-right). */}
      <div
        className="absolute -bottom-32 -right-24 h-[40rem] w-[40rem] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, oklch(0.85 0.14 145 / 0.45), transparent 65%)",
        }}
      />
      {/* Faint paper-white wash so the
          gradient doesn't compete with the
          body copy. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
    </div>
  )
}
