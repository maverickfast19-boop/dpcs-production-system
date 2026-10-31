# DPCS Requirements — Discovery Baseline

**Scope:** One factory  
**Target delivery window:** 90 days  
**Status:** Draft for stakeholder validation

## 1. Business objectives
- Establish a reliable and searchable register of all production dies.
- Record when and where each die is used.
- Make die condition, inspection, maintenance, and repair history visible.
- Capture production interruptions and die-related problems.
- Provide timely operational information for supervisors and management.

## 2. Functional scope

### 2.1 Die master
- Unique die code and description
- Part/product association
- Die type, specifications, and location
- Status (for example: active, under maintenance, inactive)
- Supporting documents and images, where required

### 2.2 Production and usage
- Record production order or job reference
- Record die issued/used, machine or line, and shift
- Record usage quantity or cycle count where available
- Record start/end time and responsible operator
- Preserve a traceable transaction history

### 2.3 Inspection and condition
- Inspection checklist and result
- Condition rating and defect notes
- Inspection date and inspector
- Follow-up action and due date

### 2.4 Maintenance and repair
- Preventive maintenance schedule
- Maintenance request and work order
- Repair activity, parts, labor, and completion result
- Downtime duration and return-to-service approval
- Full maintenance history per die

### 2.5 Problems and downtime
- Problem category and description
- Related die, machine, production order, and shift
- Start/end time and downtime duration
- Root cause and corrective action, when known

### 2.6 Dashboard and reports
- Die status overview
- Dies due for inspection or maintenance
- Maintenance and repair history
- Downtime summary and recurring problems
- Usage and utilization indicators, subject to available data

### 2.7 Users and audit
- Role-based access
- Record of important create/update/status actions
- User and timestamp attribution

## 3. Non-functional requirements to validate
- Supported devices: desktop, tablet, and/or mobile
- Network reliability and any offline requirement
- Authentication and password/session policy
- Backup, restore, and data retention
- Response time and expected number of users
- Hosting, security, and operational ownership
- Import/export and integration requirements

## 4. Discovery questions
1. How many dies are in the factory and what is the current die-code format?
2. Which departments create, use, inspect, and maintain die records?
3. What is the actual workflow from die request through return to storage?
4. Is usage measured by production quantity, machine cycles, hours, or a combination?
5. Which machines, lines, shifts, and production systems must be referenced?
6. Who may create, approve, edit, and close maintenance work?
7. Which reports and KPIs are required by supervisors and management?
8. What existing files or systems contain the source data?
9. Is internet/network access available at every point of use?
10. Who will own master-data quality and system administration?

## 5. Initial acceptance criteria
- Each die can be uniquely identified and searched.
- Authorized users can record die usage and status changes.
- Inspection and maintenance history is traceable by die.
- Downtime/problem records can be entered and reported.
- Access is restricted according to approved roles.
- Key transactions record user and timestamp.
- Factory representatives complete user acceptance testing before go-live.

## 6. Change control
This document is a discovery baseline, not a final signed specification. Changes to scope, workflow, KPI definitions, or integrations must be reviewed with the project owner and recorded before implementation.
