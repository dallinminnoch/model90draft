# Life Evaluation & Needs Analysis Notes

## Current state

This project is a vanilla HTML, CSS, and JavaScript multi-page financial planning web app for advisor-led life insurance planning conversations.

The current file structure is:

- `index.html`
- `styles.css`
- `app.js`
- `calculations.js`
- `charts.js`
- `data.js`
- `pages/profile.html`
- `pages/analysis-estimate.html`
- `pages/analysis-detail.html`
- `pages/recommendations.html`
- `pages/planner.html`
- `pages/summary.html`
- `pages/lens.html`

## What has been built

- A new application homepage with:
  - top menu bar
  - search bar
  - `Home` navigation item
  - `Financial Products` dropdown
  - `LENS` inside the dropdown
- A dedicated `LENS` landing page that contains the original planner start screen
- A full multi-step workflow for:
  - Client Profile
  - Estimate Need
  - Detailed Analysis
  - Coverage Options
  - Policy Planner
  - Summary
- Shared progress bar navigation across workflow pages
- Clickable progress bar steps
- Skip logic from `Estimate Need` to `Coverage Options`
- Progress bar behavior that removes `Detailed Analysis` from the active workflow path if skipped
- A fixed `Return to Home` button on workflow pages
- Placeholder chart area for future Chart.js work
- Placeholder calculations and data modules for future expansion

## Important logic locations

- `app.js`
  - workflow navigation
  - progress bar rendering
  - skip-step logic
  - local storage and session storage state
  - recommendation and strategy selection
  - summary page population
- `calculations.js`
  - reserved for future formulas
- `charts.js`
  - reserved for future chart rendering
- `data.js`
  - reserved for assumptions and reference values

## Current visual direction

- Professional advisor-style layout
- Green accent system
- Homepage redesigned to feel more like a financial planning platform
- Header navigation moved to the right side next to search
- Dropdown menu for `Financial Products`

## Recent UI tweaks

- `Start Planning` button gently enlarges on hover
- Progress bar is more compact
- Current progress step is highlighted in pale green
- Search field now says `Search`
- Search and nav controls are less rounded
- Dropdown hover behavior was improved so the menu stays open while browsing the list

## Good next steps

- Refine homepage visual polish further if desired
- Add real planning calculations in `calculations.js`
- Add Chart.js donut chart rendering in `charts.js`
- Connect profile inputs to estimate and recommendation placeholders
- Add validation and better workflow guardrails for step jumping
- Add export or presentation-ready summary formatting later

## Resume note

If resuming later, start by reviewing:

- `styles.css`
- `app.js`
- `index.html`
- `pages/lens.html`

These files contain most of the current UI and workflow behavior.
