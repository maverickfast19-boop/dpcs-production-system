# DPCS Technology Stack Decision

**Status:** Initial implementation baseline approved for development; production deployment remains subject to security, cost, and user-acceptance checks.

## 1. Application
- **Framework:** Next.js with TypeScript.
- **Interface:** Responsive web application for desktop and mobile browsers.
- **Language:** Indonesian for the initial user interface.
- **Architecture:** Modular application with server-side validation for business-critical actions.

## 2. Data and identity
- **Database:** PostgreSQL managed through Supabase.
- **Authentication:** Supabase Auth.
- **Authorization:** Application roles and database Row Level Security (RLS). Roles and permissions must be enforced on the server/database, not only by hiding interface elements.
- **File storage:** Supabase Storage for approved attachments and documents, subject to access policies.

## 3. Hosting and environments
- **Application hosting:** Vercel for development and controlled pilot deployment.
- **Database hosting:** Supabase managed PostgreSQL.
- **Environments:** Development first, then pilot/UAT, then production. Secrets must be stored in environment configuration and never committed to Git.
- **Network:** Online access through HTTPS. Shop-floor network reliability must be tested before go-live; offline operation is not included in the first release unless separately approved.

## 4. Important implementation controls
- Preserve immutable operational event history for specification revisions, production operations, physical-unit identity, QC results, repair, and disposition decisions.
- Enforce transaction-safe status changes and HOLD rules on the server.
- Record actor and timestamp for important actions.
- Use database migrations and version-controlled application code.
- Configure automated backups and test restoration before production use.
- Do not load real confidential factory data into development until access, retention, and backup controls are approved.

## 5. Delivery sequence
1. Create the application foundation and responsive layout.
2. Configure database schema, migrations, and authentication.
3. Implement roles and permissions.
4. Implement customer, order, Control Number, specification revision, and physical-unit records.
5. Implement Workcard routing, departments, machines, and operation reporting.
6. Implement Polishing marking, per-unit QC, repair/re-QC, and scrap disposition.
7. Implement notifications, dashboards, audit history, import validation, and reports.
8. Run pilot/UAT and security/backup checks before production release.

## 6. Assumptions to validate before go-live
- Actual hosting account ownership, billing, and administrator access.
- Required user roles and who provisions user accounts.
- Factory internet reliability and acceptable downtime behavior.
- Data retention, backup retention, and recovery expectations.
- Whether any company policy requires hosting in a particular country or network.
