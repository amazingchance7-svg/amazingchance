# 02 — Buy Tickets

## Status

Draft

---

# Business Goal

Allow users to purchase lottery tickets in the simplest, fastest and most trustworthy way possible.

The purchase flow should maximize conversion while maintaining complete transparency.

---

# User Goal

The user wants to:

- Choose how many tickets to buy.
- See the total price immediately.
- Understand how much goes to the jackpot.
- Complete the purchase in as few steps as possible.
- Receive purchased tickets instantly.

---

# Current State

Landing Page already contains:

- Get Your Tickets button
- Verify Every Ticket
- Live Jackpot
- Countdown

Clicking "Get Your Tickets" should start this flow.

---

# Functional Requirements

The Buy Tickets page must allow users to:

## Select ticket quantity

Available options:

- 1
- 5
- 10
- 25
- 50
- 100

The user may also enter a custom quantity.

---

## Live price calculation

Price per ticket:

$1

Display:

Tickets

Price per Ticket

Total

Contribution to Weekly Jackpot

Contribution to Annual Jackpot

---

## Live update

Changing ticket quantity updates:

- Total price
- Weekly Jackpot contribution
- Annual Jackpot contribution

without reloading the page.

---

## Purchase summary

Display:

Weekly Draw ID

Next Draw Countdown

Selected Quantity

Price

Expected Ticket Range (after successful payment)

---

## Continue button

Primary CTA:

Continue to Checkout

The button remains disabled until:

Ticket Quantity > 0

---

# Non-Functional Requirements

Responsive

Accessible

Keyboard friendly

Fast

Reusable React components

TypeScript

No duplicated logic

---

# Edge Cases

User enters zero.

User enters negative number.

User enters non-numeric value.

User enters extremely large value.

Connection lost.

Server unavailable.

---

# Future Integration

Supabase

Stripe

Ticket Generator

Dashboard

Payment History

Transparency Center

---

# Do Not Change

Do not redesign Landing.

Do not redesign Hero.

Do not change colors.

Do not modify existing components.

Reuse design system.

---

# AI Implementation Prompt

(To be added before sending to AI.)

---

# Acceptance Criteria

User can select ticket quantity.

Price updates instantly.

Summary updates instantly.

Continue button works correctly.

Desktop works.

Mobile works.

Accessibility passes.

---

# Manual Review Checklist

□ Premium appearance

□ Easy to understand

□ Mobile friendly

□ Desktop friendly

□ Fast interaction

□ No visual glitches

□ Design unchanged

□ Ready for Checkout integration

---

# Status

Draft
