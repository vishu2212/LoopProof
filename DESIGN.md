---
name: LoopProof
description: Evidence-Gated E-Waste Traceability Platform
colors:
  primary: "#143823"
  primary-hover: "#0d2819"
  primary-soft: "#E9F2EC"
  neutral-bg: "#FAF9F5"
  surface: "#ffffff"
  surface-subtle: "#F6F4ED"
  surface-raised: "#EFECE3"
  surface-inset: "#F0EDE4"
  sidebar: "#143823"
  sidebar-border: "#0e2b1b"
  sidebar-hover: "#19442b"
  text-primary: "#1A1C1B"
  text-secondary: "#404843"
  muted: "#5C635E"
  subtle: "#828B85"
  border: "#DBD4C4"
  border-strong: "#BFB6A3"
  border-hairline: "#E8E2D5"
  warn: "#A86F1D"
  warn-bg: "#FAF3E8"
  warn-border: "#F2D8A8"
  bad: "#8F261B"
  bad-bg: "#FDF0EE"
  bad-border: "#F4BEB7"
typography:
  display:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.84375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace'
    fontSize: "0.78125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.01em"
rounded:
  xs: "3px"
  sm: "5px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
---

# Design System

<!-- impeccable:design-schema 1 -->

## Overview

LoopProof's visual archetype is **Premium Enterprise SaaS × Evidence Ledger × Circular Industry**. The interface balances 80% clean enterprise clarity with 20% physical depth and tactile dimensionality. It eschews generic AI gradient aesthetics in favor of authoritative archival styling inspired by industrial custody logs and laboratory reports.

## Colors

- **Deep Forest Green (`#143823`)**: Anchors the dark persistent sidebar, primary call-to-action buttons, verified state badges, and brand highlights.
- **Warm Ivory (`#FAF9F5`)**: Background canvas providing warmth and reducing harsh glare during continuous audit inspection.
- **Carbon Ink (`#1A1C1B`)**: High-contrast, legible typography for headings, metrics, and critical data points.
- **Muted Inks (`#404843`, `#5C635E`, `#828B85`)**: Used for secondary copy, timestamps, and supporting metadata.
- **Ochre (`#A86F1D`)**: Indicates unverified claims, pending auditor reviews, and transitional custody handoffs.
- **Oxide Red (`#8F261B`)**: Highlights immutable verification exceptions (`RETURNED`, `REJECTED`), contract discrepancies, and blocked certifications.
- **Hairline Borders (`#DBD4C4`, `#E8E2D5`)**: Precise structural separation of ledgers, tables, and nested cards.

## Typography

- **Sans-Serif (`Inter`)**: High-legibility font with tabular numerals for interface copy, table rows, and editorial titles.
- **Monospace (`JetBrains Mono`, `ui-monospace`)**: Reserved for cryptographic hashes, batch IDs (`DEMO-001`, `LP-XXXXX`), Ethereum addresses, and ISO timestamps.

## Layout

- **Fixed Sidebar + Dynamic Workspace**: 240px persistent deep-green sidebar on desktop with fluid responsive collapse on smaller screens.
- **Compact Status Bar**: Top bar displaying current operating environment (Offline Synthetic Demo vs. Live Registry) with environment toggle.
- **Grid Structure**: 4-column KPI metric summary on desktop, folding gracefully into 2-column or 1-column layouts on mobile.

## Elevation & Depth

- **Layered Ambient Shadows**:
  - `--shadow-card`: `0 1px 3px rgba(26, 28, 27, 0.04), 0 4px 12px rgba(26, 28, 27, 0.03)`
  - `--shadow-elevated`: `0 4px 16px rgba(26, 28, 27, 0.06), 0 1px 3px rgba(26, 28, 27, 0.04)`
- **Edge Highlights**: Inset top-edge highlight `inset 0 1px 0 rgba(255, 255, 255, 0.85)` on light cards simulating physical bevels.

## Shapes

- Restrained corner radii: 3px to 8px maximum. Avoid overly rounded "pill" cards for content containers to maintain ledger authority.

## Components

- **KPI Cards**: Exactly 4 summary metric panels on the dashboard. Elevated with subtle border definition.
- **Lifecycle Rail**: 5 connected stages (`REGISTERED` → `COLLECTED` → `RECEIVED` → `PROCESSED_CLAIMED` → `VERIFIED`) with clear progress connectors.
- **Ledger Tables**: High-density rows with hairline dividers, monospaced identifiers, status badges, and hover state transitions.
- **Copyable Hash**: Monospaced hash snippet with accessible copy-to-clipboard button and momentary `✓ Copied` feedback.

## Do's and Don'ts

- **DO** show exact grams alongside kilogram totals for precision ($10,000\text{ g (10.0 kg)}$).
- **DO** gate environmental impact metrics until a batch is verified.
- **DON'T** use glowing green checkmarks or badges for unverified processing claims.
- **DON'T** use floating glassmorphism or floating neon gradients.
