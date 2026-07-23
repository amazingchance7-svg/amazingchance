# 02 — Buy Tickets

## Status

Ready

---

# Business Goal

Enable users to purchase lottery tickets in the fastest, simplest and most trustworthy way.

This feature is a core part of the MVP and must be production-ready.

---

# User Goal

The user wants to:

- Choose how many tickets to buy.
- Instantly see the total price.
- Understand what they are purchasing.
- Continue to secure checkout.

---

# Current State

Existing functionality:

- Landing Page
- Live Weekly Jackpot
- Countdown Timer
- Get Your Tickets button
- Verify Ticket modal

Clicking **Get Your Tickets** starts this flow.

---

# Functional Requirements

## Ticket Quantity

The user can select:

- 1
- 5
- 10
- 25
- 50
- 100

A custom quantity field must also be available.

---

## Live Calculation

Update instantly without page reload.

Display:

- Number of Tickets
- Price per Ticket ($1)
- Total Price
- Weekly Jackpot Contribution
- Annual Jackpot Contribution

---

## Purchase Summary

Display:

- Weekly Draw ID
- Draw Date
- Countdown
- Selected Quantity
- Total Price

---

## Primary Action

Button:

Continue to Checkout

Disabled until:

Ticket Quantity > 0

---

# Non-Functional Requirements

- Responsive
- Accessible
- Mobile friendly
- Keyboard navigation
- Fast rendering
- Reusable React components
- TypeScript
- Tailwind CSS
- Production-ready quality

---

# Future Integrations

- Supabase
- Stripe
- Ticket Generator
- User Dashboard
- Transparency Center

Do not implement integrations yet.

Only prepare the architecture.

---

# Do Not Change

Do not redesign Landing Page.

Do not modify Hero.

Do not change colors.

Do not change typography.

Do not modify existing animations.

Do not rename routes.

Reuse existing design system.

---

# Execution Prompt

Read and follow:

- docs/tasks/00_Master_Context.md

Implement the Buy Tickets feature exactly as specified in this document.

Requirements:

- Reuse the existing design system.
- Preserve all approved UI.
- Build production-quality React components.
- Use Next.js, TypeScript and Tailwind CSS.
- No placeholder architecture.
- Prepare the feature for future Supabase and Stripe integration.
- Do not implement payment yet.
- Do not modify unrelated pages or components.
- Desktop and mobile must both work correctly.

---

# Acceptance Criteria

- Ticket quantity can be selected.
- Custom quantity works.
- Live calculation updates instantly.
- Continue button behaves correctly.
- Design matches the Landing Page.
- Responsive on desktop and mobile.
- No existing functionality is broken.

---

# Manual Review Checklist

- [ ] Premium appearance
- [ ] Easy to understand
- [ ] Mobile verified
- [ ] Desktop verified
- [ ] Live calculation works
- [ ] Continue button works
- [ ] Existing design preserved
- [ ] Ready for Checkout integration

---

# Dependencies

Previous:

- 00_Master_Context
- Landing Page

Next:

- 03_Checkout

---

# Status

Ready
