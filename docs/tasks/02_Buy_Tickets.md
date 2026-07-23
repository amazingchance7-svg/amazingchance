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
# Technical Constraints

- Use Next.js App Router.
- Use TypeScript only.
- Use Tailwind CSS only.
- Use reusable React components.
- No inline styles.
- No mock backend.
- No hardcoded API endpoints.
- Prepare the code for future Supabase and Stripe integration.
 ---
 # Out of Scope

Do NOT implement:

- Authentication
- Payment processing
- Stripe integration
- Supabase integration
- Ticket generation
- Email notifications
- User Dashboard
- Admin Panel
- Draw logic
- Transparency Center

Only implement the Buy Tickets page and navigation to Checkout.

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

Read the following document first:

- docs/tasks/00_Master_Context.md

Then read this task completely.

Implement ONLY the Buy Tickets feature described in this document.

Requirements:

- Reuse existing components whenever possible.
- Preserve the approved Landing Page design.
- Use Next.js App Router, TypeScript and Tailwind CSS.
- Create clean, reusable and maintainable components.
- Prepare the architecture for future Supabase and Stripe integration.
- Do not implement authentication, payment processing or backend logic.
- Do not modify unrelated pages or components.
- Ensure the page works correctly on desktop and mobile devices.

---

# Acceptance Criteria

- User can select predefined ticket quantities.
- User can enter a custom ticket quantity.
- Total price updates instantly.
- Weekly and Annual Jackpot contributions are displayed.
- Continue to Checkout button is disabled when quantity equals zero.
- Continue to Checkout button navigates to the Checkout page.
- Layout is fully responsive.
- No console errors.
- No TypeScript errors.
- Existing Landing Page functionality remains unchanged.

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


