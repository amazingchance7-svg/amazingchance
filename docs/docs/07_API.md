# 07 — API Guidelines

## General

- Version public APIs, for example `/api/v1`.
- Use stable public identifiers.
- Use UTC ISO-8601 timestamps.
- Use integer minor units for money.
- Use explicit pagination.
- Never expose stack traces or raw database errors.

## Success envelope

A consistent envelope may use:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

## Error envelope

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "The operation cannot be completed in the current state",
    "details": []
  },
  "meta": {
    "requestId": "..."
  }
}
```

Messages are safe for clients. Internal diagnostics remain in structured logs.

## Error codes

Minimum stable categories:

- `VALIDATION_ERROR`
- `AUTHENTICATION_REQUIRED`
- `FORBIDDEN`
- `RESOURCE_NOT_FOUND`
- `CONFLICT`
- `INVALID_STATE_TRANSITION`
- `IDEMPOTENCY_CONFLICT`
- `PAYMENT_VERIFICATION_FAILED`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## Idempotency header

Retryable creation endpoints accept an idempotency key. The server stores:

- operation scope;
- authenticated actor;
- key;
- normalized request hash;
- response status and resource reference;
- expiry or retention policy.

Same key and same payload returns the original result. Same key and different payload returns conflict.

## Correlation

Each request has:

- server-generated request ID;
- correlation ID propagated through internal events where valid;
- actor ID in logs when authenticated.

Do not blindly trust client-provided correlation IDs; validate and bound them.

## Pagination

Use cursor pagination for large or changing collections. Cursor contents must be signed or opaque and validated.

## Webhook endpoints

Webhook endpoints are provider-specific and use raw-body verification. They do not rely on browser sessions and return provider-compatible acknowledgements.

## Administrative API

Administrative endpoints are isolated by permissions and, where practical, separate hostname or gateway policy. Sensitive responses avoid unnecessary personal data.
