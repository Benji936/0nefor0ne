// Curated set of published `community` slugs to prerender at build time — shared
// by vite.config.js (includedRoutes) and generate-sitemap.mjs, mirroring
// set-slugs.js / card-ids.js.
//
// Currently EMPTY: the `community` table seed (Task 3) is deferred, so there are
// no published rows to enumerate yet. Once seeded, regenerate this list from:
//
//   SELECT slug FROM community
//   WHERE status = 'published' AND (verified OR owner IS NOT NULL)
//   ORDER BY verified DESC, updated_at DESC
//   LIMIT 200;
//
// Cap stays ~200 to avoid a thin-content build explosion (see Part J risk notes).
export const TOP_COMMUNITY_SLUGS = [];
