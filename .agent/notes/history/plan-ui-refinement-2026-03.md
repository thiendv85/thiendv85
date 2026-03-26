---
title: Kế hoạch Triển khai - Giao diện Dashboard VIP
date: 2026-03-26
category: development
tags: [ui, design-system, plan, tailwind, glassmorphism]
---

# UI/UX Premium Refinement Plan

Refine the Auto Parts Supply Chain application to a "Vibrant Premium" standard by unifying the design system and enhancing micro-interactions.

## Proposed Changes

### [UI/UX] Global Styles & Tokens
- **index.css**: Add `.glass-premium` and `.shadow-premium` utility classes for consistent high-depth effects.
- **index.html**: (Optional) Refine existing `tailwind.config` if any gaps are found in the `atp` palette.

### [UI/UX] Component Refinements
#### [MODIFY] [MetricCard.tsx](file:///d:/App/v13/components/MetricCard.tsx)
- Align `styleConfig` with `atp-primary`, `atp-secondary`, `atp-success`, and `atp-action` tokens.
- Add a subtle "inner glow" effect to cards.
- Refine hover transitions for a "smoother" feel.

#### [MODIFY] [Dashboard.tsx](file:///d:/App/v13/pages/Dashboard.tsx)
- **Table Badges**: Refine segment labels to match the "P3" style with a **3D Button Effect** (depth shadows, top highlights) and increased size for prominence.
- **Dynamic Colors**: Implement logic where the badge background color changes based on health:
    - **Green**: Healthy (No OOS/Critical items).
    - **Amber**: Warning (Has Critical items or high Excess).
    - **Red**: Alert (Has OOS items).
- **KPI Metrics**: Enhance font weights and spacing in the matrix for better readability on HD screens.
- **Executive Banner**: Refine the "Critical Stockout" banner with a more vibrant glass effect.

#### [MODIFY] [ApprovalQueue.tsx](file:///d:/App/v13/pages/ApprovalQueue.tsx)
- **Stat Cards**: Replace local `StatCard` logic with the unified `MetricCard` or sync its gradients with the `atp` palette.
- **Bulk Action Bar**: Apply `.glass-premium` for a more high-end floating effect.
