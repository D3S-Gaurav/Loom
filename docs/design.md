---
name: Loom
description: A precise neon relay console for live, durable agent swarms.
colors:
  canvas: "#08070d"
  surface: "#100e19"
  surface-raised: "#171322"
  line: "#2b253a"
  ink: "#f6f3ff"
  text: "#e1dbea"
  muted: "#aaa1b9"
  accent: "#a78bfa"
  cyan: "#67e8f9"
  success: "#6ee7b7"
  warning: "#fbbf24"
  danger: "#fda4af"
typography:
  headline:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "5rem"
    fontWeight: 720
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 720
    lineHeight: 1.3
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  xs: "4px"
  sm: "8px"
  control: "10px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px"
    height: "45px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
---

# Design System: Loom

## Overview

**Creative North Star: "The Neon Relay Console"**

Loom feels like a focused operations instrument in a low-light workspace: quiet at rest, visibly alive when work is moving. Dark tonal layers keep dense orchestration legible; violet identifies intent and selection, while cyan behaves like a live signal traveling between agents. Glass is permitted only where it clarifies hierarchy or preserves spatial context.

The product is precise, energetic, and technically credible. It rejects generic hackathon dashboards, decorative sci-fi chrome, illegible low-contrast glass, and card grids that obscure the core workflow. Familiar controls disappear into the task while the execution graph carries the product's distinctive identity.

**Key Characteristics:**

- Dense but calm product surfaces
- A single connected SVG icon language
- Neon reserved for live state, focus, and important action
- Tonal depth instead of decorative shadow stacks
- Strong goal-first hierarchy across every viewport

## Colors

The palette is a restrained ultraviolet system with cyan used as live telemetry, never as ambient decoration.

### Primary

- **Relay Violet:** Primary actions, selected agents, focus, and the Loom waveform.

### Secondary

- **Signal Cyan:** Live connections, infrastructure signals, links, and time-sensitive state.

### Tertiary

- **Validation Mint:** Completed work, healthy dependencies, and verified outcomes.
- **Warning Gold / Failure Rose:** Reserved semantic feedback; never used for brand decoration.

### Neutral

- **Deep Console:** Page canvas and graph field.
- **Ink Surface / Raised Surface:** Functional panels, controls, and popovers.
- **Soft White / Operational Gray:** Primary reading text and supporting labels.

### Named Rules

**The Signal Earns the Glow Rule.** Violet and cyan glow only when work is active, focused, or selected. Static decoration stays tonal.

**The State Is More Than Color Rule.** Every success, warning, live, or failure state also carries a label or icon.

## Typography

**Display Font:** System UI sans
**Body Font:** System UI sans
**Label/Mono Font:** SFMono-compatible system monospace

**Character:** One highly legible sans family carries the product interface. Monospace is restricted to execution state, timing, infrastructure, and machine-readable labels.

### Hierarchy

- **Headline:** Auth showcase only; tightly balanced and capped below the product ceiling.
- **Title:** Panel, form, and outcome headings.
- **Body:** Explanations and generated content, with long prose capped around 70 characters where layout permits.
- **Label:** Compact status and telemetry; sentence case by default.

### Named Rules

**The Product Speaks Normally Rule.** Uppercase and wide tracking are forbidden as generic section scaffolding. Machine labels may use monospace, but ordinary interface copy stays in sentence case.

## Elevation

Loom uses tonal layering and precise one-pixel boundaries. Surfaces are flat at rest. A separate pseudo-element may create a low-opacity agent glow during live computation; standard panels and controls do not combine borders with broad decorative shadows.

### Named Rules

**The Flat Until Active Rule.** Depth responds to focus, selection, popover state, or live computation. Static content never floats merely to look premium.

**The Glass Has a Job Rule.** Transparency may preserve graph or canvas context. If an opaque surface communicates the same hierarchy, use the opaque surface.

## Components

### Buttons

- **Shape:** Compact, gently curved edges using the small radius.
- **Primary:** Solid Relay Violet, dark ink, minimum 44px touch height, icon plus explicit action label.
- **Hover / Focus:** One-pixel lift on hover; Signal Cyan two-pixel focus outline; no decorative glow.
- **Secondary / Ghost:** Tonal background or transparent surface with a visible boundary and full keyboard state.

### Chips

- **Style:** Full pill, raised neutral background, concise example or filter copy.
- **State:** Hover increases boundary contrast. Selected state must add text or icon feedback if introduced.

### Cards / Containers

- **Corner Style:** Medium-to-large radii only; panels top out at 16px.
- **Background:** Ink Surface for tools, Deep Console for the graph.
- **Shadow Strategy:** None at rest; tonal layers and borders define structure.
- **Border:** One-pixel operational boundary.
- **Internal Padding:** 12–16px for product panels; wider spacing is reserved for authentication storytelling.

### Inputs / Fields

- **Style:** Dark inset field, one-pixel boundary, left-aligned SVG icon where it improves recognition.
- **Focus:** Relay Violet boundary plus the global Signal Cyan keyboard outline.
- **Error / Disabled:** Explicit error copy, semantic color, and reduced opacity with disabled cursor.

### Navigation

The authenticated header uses compact labeled controls and native details-based account/status popovers. Mobile reduces labels before removing actions; account, billing, source, and system state remain reachable.

### Goal Composer

The goal composer is the workspace's primary control. It supports multi-line intent, Command/Ctrl + Enter deployment, concise example chips, and a visible Plan → Execute → Validate → Synthesize model. It always remains visually dominant over recent runs and system chrome.

### Agent Node

Each node combines one consistent SVG role icon, role color, human title, explicit status, and optional output preview. Live glow belongs to a separate layer; selection uses a precise role-colored boundary.

## Do's and Don'ts

### Do:

- **Do** make goal, graph, selected output, and final deliverable read as one workflow.
- **Do** use SVG icons from the shared icon system rather than emoji or text glyphs.
- **Do** preserve visible keyboard focus, reduced motion, and WCAG 2.2 AA contrast.
- **Do** keep billing, authentication, system state, and errors familiar and explicit.
- **Do** use neon to indicate action, computation, selection, or verified state.

### Don't:

- **Don't** build generic hackathon dashboards or describe Loom as a hackathon entry.
- **Don't** add decorative sci-fi chrome, illegible low-contrast glass, or neon effects without meaning.
- **Don't** use card grids that obscure the core workflow or nest cards inside cards.
- **Don't** make the interface require repository knowledge to understand the product.
- **Don't** hide system state or make account and billing actions feel experimental.
- **Don't** use gradient text, side-stripe accents, sketchy SVG scenes, or broad ghost-card shadows.
- **Don't** use radii above 16px on panels, forms, or agent nodes.
