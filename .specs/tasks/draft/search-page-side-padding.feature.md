# Search Page — Add Side Spacing for Comfortable Navigation

**Type:** feature
**Status:** draft

## Description

The search page currently extends to the full width of the content area with minimal side spacing. On wider screens (desktop/large tablet) this makes the card grid feel cramped against the edges and harder to scan. The goal is to add comfortable horizontal breathing room on both sides of the search page content so navigation and browsing feel more spacious and intentional.

## User Request

> "I would like in the search page to add space on the sides to make navigation more comfortable"

## Scope

**In scope:**
- Horizontal padding / max-width adjustment on the Search page content
- Applies across all sections of Search.vue: results grid, trending cards, set browser, latest releases
- Responsive — extra spacing only on larger screens where it makes sense

**Out of scope:**
- Changing the global App layout (other pages should be unaffected)
- Changing card sizes or the grid column count
- Mobile layout changes (mobile already has tight spacing that works)
