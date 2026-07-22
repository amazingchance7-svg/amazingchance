# Amazing Chance — User Roles and Access Model

**Document Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-07-22

---

## 1. Document Purpose

This document defines the people and system actors that interact with Amazing Chance.

It separates three concepts:

- role — who the actor is;
- status — the actor's current condition;
- permission — the specific action the actor may perform.

This document is the foundation for:

- user flows;
- role-based access control;
- administrative access;
- security controls;
- audit logging;
- separation of duties.

---

## 2. Core Access Principles

### 2.1 Least Privilege

Every person and service receives only the minimum permissions required to perform its responsibilities.

Access must not be granted merely for convenience.

---

### 2.2 Deny by Default

An action is forbidden unless it is explicitly allowed.

New roles and services receive no sensitive permissions automatically.

---

### 2.3 Separation of Duties

Critical responsibilities must be divided between different roles.

No single employee should control:

- draw configuration;
- winner calculation;
- financial approval;
- prize payout;
- audit evidence.

---

### 2.4 No Absolute Administrator

Amazing Chance must not have an unrestricted “super admin” capable of silently modifying the entire platform.

Even the highest administrative role must not be able to:

- change a finalized ticket set;
- replace a winner;
- modify published randomness;
- edit immutable ledger entries;
- delete audit records;
- rewrite completed draw history.

---

### 2.5 Four-Eyes Principle

Selected high-risk actions require approval by two different authorized people.

The person who initiates an action cannot approve the same action.

Examples:

- changing payout bank details;
- changing draw configuration;
- rotating critical security keys;
- approving unusually large payouts;
- restoring production data;
- changing sensitive system limits.

---

### 2.6 Full Accountability

Every sensitive action must record:

- actor identity;
- actor role;
- action;
- affected object;
- previous value;
- new value;
- timestamp;
- IP address or system origin;
- approval reference;
- result.

---

## 3. Role, Status and Permission

### 3.1 Role

A role describes the actor's responsibility in the platform.

Examples:

- Guest;
- Participant;
- Support Agent;
- Finance Officer;
- Compliance Officer.

---

### 3.2 Status

A status describes the current condition of an account or process.

Examples:

- Email Verification Pending;
- Active;
- Identity Verification Pending;
- Identity Verified;
- Restricted;
- Suspended;
- Self-Excluded.

A winner is not a permanent user role. Winning is represented by a prize claim or ticket status.

---

### 3.3 Permission

A permission describes one specific allowed action.

Examples:

- view public draw;
- purchase ticket;
- view own tickets;
- review identity verification;
- initiate payout;
- approve payout;
- suspend account.

Permissions must be assigned through roles, not directly to individual employees except for documented emergency access.

---

## 4. Actor Categories

Amazing Chance has four actor categories:

1. Public actors.
2. Participant actors.
3. Internal operational actors.
4. Automated system actors.

---

## 5. Public Roles

### 5.1 Guest

A Guest is a person who is not authenticated.

A Guest may:

- view the Home Page;
- view current jackpot information;
- view draw countdowns;
- read rules and legal information;
- search the public ticket registry;
- view completed draw results;
- view verification certificates;
- replay completed draws;
- create an account.

A Guest may not:

- purchase tickets;
- access private user information;
- view private purchase records;
- submit a prize claim;
- access administrative functions.

---

## 6. Participant Roles

### 6.1 Registered Participant

A Registered Participant has created an account but may not yet satisfy all requirements for participation.

A Registered Participant may:

- authenticate;
- manage basic profile information;
- configure account security;
- view public platform information;
- begin identity verification;
- view personal notifications.

Ticket purchasing depends on jurisdictional, age, identity and account-status requirements.

---

### 6.2 Eligible Participant

An Eligible Participant satisfies the requirements needed to purchase tickets in the applicable jurisdiction.

Possible requirements include:

- verified email;
- verified age;
- verified identity;
- permitted country or region;
- active account;
- no self-exclusion;
- no regulatory restriction;
- successful payment-risk checks.

An Eligible Participant may:

- purchase tickets;
- view personal ticket history;
- verify personal tickets;
- view payment status;
- receive draw notifications;
- initiate eligible prize claims.

---

### 6.3 Participant Statuses

Participant statuses are not roles.

Possible account statuses include:

- Registration Pending;
- Email Verification Pending;
- Active;
- Identity Verification Pending;
- Identity Verified;
- Verification Failed;
- Restricted;
- Suspended;
- Closed;
- Self-Excluded;
- Cooling-Off;
- Deceased Account Review.

A user may have several independent statuses at the same time.

