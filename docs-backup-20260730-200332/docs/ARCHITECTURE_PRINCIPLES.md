# AmazingChance Architecture Principles



## 1. Purpose



AmazingChance must operate as an automated, transparent, auditable, and verifiable lottery platform.



The platform must not require users to trust administrators, developers, or the platform owner when verifying ticket issuance, payments, draw participation, or draw results.



Critical financial and lottery processes must be executed automatically and must not depend on manual human decisions.



\---



## 2. Automation First



All critical platform processes must operate automatically.



This includes:



\- purchase creation;

\- payment processing;

\- payment confirmation;

\- ticket issuance;

\- ticket cancellation after refunds;

\- draw sales opening;

\- draw sales closing;

\- draw snapshot creation;

\- randomness acquisition;

\- winner selection;

\- prize calculation;

\- result publication;

\- payout processing;

\- audit event creation.



Manual execution must not be the normal operating mode.



Administrative interfaces may display statuses, errors, and diagnostics, but must not allow administrators to manually alter critical business results.



\---



## 3. No Manual Ticket Issuance



Tickets may only be created after successful payment confirmation.



A ticket must not be created:



\- by an administrator;

\- by the platform owner;

\- through a management dashboard;

\- through a direct public API request;

\- before payment confirmation;

\- through manual database operations during normal platform operation.



The valid ticket issuance flow is:



