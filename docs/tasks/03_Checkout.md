# 03 — Checkout

## Status

Ready
 
---

# Business Goal

Provide users with a clear, secure and trustworthy checkout experience before payment.

The Checkout page must confirm the selected ticket purchase and prepare the application for future payment integration.

---

# User Goal

The user wants to:

- Review the selected number of tickets.
- Confirm the total purchase price.
- Understand how the ticket price is distributed.
- Enter the required contact information.
- Continue to payment.
- Clearly understand what happens next.

---

# Entry Point

The user arrives from the Buy Tickets page after clicking:

Continue to Checkout

The Checkout page receives:

- Ticket quantity
- Price per ticket
- Total price
- Weekly Jackpot contribution
- Annual Jackpot contribution
- Weekly Draw ID
- Draw date

For the MVP, these values may be transferred through the existing frontend state or route parameters.

Do not create backend storage yet.

---

# Functional Requirements

## Purchase Summary

Display:

- Weekly Draw ID
- Draw date
- Selected ticket quantity
- Price per ticket
- Total price
- Weekly Jackpot contribution
- Annual Jackpot contribution
- Platform contribution

The summary must update correctly based on the data received from the Buy Tickets page.

---

## Price Distribution

For every $1 ticket:

- 70% goes to the Weekly Prize Pool
- 10% goes to the Annual Jackpot
- 20% goes to the Platform

Display the calculated amounts for the complete purchase.

Example:

For 10 tickets:

- Total: $10.00
- Weekly Prize Pool: $7.00
- Annual Jackpot: $1.00
- Platform: $2.00

All calculations must use a single shared calculation utility.

Do not duplicate calculation logic across components.

---

## Contact Information

The user must enter:

- Email address

The email field is required.

The user may optionally enter:

- Telegram username

Do not require account registration at this stage.

---

## Email Validation

The email field must:

- Reject an empty value.
- Reject an invalid email format.
- Display a clear validation message.
- Remove the error after the value becomes valid.

Example error:

Enter a valid email address.

---

## Telegram Username Validation

Telegram username is optional.

When entered:

- Allow the username with or without `@`.
- Remove unnecessary spaces.
- Do not require Telegram authentication.
- Do not connect to the Telegram API.

---

## Terms Confirmation

Display a required checkbox:

I confirm that I am at least 18 years old and agree to the Terms and Conditions and Privacy Policy.

The user cannot continue until the checkbox is selected.

The Terms and Conditions and Privacy Policy links may use placeholder routes if the pages do not exist yet.

Do not create the legal pages in this task.

---

## Primary Action

Button:

Continue to Payment

The button must be disabled when:

- Email is empty.
- Email is invalid.
- Terms confirmation is not selected.
- Purchase data is missing or invalid.
- Ticket quantity is less than 1.

For the MVP, clicking the button must not process a real payment.

Instead, it must show a temporary payment placeholder state.

---

## Secondary Action

Provide a secondary action:

Back to Ticket Selection

This action returns the user to the Buy Tickets page without changing unrelated application state.

When possible, preserve the previously selected ticket quantity.

---

# Checkout States

## Default State

Display:

- Purchase summary
- Contact form
- Terms confirmation
- Continue to Payment button

---

## Validation Error State

Display field-level validation errors.

Do not display technical error messages to the user.

---

## Missing Purchase Data State

If required purchase data is missing or invalid:

Display:

Unable to load your ticket selection.

Provide a button:

Return to Buy Tickets

Do not calculate or display a fake purchase.

---

## Payment Placeholder State

After the valid form is submitted:

Display:

Payment integration is coming next.

Also display:

- Ticket quantity
- Total price
- Email address
- Return button

This state is temporary and will be replaced by the payment provider integration.

Do not generate tickets.

Do not display a successful purchase confirmation.

---

# Data Model

Use a typed frontend data structure similar to:

```ts
type CheckoutData = {
  ticketQuantity: number
  pricePerTicket: number
  totalPrice: number
  weeklyContribution: number
  annualContribution: number
  platformContribution: number
  drawId: string
  drawDate: string
}
```

Use the existing project conventions if an equivalent type already exists.

Do not create duplicate types.

---

# Calculation Rules

Use:

```text
pricePerTicket = 1
totalPrice = ticketQuantity × pricePerTicket
weeklyContribution = totalPrice × 0.70
annualContribution = totalPrice × 0.10
platformContribution = totalPrice × 0.20
```

All monetary values must:

- Be displayed in USD.
- Use two decimal places.
- Avoid floating-point display errors.

The contribution total must equal the total purchase price.

