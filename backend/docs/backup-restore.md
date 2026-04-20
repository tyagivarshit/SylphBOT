# Backup And Restore

## Backup

- Backup triggering is exposed through `POST /api/security/backup/trigger`.
- Current runtime backup configuration is exposed through `GET /api/security/backup`.
- The default implementation is a safe stub intended for integration with managed backup infrastructure.

## Restore

- Validate the target environment before restoring any production snapshot.
- Restore the database snapshot first.
- Run `npx prisma generate` after schema changes.
- Restart API and worker processes after restore.
- Reconnect external integrations only after validating tenant data boundaries.

## Verification

- Confirm health endpoints return success.
- Confirm a workspace owner can access billing, analytics, and security endpoints.
- Confirm webhooks reject stale or replayed requests.
- Confirm API key validation works for the restored tenant only.
