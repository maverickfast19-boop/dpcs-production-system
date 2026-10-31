# DPCS Provisional Architecture

**Status:** Technology-neutral proposal pending discovery and approval.

## 1. Architectural goals
- Provide a simple interface for factory operations.
- Keep die master data and transaction history consistent.
- Enforce authentication, role-based authorization, and auditability.
- Support reliable backup and recovery.
- Allow future integration without making unverified assumptions now.

## 2. Logical components

### Presentation layer
Web interface for authorized office and factory users. Responsive behavior should be evaluated against actual devices and shop-floor conditions.

### Application layer
Business services for die master and status, production usage transactions, inspection, maintenance and repair, downtime/problem tracking, dashboard/reporting, user administration, and audit.

### Data layer
A relational data store is the leading option because the core records have clear relationships and require transactional consistency. Final database selection is pending technical review.

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

## 5. Decisions still open
- Frontend and backend framework
- Database engine
- Hosting and network topology
- Authentication method and user provisioning
- Offline or poor-network behavior
- Integration with production/ERP/MES systems
- File and image storage
- Backup frequency, retention, and recovery objectives

## 6. Initial deployment approach
Start with a development environment, then a controlled user-acceptance/pilot environment. Production deployment should follow security review, backup/restore validation, approved user acceptance testing, and documented support ownership.
