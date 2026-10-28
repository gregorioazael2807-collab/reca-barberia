---
name: Obsidian Atelier
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d0c5af'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#99907c'
  outline-variant: '#4d4635'
  surface-tint: '#e9c349'
  primary: '#f2ca50'
  on-primary: '#3c2f00'
  primary-container: '#d4af37'
  on-primary-container: '#554300'
  inverse-primary: '#735c00'
  secondary: '#eec14a'
  on-secondary: '#3e2e00'
  secondary-container: '#b38b12'
  on-secondary-container: '#362800'
  tertiary: '#f3c966'
  on-tertiary: '#3f2e00'
  tertiary-container: '#d5ae4e'
  on-tertiary-container: '#584200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe088'
  primary-fixed-dim: '#e9c349'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#ffdf97'
  secondary-fixed-dim: '#eec14a'
  on-secondary-fixed: '#251a00'
  on-secondary-fixed-variant: '#5a4400'
  tertiary-fixed: '#ffdf9a'
  tertiary-fixed-dim: '#ebc15f'
  on-tertiary-fixed: '#251a00'
  on-tertiary-fixed-variant: '#5a4300'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes an exclusive, private-sanctuary atmosphere tailored for a master craftsman's single-chair barbershop. The aesthetic fuses Android Material 3 tactile surface principles with high-end luxury hospitality cues: deep carbon finishes, warm graphite planes, and deliberate champagne gold metallurgy. 

The visual tone communicates uncompromising precision, discretion, and heritage craftsmanship through modern digital architecture. Generous breathing room, hyper-intentional micro-interactions, and subdued ambient warmth replace loud promotional design patterns. The user experiences the digital touchpoint not merely as a utility booking flow, but as an elevated prelude to an artisanal grooming ritual.

## Colors

The palette balances pitch-level obsidian backdrops with elevated warm graphite containers and champagne gold metallic accents.

- **Canvas & Backgrounds:** The base viewport utilizes `#0D0D0D` (Obsidian Base), transitioning into `#161616` (Carbon Layer) for secondary canvases and low-level groupings.
- **Surface Architecture:** Content cards sit on `#1E1E22` (Graphite Surface Tier 1), elevating to `#26262B` (Graphite Surface Tier 2) for interactive tiles, bottom sheets, and elevated overlays.
- **Primary & Metallic Accents:** Champagne gold (`#D4AF37`) commands primary attention, paired with `#E5B842` for interactive hover/press states and `#F3C966` reserved for micro-highlights and rating fills. Structural division leverages `#3D3522` (Patina Gold Border) to form hairline delineations without breaking dark-mode immersion.
- **Typography & Content:** High-contrast text uses `#E8E8E8` for optimal legibility, counterbalanced by `#A0A0A5` (Warm Muted Gray) for metadata, inactive states, and secondary descriptions.

## Typography

The type system pairs **Space Grotesk**—an authoritative, structured geometric grotesque for headlines—with **Manrope**—a precision-engineered, humanist-grotesque hybrid that ensures effortless readability on dark OLED displays.

Numeric values, service pricing, and booking timestamps lean on Space Grotesk's tabular qualities to reinforce precision. Micro-labels, badge descriptors, and button titles use Manrope with slight positive tracking (`0.01em` to `0.04em`) to prevent visual bleed against high-density black backdrops.

## Layout & Spacing

The layout is built for fluid mobile-first presentation, utilizing a 4-column fluid grid system on standard mobile screens (360dp–480dp) with `1rem` (16px) margins and gutters. 

Vertical spacing adheres strictly to an 8dp baseline grid (with 4dp micro-increments for compact badges and label-to-input pairings). Every interactive target enforces a strict minimum footprint of 48×48dp, in accordance with Android Material 3 accessibility guidelines. Sticky booking actions are seated within anchored bottom navigation zones with `safe-area-inset-bottom` compensation and `space-md` internal padding.

## Elevation & Depth

Visual hierarchy is created through Material 3 tonal surface stacking combined with targeted, warm ambient luminescences:

- **Level 0 (Base Canvas):** Flat `#0D0D0D`, absorbing ambient screen light.
- **Level 1 (Surface Cards & Lists):** Flat `#1E1E22` paired with a 1px structural stroke of `#3D3522` at 40% opacity. No hard black drop shadow; relies purely on luminance differentiation.
- **Level 2 (Interactive Floating Cards / Bottom Sheets):** Background of `#26262B` with a diffuse ambient shadow: `0px 12px 32px -4px rgba(0, 0, 0, 0.60)`.
- **Level 3 (Golden Glow CTAs & Active Elements):** Interactive active states and primary booking buttons utilize a concentrated warm radiant bloom: `0px 8px 24px 0px rgba(212, 175, 55, 0.25)`, scaling to `0px 12px 32px 0px rgba(229, 184, 66, 0.35)` upon press.

## Shapes

The interface embraces a structured yet softened geometry. Service cards, detail sheets, and hero banners adopt `1rem` (16px) corners (`rounded-lg` mapping to `rounded-2xl` in Material 3 parlance), providing a welcoming, contemporary frame. 

Atomic UI elements like status tags, filter chips, time availability slots, and avatar rings adopt fully rounded pill forms (`rounded-full` / 9999px), offering visual contrast against the broader card planes.

## Components

### Primary Golden Glowing CTA
- **Dimensions:** Minimum 48px height (ideally 56px for primary checkout actions), full-width or dynamic layout.
- **Style:** Background `#D4AF37`, transitioning to `#E5B842` on press. Text color `#0D0D0D` set in `label-lg` (Space Grotesk / Manrope Bold).
- **Elevation:** Warm radiant bloom (`rgba(212, 175, 55, 0.25)`).

### Service Cards
- **Dimensions:** Minimum touch area spanning full column grid, internal padding `space-md` (16px).
- **Style:** Background `#1E1E22`, 1px hairline border of `#3D3522`, corner radius 16px. 
- **Content:** Title (`headline-sm`, `#E8E8E8`), duration metadata (`body-sm`, `#A0A0A5`), and pricing badge in champagne gold (`#F3C966`).

### Availability Slot Chips
- **Dimensions:** Minimum 48px target box, pill-shaped radius (9999px), padding `0.5rem 1rem`.
- **States:** 
  - *Available:* `#1E1E22` surface, `#3D3522` border, text `#E8E8E8`.
  - *Selected:* Solid `#D4AF37` fill, text `#0D0D0D` with golden radiant halo.
  - *Unavailable:* `#161616` surface, border `#26262B`, text `#A0A0A5` at 40% opacity, strikethrough styling optional.

### Status Badges & Pills
- **Style:** Pill form, compact padding (`0.25rem 0.75rem`).
- **Variants:** "Master Barber" or "Confirmed" displays `#26262B` background with `#D4AF37` text and a subtle 1px `#3D3522` border.

### Rating Indicators
- **Style:** 5-star cluster using `#F3C966` for active fills and `#26262B` for empty stars, accompanied by numeric score in `label-md` (`#E8E8E8`).

### Input Fields
- **Style:** 56px height, container fill `#161616`, bottom border or full perimeter border in `#3D3522`. Floating labels transition to `#D4AF37` on focus with zero background bleeding.