# Remote control security baseline

Mobile remote control must not expose the deployment server or developer shell directly.

## Pairing and identity

- Require generated-app authentication; Payload Admin identity is not an app-user identity.
- Use a short-lived, single-use pairing challenge displayed by the local companion.
- Bind the completed pairing to a user, device public key, companion, and expiration time.
- Store only hashed/revocable pairing credentials server-side.

## Authorization

- Scope devices to named projects or Control Rooms and explicit actions.
- Deny terminal execution, secret access, and destructive changes by default.
- Require local or step-up approval for sensitive actions.
- Use short-lived signed commands with nonce, audience, and replay protection.

## Transport and operations

- Use end-to-end authenticated encryption between the paired device and companion.
- Route through a broker only when direct connectivity is unavailable; the broker must not receive
  plaintext command output or secrets.
- Rate-limit commands, cap output, expire idle sessions, and revoke lost devices immediately.
- Record immutable security events for pairing, permission changes, approvals, commands, and
  revocations without recording secret values.

Implementation should begin only after application user ownership and the persistent companion
protocol are defined.