Example:

- account status: Active;
- identity status: Verified;
- responsible participation status: Cooling-Off;
- prize claim status: Pending Review.

---

## 7. Prize-Related States

Winning must not create a privileged user role.

Prize processing is represented through ticket and prize-claim states.

Possible ticket states:

- Eligible;
- Non-Winning;
- Winning;
- Voided under approved rules;
- Under Investigation.

Possible prize-claim states:

- Not Created;
- Claim Available;
- Claim Submitted;
- Identity Review Required;
- Compliance Review Required;
- Approved;
- Payout Initiated;
- Paid;
- Rejected;
- Expired;
- Frozen by Legal Requirement.

A user cannot approve or process their own prize claim.

---

## 8. Internal Operational Roles

### 8.1 Support Agent

Purpose:

Assist users with non-financial account and product issues.

May:

- search user accounts;
- view basic account information;
- view purchase and ticket status;
- view non-sensitive support history;
- resend verification communications;
- create and update support cases;
- escalate incidents;
- request account review.

May not:

- view full payment credentials;
- change ledger entries;
- create tickets;
- modify draws;
- approve prizes;
- approve payouts;
- change identity-verification results;
- delete audit records.

Sensitive personal data should be masked unless access is required and authorized.

---

### 8.2 Support Supervisor

Purpose:

Review escalated support cases and supervise Support Agents.

May:

- perform Support Agent actions;
- review escalations;
- approve limited account corrections;
- review support quality;
- temporarily restrict an account according to documented rules.

May not:

- edit financial balances;
- approve payouts;
- modify draw outcomes;
- alter immutable records.

---

### 8.3 Finance Officer

Purpose:

Monitor financial operations and prepare valid payouts.

May:

- view financial ledger entries;
- view payment and refund status;
- perform reconciliation;
- initiate an approved refund;
- prepare a prize payout;
- investigate financial mismatches;
- create financial incident reports.

May not:

- approve a payout they initiated;
- modify ticket allocations;
- change winners;
- alter finalized draws;
- delete financial records;
- manually edit calculated ledger balances.

---

### 8.4 Finance Approver

Purpose:

Review and approve prepared financial operations.

May:

- approve or reject eligible payouts;
- approve exceptional refunds within limits;
- review reconciliation reports;
- place a temporary hold on suspicious payouts.

May not:

- approve an operation they initiated;
- replace a winner;
- edit immutable ledger entries;
- change draw inputs.

High-value payouts may require an additional Compliance or Executive approval depending on future business rules.

---

### 8.5 Compliance Officer

Purpose:

Perform identity, age, sanctions, anti-money-laundering and regulatory reviews.

May:

- review identity-verification information;
- request additional documents;
- approve or reject manual verification;
- review sanctions-screening results;
- place regulatory restrictions;
- release or reject compliance holds;
- document regulatory decisions.

May not:

- create tickets;
- change winners;
- edit draw evidence;
- initiate personal payouts;
- modify financial ledger entries.

Compliance decisions must contain a reason and audit record.

---

### 8.6 Risk and Fraud Analyst

Purpose:

Detect and investigate fraud, abuse, chargebacks and coordinated manipulation.

May:

- view risk signals;
- review related accounts and devices;
- review payment-risk indicators;
- temporarily restrict suspicious activity;
- recommend refunds, closure or investigation;
- create fraud cases.

May not:

- change winners;
- edit finalized ticket sets;
- directly approve payouts;
- delete evidence;
- change risk history.

---

### 8.7 Draw Operations Officer

Purpose:

Monitor scheduled draw execution and operational readiness.

May:

- view draw configuration;
- monitor draw lifecycle;
- confirm operational readiness;
- initiate approved draw-state transitions;
- pause a draw before sales closure when documented emergency conditions apply;
- create operational incidents.

May not:

- manually select winners;
- edit the finalized ticket set;
- edit randomness results;
- replace the winner-selection algorithm;
- reopen a finalized draw;
- change published results.

Draw execution should be performed by automated services wherever possible.

---

### 8.8 Draw Operations Approver

Purpose:

Provide independent approval for critical draw actions.

May:

- approve selected draw configuration changes before a draw opens;
- approve emergency draw cancellation;
- approve rescheduling according to published rules;
- review the draw readiness checklist.

May not:

- approve an action they initiated;
- manually select winners;
- change draw evidence after finalization.

---

### 8.9 Security Officer

Purpose:

Protect systems, accounts, credentials and incident evidence.

May:

