# Amazing Chance — Master Context

> This document contains the permanent context for AI development.
> Every implementation prompt must follow this document.
> Nothing in this file may be ignored unless explicitly overridden by the Product Owner.

---

# Project

Amazing Chance

The World's First Fully Verifiable Jackpot Platform.

Amazing Chance is not a casino.

Amazing Chance is not a gambling website.

Amazing Chance is a transparent lottery platform where every ticket, every draw and every winner can be independently verified.

Transparency is the primary product value.

---

# Product Principles

Every ticket must be verifiable.

Every draw must be reproducible.

Every winner must be explainable.

Nothing can be hidden.

Nothing can be modified after draw closure.

Users never have to blindly trust Amazing Chance.

Everything important must be independently verifiable.

---

# Design Principles

Premium.

Minimalistic.

Modern.

Fintech style.

No casino style.

No flashing animations.

No slot-machine design.

No poker chips.

No roulette.

No gambling clichés.

Dark interface with gold accents.

High contrast.

Smooth animations.

Desktop-first.

Perfect mobile support.

---

# Development Rules

Never rewrite existing functionality unless requested.

Never change colors without permission.

Never redesign approved UI.

Never rename routes.

Never change business logic.

Always reuse existing components.

Always create reusable components.

Write clean production-quality code.

Keep files modular.

Avoid duplication.

---

# Technology Stack

Frontend:
- Next.js
- React
- TypeScript
- Tailwind CSS

Backend:
- Supabase

Database:
- PostgreSQL

Authentication:
- Supabase Auth

Payments:
- Stripe (test mode first)

Randomness:
- Random.org

Hosting:
- Vercel

---

# Core Product Features

Landing Page

Authentication

User Dashboard

Ticket Purchase

Checkout

My Tickets

Weekly Draw

Annual Jackpot

Transparency Center

Proof Package

Admin Panel

---

# Transparency Rules

Every purchased ticket must become publicly verifiable.

Every completed draw must have a public Proof Package.

Every completed draw must be replayable.

Users must be able to verify tickets without logging in.

Draw data must remain permanently accessible.

---

# UI Rules

Every important action must provide user feedback.

Loading states are required.

Error states are required.

Success states are required.

Empty states are required.

Accessibility must be respected.

Responsive design is mandatory.

---

# Code Quality

Production-ready code only.

No placeholder architecture.

No duplicated logic.

No dead code.

No unused components.

No unnecessary dependencies.

---

# Immutable Records Principle

Amazing Chance is built on the principle that no administrator, employee, developer, system operator or other person may manually alter critical lottery or financial records.

No person may manually create, edit, replace or delete:

- Purchased tickets
- Ticket ownership
- Draw entries
- Draw results
- Winner records
- Prize amounts
- User balances
- Financial transactions
- Jackpot balances
- Published financial reports
- Audit logs

Critical records may only be created through predefined and verified system events.

Examples:

- A ticket may only be created after a payment has been successfully verified.
- A draw result may only be created by the approved draw mechanism.
- A prize may only be calculated automatically from an immutable draw result and eligible ticket.
- A prize balance may only be credited through a verified prize-calculation event.
- A withdrawal may only be recorded after a valid user request and confirmed payment-provider result.
- Reports must be generated automatically from actual immutable records.

Critical records must be append-only.

Once a critical record has been confirmed, it cannot be edited or deleted.

If an error, cancellation or reversal occurs, the system must create a new linked event that records what happened. The original record must remain unchanged and visible in the audit history.

Administrator interfaces must not provide controls for manually changing:

- Tickets
- Winners
- Draw results
- Prize amounts
- User balances
- Financial transactions
- Jackpot amounts
- Audit history
- Published reports

Administrative access is limited to monitoring, support, security actions and starting explicitly permitted system procedures.

Every permitted administrative action must be recorded in an immutable audit log.

---
Identity Integrity

Every ticket, transaction, prize, balance record and audit event must be linked to the immutable internal User ID.

Email address, name and profile information are never used as primary identifiers inside the system.

---

# AI Workflow

Read this document before every task.

Implement only the requested feature.

Do not implement unrelated features.

Do not redesign previous work.

Finish one task before starting another.

Wait for the next prompt.
# MVP First Principle

The primary goal is to build a complete, working MVP.

No new features should be added before the MVP is finished unless they are required to complete the core user journey.

Ideas for future improvements must be recorded separately and implemented only after the MVP is complete.

Finished is better than perfect.