---

# Non-Functional Requirements

- Responsive
- Mobile friendly
- Accessible
- Keyboard navigable
- Clear form labels
- Visible focus states
- Fast rendering
- Reusable React components
- TypeScript
- Tailwind CSS
- Production-quality UI

---

# Technical Constraints

- Use Next.js App Router.
- Use TypeScript only.
- Use Tailwind CSS only.
- Use reusable React components.
- Do not use inline styles.
- Do not add a mock backend.
- Do not hardcode future payment API endpoints.
- Do not store sensitive payment information.
- Do not expose secrets or environment variables.
- Reuse the existing design system.
- Reuse existing calculation logic when available.
- Keep checkout logic separate from presentation components.

---

# Suggested Components

Use existing components where possible.

Possible reusable components:

- CheckoutSummary
- PriceDistribution
- ContactInformationForm
- TermsConfirmation
- CheckoutActions
- CheckoutErrorState
- PaymentPlaceholder

Component names may follow existing project conventions.

Do not create unnecessary abstractions.

---

# Out of Scope

Do NOT implement:

- Stripe integration
- Real payment processing
- Credit card fields
- Cryptocurrency payment
- Supabase integration
- Authentication
- User registration
- Ticket generation
- Email sending
- Telegram API integration
- Purchase database records
- Successful purchase page
- Refund logic
- Admin panel
- Legal page content

Only implement the Checkout interface, validation, calculations and payment placeholder state.

---

# Future Integrations

Prepare the architecture for:

- Stripe Checkout or another payment provider
- Supabase purchase records
- User authentication
- Ticket generation
- Email confirmation
- Telegram notification
- Payment success page
- Payment failure page
- Webhook verification

Do not implement these integrations yet.

---

# Do Not Change

Do not redesign the Landing Page.

Do not redesign the Buy Tickets page.

Do not change approved colors.

Do not change approved typography.

Do not modify existing animations.

Do not rename existing routes without necessity.

Do not modify unrelated pages or components.

Reuse the existing design system.

---

# Execution Prompt

Read the following document first:

- docs/tasks/00_Master_Context.md

Then read:

- docs/tasks/02_Buy_Tickets.md
- docs/tasks/03_Checkout.md

Implement ONLY the Checkout feature described in this document.

Requirements:

- Preserve all approved existing UI.
- Reuse the existing design system.
- Reuse existing components and types whenever possible.
- Use Next.js App Router, TypeScript and Tailwind CSS.
- Receive and validate the ticket purchase data from the Buy Tickets flow.
- Implement the purchase summary and price distribution.
- Implement the email field, optional Telegram username and required terms checkbox.
- Implement all required validation states.
- Implement the missing purchase data state.
- Implement the temporary payment placeholder state.
- Do not process a real payment.
- Do not generate tickets.
- Do not add authentication or backend logic.
- Do not modify unrelated pages or components.
- Ensure the feature works correctly on desktop and mobile.
- Ensure there are no console or TypeScript errors.

---

# Acceptance Criteria

- Checkout receives the selected ticket quantity from the Buy Tickets flow.
- Purchase summary displays the correct draw and purchase information.
- Total price is calculated correctly.
- Weekly contribution is calculated as 70%.
- Annual contribution is calculated as 10%.
- Platform contribution is calculated as 20%.
- Contribution amounts equal the total price.
- All monetary values display two decimal places.
- Email is required.
- Invalid email displays a clear validation error.
- Telegram username is optional.
- Terms confirmation is required.
- Continue to Payment is disabled when the form is invalid.
- Continue to Payment becomes enabled when the form is valid.
- Valid submission opens the payment placeholder state.
- No real payment is processed.
- No tickets are generated.
- Missing purchase data displays an error state.
- Back to Ticket Selection works correctly.
- Layout is fully responsive.
- Keyboard navigation works.
- No console errors.
- No TypeScript errors.
- Existing Landing Page and Buy Tickets functionality remain unchanged.

---

# Manual Review Checklist

- [ ] Purchase summary is easy to understand
- [ ] Price distribution is transparent
- [ ] Calculations are correct
- [ ] Email validation works
- [ ] Telegram username remains optional
- [ ] Terms checkbox is required
- [ ] Continue button states work correctly
- [ ] Missing data state works
- [ ] Payment placeholder works
- [ ] Back navigation works
- [ ] Mobile verified
- [ ] Desktop verified
- [ ] Existing design preserved
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Ready for payment integration

---

# Dependencies

Previous:

- 00_Master_Context
- 02_Buy_Tickets

Next:

- 04_Registration_Login