- review security logs;
- investigate suspicious access;
- revoke compromised sessions;
- disable employee access;
- rotate credentials through approved procedures;
- manage security incidents;
- request emergency platform restrictions.

May not:

- change draw winners;
- edit financial ledger entries;
- approve prizes;
- erase audit history.

Security access must not automatically grant access to user identity documents or financial operations.

---

### 8.10 Platform Operator

Purpose:

Maintain application availability and infrastructure health.

May:

- monitor services;
- deploy approved software releases;
- restart services;
- scale infrastructure;
- manage backups;
- perform approved restoration procedures;
- respond to infrastructure incidents.

May not:

- modify business records directly;
- change winners;
- edit ledger entries;
- approve payments;
- access production personal data without an approved incident need.

Production database access must be exceptional, time-limited and audited.

---

### 8.11 Platform Administrator

Purpose:

Manage roles, technical configuration and administrative infrastructure.

May:

- create employee accounts;
- assign approved roles;
- revoke access;
- configure non-critical platform settings;
- manage administrative authentication policies;
- review access reports.

May not:

- grant themselves unrestricted permissions;
- approve their own role elevation;
- change winners;
- alter finalized ticket sets;
- edit ledger history;
- delete audit logs;
- bypass the Four-Eyes Principle.

Role changes involving sensitive permissions require independent approval.

---

### 8.12 Internal Auditor

Purpose:

Independently review platform operations and evidence.

May:

- view audit logs;
- view draw certificates;
- view financial reconciliation reports;
- review access history;
- export approved audit evidence;
- create audit findings.

May not:

- execute operational actions;
- edit platform records;
- approve payouts;
- change permissions;
- close their own audit findings.

The Internal Auditor should have read-only access.

---

## 9. Executive Roles

### 9.1 Authorized Executive

Purpose:

Approve exceptional actions that exceed operational authority limits.

Possible approvals:

- high-value payout;
- exceptional legal hold;
- emergency service suspension;
- critical configuration change;
- business-continuity activation.

An executive role must not provide routine administrative access.

Executives must not be able to modify draw results or immutable financial records.

---

## 10. Automated System Actors

Automated services must have individual identities and permissions.

They must never share a single unrestricted system account.

---

### 10.1 Authentication Service

Responsible for:

- authentication;
- session creation;
- multi-factor authentication;
- access-token validation.

It must not receive permissions to modify draws or financial records.

---

### 10.2 Payment Integration Service

Responsible for:

- creating payment requests;
- receiving provider callbacks;
- validating callback authenticity;
- updating payment state.

It must not independently issue tickets without the confirmed purchase workflow.

---

### 10.3 Ticket Allocation Service

Responsible for:

- allocating unique ticket IDs;
- linking tickets to confirmed purchases;
- preventing duplicate allocation;
- publishing eligible ticket records.

It cannot process payments or choose winners.

---

### 10.4 Draw Orchestration Service

Responsible for:

- enforcing draw-state transitions;
- closing ticket sales;
- finalizing the ticket set;
- requesting approved randomness;
- invoking deterministic winner selection;
- publishing draw evidence.

It must follow configured rules and cannot accept an undocumented manual winner.

---

### 10.5 Ledger Service

Responsible for:

- creating immutable financial entries;
- calculating balances from entries;
- rejecting unbalanced operations;
- exposing reconciliation data.

It must not allow direct balance editing.

---

### 10.6 Notification Service

Responsible for:

- sending email, SMS or in-app notifications;
- recording delivery status;
- applying notification preferences.

It receives only the minimum personal data required for delivery.

---

### 10.7 Audit Service

Responsible for:

- receiving audit events;
- protecting event integrity;
- retaining evidence;
- detecting missing or altered event sequences.

Operational services must not be able to delete audit records.

---

### 10.8 Monitoring Service

Responsible for:

- service health monitoring;
- alert generation;
- anomaly detection;
- incident escalation.

Monitoring alerts do not grant authority to modify business outcomes.

---

## 11. Permission Groups

Permissions should be grouped by business domain.

### Public Permissions

- ViewPublicJackpot
- ViewPublicDraw
- SearchPublicTicket
- ViewDrawCertificate
- ReplayCompletedDraw

### Participant Permissions

- ManageOwnProfile
- ManageOwnSecurity
- BeginIdentityVerification
- PurchaseTicket
- ViewOwnPurchases
- ViewOwnTickets
- SubmitPrizeClaim
- ManageParticipationControls

### Support Permissions

- SearchUser
- ViewSupportProfile
- ViewPurchaseStatus
- ManageSupportCase
- RequestAccountReview

### Finance Permissions