```text

Purchase created

&#x20;   в†“

Payment created

&#x20;   в†“

Payment confirmed

&#x20;   в†“

Purchase marked as PAYMENT\_CONFIRMED

&#x20;   в†“

Ticket allocation started

&#x20;   в†“

Tickets created as ACTIVE

&#x20;   в†“

Purchase marked as COMPLETED

The number of issued tickets must exactly match the number of tickets paid for.



Each ticket must be linked to:



one user;

one purchase;

one lottery draw;

one unique public ticket identifier;

one unique sequential number within the draw.

4\. Unlimited Ticket Supply



AmazingChance does not impose a platform-level limit on the number of tickets that may be purchased or issued.



The platform must not artificially limit:



the number of tickets in a draw;

the size of the jackpot;

the total payment amount;

the number of purchases by a user.



External limitations may exist because of:



payment provider limits;

card issuer limits;

bank limits;

anti-fraud controls;

regulatory requirements;

sanctions or jurisdiction restrictions;

technical infrastructure limits.



Such limitations must not be presented as lottery ticket availability limits.



Tickets cannot be sold out because ticket numbers are generated sequentially and the ticket supply is not finite.



5\. No Manual Winners



No administrator, developer, employee, owner, or privileged user may select, replace, exclude, or modify a winner.



Winners must be determined exclusively through the published draw algorithm.



The winner-selection process must use:



a finalized immutable ticket snapshot;

a published snapshot hash;

externally obtained verifiable randomness;

a deterministic winner-selection algorithm;

immutable winner records.



The same snapshot, randomness evidence, and algorithm must always produce the same winners.



6\. Least Privilege



Every system component and user role must receive only the permissions required for its assigned responsibility.



Regular user



A regular user may:



create purchases;

make payments;

view personal purchases;

view personal tickets;

view completed draws;

view winning ticket identifiers;

view winner nicknames and countries;

verify personal ticket participation;

download public draw evidence;

verify draw results;

claim eligible prizes.



A regular user may not:



create tickets directly;

modify ticket numbers;

modify payments;

change draw data;

create winners;

modify prizes;

modify another user's information.

Administrator



An administrator may:



view operational statistics;

view payment statuses;

view failed processes;

view system logs;

review fraud alerts;

manage public content;

manage support requests;

retry approved non-critical delivery operations;

trigger safe technical recovery procedures where explicitly permitted.



An administrator may not:



issue tickets;

delete tickets;

change ticket ownership;

change ticket numbers;

change confirmed payment amounts;

mark payments as successful manually;

select winners;

modify random positions;

replace randomness evidence;

modify finalized snapshots;

modify completed draw results;

manually change jackpot calculations;

manually create prizes.

7\. No Unrestricted God Mode



AmazingChance must not provide an unrestricted God Mode capable of changing financial or lottery results.



Emergency access, if implemented, must be limited to technical recovery operations and must not allow the user to:



issue tickets;

select winners;

change payment amounts;

mark unpaid purchases as paid;

modify completed draws;

replace randomness evidence;

alter snapshot contents;

change winning tickets;

delete audit history.



Emergency access must require:



strong multi-factor authentication;

hardware-backed authentication where possible;

explicit reason entry;

time-limited authorization;

complete audit logging;

notification to the platform owner;

approval by more than one independent credential where technically possible.



Emergency access must be disabled by default.



8\. Immutable Financial History



Confirmed financial records must not be overwritten.



After payment confirmation, the following purchase data must not be modified:



user;

draw;

ticket quantity;

ticket price;

total amount;

currency;

payment confirmation time.



Corrections must be represented through new records or state transitions.



Examples:



refunds are separate refund operations;

chargebacks are separate payment events;

ticket invalidation is represented by a status change;

failed payout attempts are recorded separately;

payment provider corrections are recorded as new events.



Historical financial records must remain available for auditing.



9\. Immutable Ticket History



An issued ticket must never be physically deleted during normal platform operation.



After issuance, the following fields must remain immutable:



public ticket identifier;

user;

purchase;

draw;

sequential number within the draw;

issuance timestamp.



A refunded ticket must be marked as:



VOIDED\_BY\_REFUND



The original ticket record must remain in the database.



A voided ticket must not participate in a future draw snapshot unless the applicable published rules explicitly provide otherwise.



10\. Draw Snapshot



After ticket sales close, the platform must create a deterministic snapshot containing all eligible tickets.



The snapshot must contain, at minimum:



snapshot position;

public ticket identifier;

privacy-safe owner reference.



The snapshot must not contain:



real name;

email address;

phone number;

payment information;

internal user identifier;

IP address;

precise geographic location.



The snapshot must use a published canonical format.



The platform must calculate and publish a cryptographic hash of the snapshot.



The default hash algorithm is:



SHA-256



After finalization, the snapshot and its entries must be immutable.



11\. Verifiable Randomness



Randomness used to select winners must come from an external verifiable randomness provider.



The initial supported provider is:



RANDOM.ORG



The platform must store:



randomness request;

randomness response;

request parameters;

response hash;

provider signature;

signature verification result;

requested range;

requested winner count;

returned random positions;

request timestamp;

response timestamp;

verification timestamp.



The randomness evidence must be publicly verifiable after the draw is completed.



12\. Deterministic Winner Selection



Winner selection must be deterministic.



The inputs are:



finalized ticket snapshot;

finalized snapshot hash;

verified random positions;

published winner-selection algorithm.



The platform must map each random position to the ticket stored at that snapshot position.



The same inputs must always result in the same winners.



The winner-selection algorithm must be versioned.



The algorithm version used for each draw must be permanently recorded.



13\. Public Draw Verification



Every completed draw must expose a public verification page.



The page must show:



draw public identifier;

draw type;

sales opening time;

sales closing time;

draw completion time;

number of eligible tickets;

jackpot amount;

prize distribution;

snapshot hash;

snapshot canonical format;

hash algorithm;

randomness provider;

randomness evidence;

random positions;

winning ticket identifiers;

winner nicknames;

winner countries;

winner ranks;

prize amounts;

winner-selection algorithm version.



Users must be able to:



Download the snapshot.

Calculate its hash independently.

Compare the calculated hash with the published hash.

verify the RANDOM.ORG response and signature.

inspect the random positions.

locate tickets at those positions.

confirm that the published winners match the deterministic result.

14\. Personal Ticket Participation Verification



An authenticated user must be able to verify whether each personal ticket participated in a completed draw.



For every personal ticket, the platform must show:



ticket public identifier;

draw public identifier;

ticket status;

snapshot participation status;

snapshot position, when included;

snapshot hash;

draw result;

winner status;

winner rank, when applicable;

prize amount, when applicable.



Participation must be proven using the finalized snapshot entry.



The platform must not infer participation only from the current ticket status.



15\. Public Winner Identity



AmazingChance may publicly display:



winner nickname;

winner country;

public winning ticket identifier;

winner rank;

prize amount.



AmazingChance must not publicly display without separate explicit consent:



legal name;

email address;

phone number;

home address;

precise location;

payment information;

identity documents;

internal user identifier.



Users must choose a public nickname.



The platform must validate nicknames to prevent:



impersonation;

offensive content;

personal information disclosure;

misleading official platform names.



The winner country may be derived from the user's verified profile information.



The country displayed for a completed draw must be stored as a historical snapshot so that later profile changes do not alter past draw results.



16\. Global Purchase Activity Map



AmazingChance may display an aggregated public map showing countries from which tickets are being purchased.



The map may show:



highlighted countries;

approximate purchase activity;

recent purchase events;

aggregated ticket counts;

aggregated purchase counts.



The map must not expose:



exact user coordinates;

exact addresses;

precise IP locations;

private user identifiers;

payment information;

an individual user's location without consent.



A public map event may contain:



country code;

country name;

approximate display coordinate;

event timestamp;

anonymized activity type;

ticket quantity range.



The public coordinate must represent the country or a randomized point within a broad geographic area. It must not represent the buyer's exact location.



The map must not reveal enough information to identify an individual buyer.



17\. Privacy by Design



Privacy protections must be implemented as part of the architecture, not added later.



The platform must apply:



data minimization;

pseudonymous public identifiers;

separation of public and private user data;

encryption in transit;

encryption of sensitive data at rest where appropriate;

restricted access to personal data;

retention policies;

audit logging;

secure deletion where legally and technically permitted.



Public lottery verification must not require disclosure of personal information.



18\. Everything Audited



Every critical state transition must create an immutable audit event.



Audit events must include, where applicable:



entity identifier;

previous state;

new state;

cause;

source;

correlation identifier;

timestamp;

relevant metadata.



Critical operations include:



purchase creation;

payment creation;

payment confirmation;

payment failure;

refund initiation;

refund completion;

ticket issuance;

ticket invalidation;

snapshot creation;

snapshot finalization;

randomness request;

randomness verification;

winner creation;

prize creation;

payout initiation;

payout completion;

emergency recovery action.



Audit logs must not be editable through the administrative interface.



19\. Idempotency



All critical externally triggered operations must be idempotent.



This includes:



purchase creation;

payment session creation;

payment webhook processing;

payment confirmation;

ticket allocation;

refund processing;

snapshot creation;

randomness requests;

winner selection;

prize creation;

payout processing.



Repeating the same valid request must not create duplicate:



purchases;

payments;

tickets;

webhook records;

winners;

prizes;

payouts.

20\. Transactional Consistency



Operations that change multiple related records must use database transactions.



Ticket allocation must atomically:



verify purchase eligibility;

verify payment confirmation;

verify that tickets have not already been allocated;

assign unique sequential ticket numbers;

create the exact number of tickets;

create audit events;

mark the purchase as completed.



Either all steps succeed or none of them are committed.



21\. Security Boundaries



The public API, administrative API, payment webhooks, internal workers, and draw-processing services must have separate permission boundaries.



Payment webhooks must:



verify provider signatures;

reject invalid requests;

prevent duplicate processing;

store original evidence;

process events idempotently.



Draw workers must not accept arbitrary winner or ticket inputs from administrators.



Database access must use dedicated service credentials with minimum required permissions where technically practical.



22\. Failure Handling



The platform must fail safely.



A technical failure must not result in:



duplicate tickets;

unpaid tickets;

missing confirmed payments;

duplicated winners;

partial snapshot creation;

unverified randomness acceptance;

duplicated payouts.



Failed automatic operations must remain retryable and auditable.



Retries must preserve idempotency.



23\. Public Trust



AmazingChance must provide enough public evidence for an independent person to verify:



that a ticket was issued only after payment;

that the ticket participated in the applicable draw;

that the eligible ticket list was not altered after finalization;

that randomness came from the published provider;

that the randomness evidence is authentic;

that winning positions were calculated correctly;

that the published winners match the algorithm.



The platform's integrity must be based on verifiable evidence rather than statements of trust.



24\. Architecture Decision Rule



Any future feature that conflicts with these principles must not be implemented until the architecture and security consequences have been explicitly reviewed.



Convenience for administrators must never override:



draw integrity;

payment integrity;

ticket integrity;

auditability;

user privacy;

public verifiability.


