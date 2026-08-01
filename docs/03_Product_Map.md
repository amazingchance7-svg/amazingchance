# Product Map

Version: 2.0

Status: Approved

---

# Purpose

This document describes the complete user journey through Amazing Chance.

Business rules, jackpot distribution and financial logic are documented separately:

- docs/01-PRODUCT.md
- docs/05_Business_Rules.md

This document focuses only on product flow.

---

# Core User Journey

```
Landing Page
      │
      ▼
Browse Upcoming Draws
      │
      ▼
Open Draw Details
      │
      ▼
Choose Ticket Quantity
      │
      ▼
Checkout
      │
      ▼
Payment Provider
      │
      ▼
Payment Successful
      │
      ▼
Tickets Generated
      │
      ▼
Confirmation Email
      │
      ▼
Wait For Draw
      │
      ▼
Draw Executed
      │
      ▼
Results Published
      │
      ▼
Prize Paid
```

---

# Main Navigation

## Public

Home

Upcoming Draws

Past Winners

How It Works

Provably Fair

FAQ

Contact

---

## Authenticated

Dashboard

My Tickets

My Wins

Transactions

Profile

Notifications

Logout

---

# Ticket Purchase

Step 1

User selects a draw.

↓

Step 2

User selects number of tickets.

↓

Step 3

System calculates total price.

↓

Step 4

User proceeds to checkout.

↓

Step 5

External payment provider processes payment.

↓

Step 6

Payment confirmed.

↓

Step 7

Tickets are generated.

↓

Step 8

Confirmation email is sent.

---

# Supported Payments

Credit Card

Apple Pay

Google Pay

Stripe

LiqPay

Additional providers may be added without changing the purchasing flow.

---

# Ticket Lifecycle

Created

↓

Paid

↓

Assigned to Draw

↓

Locked

↓

Participated

↓

Won / Not Won

↓

Archived

---

# Draw Lifecycle

Upcoming

↓

Ticket Sales Open

↓

Ticket Sales Closed

↓

Provably Fair Seed Locked

↓

Winning Numbers Generated

↓

Winner Verification

↓

Results Published

↓

Prize Distribution

↓

Completed

---

# Dashboard

The user can:

- view active tickets;
- view completed draws;
- view winning history;
- download receipts;
- manage account settings;
- enable notifications.

---

# Notifications

The system may notify users about:

- successful payment;
- issued tickets;
- upcoming draw reminder;
- ticket sales closing;
- draw completed;
- winning ticket;
- prize payment confirmation.

---

# Administrative Flow

Administrator

↓

Create Draw

↓

Configure Prize Pool

↓

Publish Draw

↓

Monitor Ticket Sales

↓

Close Sales

↓

Execute Draw

↓

Verify Results

↓

Publish Winners

↓

Complete Prize Payments

↓

Archive Draw

---

# Public Transparency

Every completed draw publishes:

- draw identifier;
- draw timestamp;
- public randomness source;
- provably fair seed;
- winning numbers;
- prize distribution;
- winners (according to privacy policy).

---

# Error Scenarios

Payment failed

↓

No ticket created

↓

User retries payment

---

Payment timeout

↓

Reservation released

↓

User may purchase again

---

Draw cancelled

↓

Automatic refund initiated

↓

User notified

---

# Product Principles

The product is designed around:

- simplicity;
- transparency;
- provable fairness;
- direct ticket purchases;
- secure payments;
- public verification;
- minimal user friction.

---

# Out of Scope

This product does NOT include:

- internal wallet;
- balance management;
- deposits;
- withdrawals;
- internal transfers;
- virtual credits.

All ticket purchases are processed directly through external payment providers.

---

# Related Documentation

- docs/01-PRODUCT.md
- docs/05_Business_Rules.md
- docs/00-ARCHITECTURE.md
- docs/STANDARDS.md