# DPCS Provisional Architecture

**Status:** Initial implementation baseline selected; production deployment remains subject to validation. See [technology stack decision](technology-stack.md).

## 1. Architectural goals
- Provide a simple interface for factory operations.
- Keep die master data and transaction history consistent.
- Enforce authentication, role-based authorization, and auditability.
- Support reliable backup and recovery.
- Allow future integration without making unverified assumptions now.

## 2. Logical components

### Presentation layer
Responsive Next.js web interface for authorized office and factory users, accessible from desktop and mobile browsers over HTTPS.

### Application layer
Business services for die master and status, production usage transactions, inspection, maintenance and repair, downtime/problem tracking, dashboard/reporting, user administration, and audit.

### Data layer
PostgreSQL managed through Supabase is the initial data platform. Database constraints, transactions, migrations, and Row Level Security will protect business-critical records and actions.

### Operations layer
Deployment environment, configuration and secrets, monitoring, scheduled backups, restore procedures, and release management.

## 3. Core data domains
- User, role, and permission
- Die and die status history
- Product/part
- Machine, line, and shift
- Production order/job
- Die usage transaction
- Inspection and inspection item/result
- Maintenance request/work order
- Repair activity and maintenance parts
- Downtime/problem and corrective action
- Audit event

Final fields, relationships, and reference-code rules must be derived from validated factory workflows.

## 4. Key design principles
1. Use a stable unique identifier for each die.
2. Preserve transaction history; avoid silently overwriting operational events.
3. Record who performed an important action and when.
4. Validate status transitions in application logic.
5. Separate master data from operational transactions.
6. Apply least-privilege access.
7. Back up data and test restoration, not just backup creation.

## 5. Initial platform decisions and remaining validation
- Application: Next.js + TypeScript.
- Database and authentication: Supabase PostgreSQL + Supabase Auth.
- Application hosting: Vercel for development and controlled pilot.
- Interface: Indonesian-first responsive web application.
- Still to validate: account ownership and billing, user provisioning, factory internet reliability, any country/network hosting policy, integration needs, file access policies, backup retention, and recovery objectives.
- Offline operation is not included in the first release unless separately approved.

## 6. Initial deployment approach
Start with a development environment, then a controlled user-acceptance/pilot environment. Production deployment should follow security review, backup/restore validation, approved user acceptance testing, and documented support ownership.
