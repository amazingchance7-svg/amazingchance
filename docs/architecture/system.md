# System Architecture

Version: 1.0

Status: Active

---

# Purpose

This document provides a high-level overview of the Amazing Chance platform architecture.

It describes the major system components, their responsibilities, and how they interact.

Detailed implementation belongs to module documentation.

Business rules are defined outside this document.

---

# Architectural Style

Amazing Chance is implemented as a **modular monolith**.

The application is deployed as a single service while maintaining strict module boundaries.

Each module owns its own business logic and data.

Modules communicate through explicit contracts rather than direct internal coupling.

This architecture allows the system to evolve into distributed services in the future without requiring major business redesign.

---

# High-Level Overview

```
                    Web / Mobile Clients
                            │
                            ▼
                     REST API / Gateway
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
      Auth             Purchases          Lottery
        │                   │                   │
        ▼                   ▼                   ▼
      Users             Payments           Tickets
        │                   │                   │
        └───────────────┬───┴───────────────────┘
                        │
                        ▼
                     PostgreSQL
                        │
                        ▼
                       Redis
```

---

# Core Components

The platform consists of several logical layers.

## Client Layer

Responsible for user interaction.

Examples:

- Web application
- Mobile application
- Administrative interface

---

## API Layer

Provides authenticated access to platform functionality.

Responsibilities include:

- request validation;
- authentication;
- authorization;
- rate limiting;
- API versioning.

Business logic must not reside in controllers.

---

## Domain Layer

Contains all business logic.

Business rules are implemented inside independent modules.

Each module owns its lifecycle, validation rules, and state transitions.

Modules communicate through well-defined interfaces.

---

## Infrastructure Layer

Provides technical capabilities required by the business.

Examples include:

- PostgreSQL
- Redis
- Background workers
- Payment providers
- External randomness providers
- Object storage
- Monitoring

Infrastructure never owns business rules.

---

# Architectural Boundaries

The architecture follows several mandatory boundaries.

- Business rules are isolated from infrastructure.
- Controllers remain thin.
- Modules own their domains.
- Persistence is an implementation detail.
- External services are replaceable.

---

# Data Flow

A typical business operation follows this sequence:

```
Client

↓

Controller

↓

Application Service

↓

Domain Logic

↓

Repository

↓

Database
```

External integrations are performed only after business validation.

---

# Dependency Direction

Dependencies always point inward.

```
Clients

↓

API

↓

Application

↓

Domain

↓

Infrastructure
```

The domain layer must not depend on frameworks or external providers.

---

# Scalability

The platform is designed to support:

- horizontal API scaling;
- background job processing;
- increasing ticket volume;
- increasing payment volume;
- additional lottery types;
- future service extraction.

---

# Fault Tolerance

Critical operations are designed to be:

- transactional;
- idempotent;
- auditable;
- retryable.

System correctness is always preferred over availability.

---

# Related Documentation

For implementation details see:

- `00_System_Architecture.md`
- `01_ENGINEERING_PRINCIPLES.md`
- `02_PLATFORM_PRINCIPLES.md`
- `modules/`
- `database/`
- `ADR/`