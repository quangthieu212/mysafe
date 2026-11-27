# API contract v2

`openapi.yaml` is the target contract for the NestJS service under `services/api`.
The existing Next.js routes remain the compatibility API during migration and are
not silently redefined by this document.

The contract is based on the v2 implementation bundle and remains a draft where
the design documents require an independent cryptography review (in particular
OPAQUE, key handling, and device approval). A route is not considered implemented
until the service enforces the documented authentication, authorization, validation,
and response semantics.

The current backend slice implements only liveness/readiness probes and the
PostgreSQL tenant-isolation foundation. It does not yet implement authentication,
vault routes, or production deployment.
