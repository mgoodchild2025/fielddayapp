# Managing Players & Roles

**Admin Panel → Players**

The Players page lists every member of your organisation and lets you search, filter, change roles, and manage access — all from one place.

---

## Role Hierarchy

Fieldday has four member roles, ordered from highest to lowest access:

| Role | Colour | Access level |
|---|---|---|
| **Org Admin** | Purple | Full admin panel access — events, payments, settings, billing, and member management |
| **League Admin** | Blue | Scoped admin access — assigned events only (schedule, teams, scores, players). No settings or billing |
| **Captain** | Orange | Player-facing only — manage own team roster, submit and confirm scores |
| **Player** | Grey | Standard player access — view schedule, standings, register for events |

### Role details

**Org Admin**
Full control over the organisation. Can manage all events, view all payments, configure branding and website settings, and change any other member's role. There should always be at least one Org Admin.

**League Admin**
A co-organiser scoped to specific leagues. Useful for referees, venue managers, or assistants who need to run the day-to-day of one event without access to billing or org-wide settings.

**Captain**
A team leader role. Captains can manage their roster (invite/remove players), submit game scores, and confirm opponent submissions. They do not have admin panel access.

**Player**
The default role for anyone who registers. Players can browse public pages, view their schedule and standings, and register for events.

---

## Changing a Role

> Only **Org Admins** can change roles. You cannot change your own role.

1. Go to **Admin → Players**
2. Find the member (use the search bar or league filter)
3. Click their **role badge** in the Role column
4. Select the new role from the dropdown — it saves immediately

The change takes effect instantly. If you downgrade an Org Admin or League Admin to Player or Captain, they lose panel access on their next page load.

---

## Member Actions

### Suspend

Suspend a member to soft-block their access without permanently removing them.

**What suspension does:**
- Removes access to the admin panel immediately (Org Admins and League Admins)
- Prevents the member from being counted as active in dashboard metrics
- Does **not** remove them from any teams
- Does **not** cancel existing event registrations
- Player-facing pages (schedule, standings, public event pages) remain accessible

**What suspension does not do:**
- It does not block a player from viewing the public site
- It does not send the member any notification

Suspension is reversible at any time using **Reinstate**.

**When to use it:** A member who should no longer have admin access but whose history and registrations should be preserved — e.g. a volunteer who has stepped down, or a player taking a season off.

### Reinstate

Restores a suspended member to **Active** status. All previous access returns immediately based on their role.

### Delete

Permanently removes the member from your organisation.

**What deletion does:**
- Removes the member from your org and all teams within it
- Cancels no registrations (registration history is retained for record-keeping)
- If the member belongs to no other Fieldday organisations, their account is deleted so they can re-register with the same email address

> ⚠️ **This action is irreversible.** There is a confirmation prompt before deletion proceeds.

**When to use it:** A duplicate account, a test user, or someone who should have no record in your org going forward.

---

## Frequently Asked Questions

**Can I have more than one Org Admin?**
Yes. There is no limit. It is recommended to have at least two so access isn't lost if one admin leaves.

**What happens if I accidentally suspend myself?**
You cannot suspend yourself — the action is blocked for your own account. Another Org Admin would need to reinstate you.

**Can a suspended player still register for a new event?**
The registration flow checks for active membership. A suspended member will not be able to complete a new registration.

**I changed someone's role but the page still shows the old role.**
Try a hard refresh (Cmd+Shift+R / Ctrl+Shift+R). If the problem persists, the change may not have saved — check that you selected the new role from the dropdown and waited for the badge to update before navigating away.

**Can a Captain also be registered as a player in an event?**
Yes. Roles and registrations are independent. A Captain can hold a team-leadership role and also be a registered participant in one or more events simultaneously.