- ViewLedger
- ViewPayment
- InitiateRefund
- ApproveRefund
- PreparePayout
- ApprovePayout
- RunReconciliation

### Compliance Permissions

- ReviewIdentity
- ReviewSanctions
- RequestDocuments
- ApplyComplianceHold
- ReleaseComplianceHold

### Risk Permissions

- ViewRiskSignals
- CreateFraudCase
- RestrictSuspiciousAccount
- ReviewLinkedActivity

### Draw Operations Permissions

- ViewDrawConfiguration
- ApproveDrawConfiguration
- InitiateDrawTransition
- PauseDrawBeforeFinalization
- ApproveDrawCancellation

### Security Permissions

- ViewSecurityEvents
- RevokeSession
- DisableEmployeeAccess
- ManageSecurityIncident
- RotateApprovedCredentials

### Platform Permissions

- DeployApprovedRelease
- ManageInfrastructure
- RestoreApprovedBackup
- ManageEmployeeAccount
- AssignApprovedRole

### Audit Permissions

- ViewAuditRecords
- ExportAuditEvidence
- CreateAuditFinding

---

## 12. Explicitly Forbidden Capabilities

The following capabilities must not exist as normal administrative permissions:

- SetWinner
- ReplaceWinner
- EditRandomnessResult
- EditFinalizedTicketSet
- EditImmutableLedgerEntry
- DeleteAuditRecord
- ChangeCompletedDraw
- BackdateTicket
- CreateTicketWithoutConfirmedPurchase
- ApproveOwnFinancialAction
- ApproveOwnAccessElevation

Any legitimate correction must be performed through a new documented compensating action, never by rewriting history.

---

## 13. Emergency Access

Emergency access may be required during a severe incident.

It must be:

- disabled by default;
- time-limited;
- approved independently;
- restricted to the incident scope;
- strongly authenticated;
- fully recorded;
- reviewed after use.

Emergency access must not permit changing winners, randomness evidence or immutable ledger history.

---

## 14. Access Lifecycle

Employee access follows this lifecycle:

- Requested;
- Manager Approved;
- Security or Role Owner Approved;
- Provisioned;
- Periodically Reviewed;
- Modified when responsibilities change;
- Immediately Revoked when no longer required.

Access reviews must verify:

- current employment;
- current responsibilities;
- active permissions;
- unused privileged access;
- conflicting roles;
- separation-of-duties violations.

---

## 15. Conflicting Roles

Some roles must not be assigned to the same person simultaneously.

Examples:

- Finance Officer and Finance Approver;
- Draw Operations Officer and Draw Operations Approver;
- Platform Administrator and Internal Auditor;
- Payout Initiator and Payout Approver;
- Access Requester and Access Approver.

Exceptions require documented risk acceptance and must be temporary.

---

## 16. Data Visibility

Access to information must be separated from permission to act.

Examples:

- Support may view purchase status but not full financial details.
- Finance may view payout information but not unnecessary identity documents.
- Compliance may view identity documents but not alter draw results.
- Security may view access logs but not approve financial operations.
- Auditors may view evidence but not execute operations.

Sensitive data must be masked by default.

---

## 17. MVP Role Scope

The initial MVP should implement only the roles necessary for safe operation:

- Guest;
- Registered Participant;
- Eligible Participant;
- Support Agent;
- Finance Officer;
- Finance Approver;
- Compliance Officer;
- Risk and Fraud Analyst;
- Draw Operations Officer;
- Draw Operations Approver;
- Security Officer;
- Platform Operator;
- Platform Administrator;
- Internal Auditor;
- automated service identities.

Additional roles should be created only when a real operational need exists.

---

## 18. Acceptance Criteria

The role and access model is acceptable only if:

- no unrestricted administrator exists;
- every sensitive permission belongs to a defined role;
- critical actions require independent approval;
- initiation and approval are separated;
- completed draw evidence cannot be edited;
- ledger history cannot be rewritten;
- audit logs cannot be deleted by operational roles;
- automated services use separate identities;
- production access is limited and audited;
- user data visibility follows least privilege;
- access can be revoked immediately;
- conflicting roles can be detected.

---

## 19. Open Legal and Operational Questions

The following must be resolved before production launch:

- which identity checks are mandatory;
- which roles may legally approve prize payouts;
- which payout thresholds require enhanced review;
- how long identity and audit records must be retained;
- which employees may access personal data;
- which actions require regulatory reporting;
- whether external auditors require direct platform access;
- which jurisdictions require responsible participation controls.

These questions depend on the selected operating jurisdiction and legal model.
