# NYC DEP Personal Dashboard

Personal tools for work at NYC DEP, hosted on GitHub Pages. Installable as an app (PWA) and works offline. No build step.

## Tools

### Time Off Tracker (`/timeoff/`)
- Annual and sick leave balances, shown in hours and in workdays (whole days + leftover hours, and the exact fraction, e.g. 7.2 days).
- Monthly accrual rates you can edit. Adding a rate with a new starting month keeps older months at the old rate.
- Each month's hours post on the paycheck from the OPA Monthly Leave Processing Schedule. 2027 dates are official (UB #069-26); other dates are estimated with the same rule and can be edited.
- Log days off (past or planned) and see the running balance and future projections.
- Data is stored in your browser's localStorage. Use Export / Import backup in Settings to move it between devices.

## Structure
- `assets/app.css`: shared design tokens and app-shell components (app bar, tab bar, grouped lists, bottom sheets)
- `timeoff/leave.js`: leave math and NYC posting schedule
- `timeoff/app.js`: tracker UI
- `manifest.webmanifest`, `sw.js`, `icons/`: install and offline support

## Hosting
GitHub Pages, served from the `main` branch root.
