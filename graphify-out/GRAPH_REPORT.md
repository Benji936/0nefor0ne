# Graph Report - TradeMarket-1  (2026-08-19)

## Corpus Check
- 346 files · ~383,675 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3158 nodes · 5121 edges · 229 communities (194 shown, 35 thin omitted)
- Extraction: 98% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 76 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `41df2e35`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community Profile Page
- Community Directory & Filters
- Trade Detail Page
- Card Search State & URL Sync
- Search Filters Panel
- Discord Bot Commands
- Account Page & My Communities
- Announce Detail & Actions
- Built-With & Trader Search
- Duel Activity Shell & Discord SDK
- Community Claim Verification
- Propose Trade Dialog
- Inline Community Profile Editing
- Duel Room State & Signed Grants
- Trade Center Hub
- Create Announce Dialog
- Phone Verification Flow
- Community DB Schema
- Sitemap Generation
- Card Library & Wishlists
- Bulk Card Add & Resolver
- App Shell & Navigation
- Auth Dialog & Sign-In
- Decks List & Guest Migration
- Meetup Location Picker
- Community Card & Nearby Tiles
- Onboarding Start Page
- Announce Card & Expiry
- Card Detail Page
- Card API Client & Set Browser
- Community Claim Dialog & Edge Calls
- Community Billing
- Announce Messaging
- Trade Photo Uploads
- Admin Review Queue
- Proposal Row & Pending State
- Trader Profile Tabs
- Country Canonicalization & Seeding
- Community Plan Pricing
- Place Autocomplete & Geocoding
- Want List Input
- Package Manifests
- Community Events
- Card Effect Index Builder
- Card Search Resolver & Filters
- Archetype & Set Pages (JSON-LD)
- Community Event Editor
- getClient
- Community Follow
- Notification Bell
- Combo Explorer
- Package
- Package
- Psct Parser
- Profile Card & Country/City
- Deck Detail & Ignore List
- Announce Kind Detection
- Community Edit Dialog
- Trader Page & Discord Sign-In
- User Menu Chip
- Proposals Tab & History
- Slash Commands
- Package
- Card Type & Attribute Icons
- Trade Chat Panel
- Deck Import (YDK)
- Deck Stats & Estimated Value
- Community Kinds & Strictness
- Onboarding Steps & Skip State
- Package
- 2026 07 23 Community Section
- Client
- Community Social Links
- Domain Proof Verification
- Asia-Pacific OTS Scraper
- Common
- Want List
- Yugipedia Tips
- Release Community Claim
- Card Info Panel & Banlist Status
- Marketplace
- Build Archetype Slugs
- Announces Tab
- Card Binder Grid
- Card Hover Preview
- EU OTS Scraper
- Event Post
- Yugipedia Banlist
- Report Community Dialog
- run
- I18N
- Parse Announce
- Nearby Geo Queries
- Palette
- Americas OTS Scraper & Regions
- Events Scraper
- Community CRUD & Slugs
- Trader Cards & Matches Tab
- Archetype Art Manifest
- Trader Profile Dialog
- claim-verify-code Edge Function
- Close Announce
- Index
- Community Geo Backfill
- Prune Sitemap
- Upcoming Events Row
- Add Card Dialog
- Side Nav
- Common
- Trade Meetup Location
- eventPlace
- Nearby & Upcoming Events
- Deck Completion Bar
- Phone Gate Trading
- Railway
- Announce & Community Plan Docs
- Phone Verification
- Discord Entitlement Sync
- Community Image Uploads
- Index
- Index
- Announces
- 2026 07 19 Trade Meetup Location
- Email-code identity verification (Plan 1)
- Trade Event Timeline
- Community Event Mutations
- Complete Trade Photos Not A Gate
- Index
- Index
- Locked Cards
- Trader Favorites Trending
- Trade Event Log
- Discord Link
- Readme
- Readme
- Jsconfig
- Archetype Art
- Sync Ots Data
- Verify Beats
- Auth Callback & Discord Resync
- Announce Chat
- Package
- Seed Community Private
- Trader Link
- Trending Cards Activity
- Named Wishlists
- Proposal Photo State
- 2026 07 21 Looking For Announces
- 2026 07 27 Verified Paid Claim Subscription
- Landing Traders
- Index
- Index
- Announce Want Card
- SSG Output Verification
- Vercel
- Common
- Index
- Index
- Index
- Index
- Index
- Security Rls And Accept Rpc
- Thread Deletion Queue
- Announce Expiry
- Claim Subscription
- 2026 07 28 Inline Profile Editing
- Index
- Check Coverage.Sh
- Privacy Page
- Terms Page
- Index
- Bot Config
- Community Created By
- Notification
- Public.Trade Photo
- "Trader"
- Trade Photo
- "Trader"
- Public.Announce
- Public.Announce
- Public.Announce
- Public.Announce
- Public."Trade"
- Trade Message
- Deck Section Rows
- Place Geocoding
- Pending Trade Hints
- Trade Proposal Mutations
- Followed Communities
- Notification Formatting
- community table
- fetchDirectory
- Proposal Filters & History Split
- isValidCode
- Platform Icons
- Yu-Gi-Oh Icon Auto-Discovery (cardIcons.js)
- fetchBySlug
- cancelTradeProposal
- Vite Build & Prerender Config
- Q: Why do the Discord tournament gate, the Stripe claim gate, and the phone gate keep converging on the same shape without sharing any code?
- Q: How does the Discord bot entitlement branch work, and does it break the server-side-authority pattern?
- Cloudflare R2 Card Image Hosting
- addLink
- startEdit
- onDragEnd
- community_claim table

## God Nodes (most connected - your core abstractions)
1. `getClient()` - 162 edges
2. `cardImage()` - 27 edges
3. `scripts` - 23 edges
4. `searchById()` - 22 edges
5. `countryByCode()` - 16 edges
6. `formatPrice()` - 15 edges
7. `community` - 15 edges
8. `getCurrentSession()` - 14 edges
9. `invokeFunction()` - 14 edges
10. `kindsOf()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `HMAC-signed tournament grant` --semantically_similar_to--> `Ownership is set server-side only`  [INFERRED] [semantically similar]
  discord-activity/README.md → docs/superpowers/plans/2026-07-26-verified-store-claim.md
- `Tournament mode (verified stores)` --semantically_similar_to--> `Stripe subscription claim gate (Plan 2)`  [INFERRED] [semantically similar]
  discord-activity/README.md → docs/superpowers/plans/2026-07-27-verified-paid-claim-subscription.md
- `community-media Storage Bucket` --semantically_similar_to--> `trademarket-cards R2 Bucket`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-07-28-inline-profile-editing-design.md → frontend/CLOUDFLARE_R2_SETUP.md
- `Guild Subscription entitlements as source of truth` --semantically_similar_to--> `Ownership granted and revoked only by the Stripe webhook`  [INFERRED] [semantically similar]
  discord-bot/README.md → docs/superpowers/plans/2026-07-27-verified-paid-claim-subscription.md
- `Email-code identity verification (Plan 1)` --semantically_similar_to--> `Phone verification trade gate`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-07-26-verified-store-claim.md → docs/phone-verification.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Region OTS Store Merge into stores.json** — scrapers_readme_stores_scraper, scrapers_readme_stores_eu, scrapers_readme_stores_asia, scrapers_readme_ots_portal_api, scrapers_readme_stores_json [EXTRACTED 1.00]
- **Verified community to Discord surface (guild link, events, tournament mode)** — discord_bot_readme_verify_command, discord_bot_readme_community_event_post, discord_activity_readme_community_for_guild, discord_activity_readme_tournament_mode, docs_superpowers_plans_2026_07_23_community_section_community_table [EXTRACTED 1.00]
- **Verified paid store claim pipeline** — docs_superpowers_plans_2026_07_26_verified_store_claim_claim_request_code, docs_superpowers_plans_2026_07_26_verified_store_claim_claim_verify_code, docs_superpowers_plans_2026_07_27_verified_paid_claim_subscription_claim_create_checkout, docs_superpowers_plans_2026_07_27_verified_paid_claim_subscription_stripe_webhook, docs_superpowers_plans_2026_07_27_verified_paid_claim_subscription_claim_portal, docs_superpowers_specs_2026_07_26_verified_paid_store_claim_design_community_claim, docs_superpowers_plans_2026_07_23_community_section_community_table [EXTRACTED 1.00]
- **Community profile ownership UX surfaces** — docs_superpowers_plans_2026_07_23_community_section_community_profile, docs_superpowers_plans_2026_07_23_community_section_account_page, docs_superpowers_plans_2026_07_29_community_menu_item_user_menu_chip, docs_superpowers_plans_2026_07_28_inline_profile_editing_inline_editing, docs_superpowers_plans_2026_07_23_community_section_community_edit_dialog [INFERRED 0.85]
- **Crawler-Facing Discovery Surface** — frontend_index_seo_meta, frontend_index_structured_data, frontend_index_noscript_fallback, frontend_public_robots_crawl_policy [INFERRED 0.85]

## Communities (229 total, 35 thin omitted)

### Community 0 - "Community Profile Page"
Cohesion: 0.04
Nodes (39): avatarInput, bannerInput, canonicalUrl, cityCountry, claimOpen, community, currentUserId, displayAvatar (+31 more)

### Community 1 - "Community Directory & Filters"
Cohesion: 0.06
Nodes (30): anyFilter, count, createOpen, currentUserId, filters, GEO_MESSAGES, initial, KIND_OPTIONS (+22 more)

### Community 2 - "Trade Detail Page"
Cohesion: 0.05
Nodes (39): backTo, bothUploaded, busy, cancelConfirm, cashLabel, counterpartyName, currentUserId, declineReason (+31 more)

### Community 3 - "Card Search State & URL Sync"
Cohesion: 0.06
Nodes (49): filtersButtonLabel, filtersDialogOpen, isEmptyInitial, isMounted, isNoResults, resultCount, resultCountLabel, route (+41 more)

### Community 4 - "Search Filters Panel"
Cohesion: 0.06
Nodes (52): activeChips, activeCount, ATTRIBUTES, bodyWrapper, bodyWrapperProps, canUseMonsterFilters, clearAll(), cmpSym() (+44 more)

### Community 5 - "Discord Bot Commands"
Cohesion: 0.05
Nodes (39): { buildEventEmbed, eventAnnouncement }, client, {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
}, { commandDefinitions, buildSearchEmbed, escapeMd }, { createClient }, { createHash }, DEFAULT_THREAD_MESSAGE, { entitlementIsActive, syncGuildEntitlement } (+31 more)

### Community 6 - "Account Page & My Communities"
Cohesion: 0.05
Nodes (47): activeScope, billingUnavailable, city, claimSources, communities, connectDiscord(), countryCode, countryItems (+39 more)

### Community 7 - "Announce Detail & Actions"
Cohesion: 0.05
Nodes (49): addCardRef, addedToList, addingToList, artFailed, canChat, canRenew, cardLinkOpen, cardQuery (+41 more)

### Community 8 - "Built-With & Trader Search"
Cohesion: 0.06
Nodes (41): GROUPS, isDark, locale, route, theme, enough, loading, recentPeople (+33 more)

### Community 9 - "Duel Activity Shell & Discord SDK"
Cohesion: 0.05
Nodes (34): errorMsg, me, players, state, status, elapsedMs, label, now (+26 more)

### Community 10 - "Community Claim Verification"
Cohesion: 0.05
Nodes (46): beat, BEATS, botToken, botTokenExpires, canSendCode, claim, code, codeOutstanding (+38 more)

### Community 11 - "Propose Trade Dialog"
Cohesion: 0.05
Nodes (39): addCardRef, availableNames, canSubmit, counterpartyWishlist, describe(), effectiveUser, errorMessage, fetchingCardId (+31 more)

### Community 12 - "Inline Community Profile Editing"
Cohesion: 0.06
Nodes (37): One Atomic Save via updateCommunity, CommunityEditDialog.vue (create-only), community-media Storage Bucket, src/lib/communityMedia.js, CommunityProfile.vue, ?edit=1 Deep Link into Edit Mode, Edit-Mode Toggle (not always-on editing), Inline Community Profile Editing (+29 more)

### Community 13 - "Duel Room State & Signed Grants"
Cohesion: 0.10
Nodes (30): BEST_OF, CLIENT_ACTIONS, commit(), freshLp(), initialState(), matchScore(), matchWinner(), reduce() (+22 more)

### Community 14 - "Trade Center Hub"
Cohesion: 0.07
Nodes (23): beforeUnmount(), buckets(), debounce(), filterCardName(), handler(), loadAnnounces(), loadCardTraders(), loadMatches() (+15 more)

### Community 15 - "Create Announce Dialog"
Cohesion: 0.05
Nodes (35): archetypeErr, archetypeList, archetypeMatches, archetypeQuery, artFailed, canSubmit, cardQuery, cardResults (+27 more)

### Community 16 - "Phone Verification Flow"
Cohesion: 0.08
Nodes (46): backToNumber(), busy, canConfirm, canSend, close(), code, confirm(), countryCode (+38 more)

### Community 17 - "Community DB Schema"
Cohesion: 0.07
Nodes (27): community_claim_guard, community, community_report, auth, auth.users, community_claim, community_private, auth.users (+19 more)

### Community 18 - "Sitemap Generation"
Cohesion: 0.18
Nodes (15): archetypeUrlEntry(), cardUrlEntry(), __dirname, fetchTopCards(), hreflangSet(), LIMIT, LOCALES, main() (+7 more)

### Community 19 - "Card Library & Wishlists"
Cohesion: 0.06
Nodes (33): beforeUnmount(), confirmDelete(), filterCovered(), groupKey(), isCollapsed(), emit, { t }, listNameError() (+25 more)

### Community 20 - "Bulk Card Add & Resolver"
Cohesion: 0.10
Nodes (28): searchCardByName(), searchCardBySetCode(), update(), includedRows(), isIncluded(), onConfirm(), onResolve(), open() (+20 more)

### Community 21 - "App Shell & Navigation"
Cohesion: 0.06
Nodes (25): props, emit, props, divertsFrom(), onAuthChange(), signOut(), changePage(), divertToOnboarding() (+17 more)

### Community 22 - "Auth Dialog & Sign-In"
Cohesion: 0.09
Nodes (25): city, clearFields(), close(), countryCode, countryItems, discordSubmitting, email, emit (+17 more)

### Community 23 - "Decks List & Guest Migration"
Cohesion: 0.11
Nodes (24): addMissingToWishlist(), beforeUnmount(), cancelRename(), checkPendingMigration(), clearGuestDecks(), confirmDelete(), confirmImport(), confirmRename() (+16 more)

### Community 24 - "Meetup Location Picker"
Cohesion: 0.09
Nodes (31): allPlaces, clearPick(), distLabel(), emit, ensureLoaded(), events, geoAsked, geoError (+23 more)

### Community 25 - "Community Card & Nearby Tiles"
Cohesion: 0.13
Nodes (14): distance, extras, kinds, kindsLabel, primary, props, route, { t } (+6 more)

### Community 26 - "Onboarding Start Page"
Cohesion: 0.06
Nodes (32): addCardRef, advance(), blurb, bulkAddRef, continueLabel, current, emit, finish() (+24 more)

### Community 27 - "Announce Card & Expiry"
Cohesion: 0.09
Nodes (30): artFailed, coverImage, daysLeft, emit, expired, expiring, formattedPrice, fromCommunity (+22 more)

### Community 28 - "Card Detail Page"
Cohesion: 0.09
Nodes (19): ARCHETYPE_SLUG_BY_NAME, cardId(), cardImageUrl(), ensureYugipediaSearchers(), ensureYugipediaTips(), load(), loadArtworks(), loadRelatedCards() (+11 more)

### Community 29 - "Card API Client & Set Browser"
Cohesion: 0.07
Nodes (33): get(), getCardArtworks(), getCardsBySet(), getCardSets(), getSetReleaseDates(), getWithRetry(), LANG_MAP, langParam() (+25 more)

### Community 30 - "Community Claim Dialog & Edge Calls"
Cohesion: 0.09
Nodes (25): close(), code, doneMessage, emit, errorMsg, interval, manualReason, myCountryCode (+17 more)

### Community 31 - "Community Billing"
Cohesion: 0.12
Nodes (26): busy, cancelling, change(), date, emit, info, isDiscord, planLabel (+18 more)

### Community 32 - "Announce Messaging"
Cohesion: 0.10
Nodes (25): canChat, draft, listRef, loading, loadingThreads, loadThread(), loadThreads(), messages (+17 more)

### Community 33 - "Trade Photo Uploads"
Cohesion: 0.11
Nodes (23): bothUploaded, dragging, emit, fileInputRef, loadingPhotos, loadPhotos(), mineUploaded, myPhotos (+15 more)

### Community 34 - "Admin Review Queue"
Cohesion: 0.10
Nodes (24): billing, busyId, cancelDecline(), claims, decide(), decliningId, denied, failed (+16 more)

### Community 35 - "Proposal Row & Pending State"
Cohesion: 0.10
Nodes (18): detailHref, emit, hoverStar, iConfirmed, initials, isAccepted, isPending, loadMyRating() (+10 more)

### Community 36 - "Trader Profile Tabs"
Cohesion: 0.08
Nodes (28): activeTab, canPropose, completedTrades, emit, focusTab(), headingTag, initials, load() (+20 more)

### Community 37 - "Country Canonicalization & Seeding"
Cohesion: 0.22
Nodes (12): __dirname, DRY, LIMIT, main(), STORES, toRow(), ALIASES, BY_KEY (+4 more)

### Community 38 - "Community Plan Pricing"
Cohesion: 0.10
Nodes (25): price, priceMonth, priceYear, priceLabel, emit, plans, props, { t, locale } (+17 more)

### Community 39 - "Place Autocomplete & Geocoding"
Cohesion: 0.17
Nodes (15): activeIdx, cancelPending(), choose(), emit, inputRef, listId, loading, onInput() (+7 more)

### Community 40 - "Want List Input"
Cohesion: 0.11
Nodes (18): current, emit, props, rawText, resolvedCount, resolving, rows, { t } (+10 more)

### Community 41 - "Package Manifests"
Cohesion: 0.08
Nodes (25): concurrently, dependencies, @discord/embedded-app-sdk, vue, description, devDependencies, concurrently, vite (+17 more)

### Community 42 - "Community Events"
Cohesion: 0.09
Nodes (22): canPost, confirmDelete(), confirmingId, deletingId, dialogOpen, editingEvent, emit, events (+14 more)

### Community 43 - "Card Effect Index Builder"
Cohesion: 0.11
Nodes (22): analyzeScript(), C, categoriesToActions(), files, findFetches(), index, limit, officialDir (+14 more)

### Community 44 - "Card Search Resolver & Filters"
Cohesion: 0.23
Nodes (15): getArchetypes(), searchByArchetype(), searchByFilters(), canonicalArchetype(), cardInArchetype(), computeSeed(), dedupe(), locationAllows() (+7 more)

### Community 45 - "Archetype & Set Pages (JSON-LD)"
Cohesion: 0.16
Nodes (13): getCardsByArchetype(), artUrl(), fetchCards(), mounted(), '$route.params.slug'(), setup(), shape(), fetchCards() (+5 more)

### Community 46 - "Community Event Editor"
Cohesion: 0.10
Nodes (23): canSubmit, close(), coverInput, coverUrl, desc, draft, emit, endsAt (+15 more)

### Community 47 - "getClient"
Cohesion: 0.18
Nodes (20): loadProfile(), loadTrades(), close(), emit, submit(), addAnnounceImages(), createAnnounce(), deleteAnnounceImage() (+12 more)

### Community 48 - "Community Follow"
Cohesion: 0.17
Nodes (14): busy, emit, following, hovering, icon, label, props, { t } (+6 more)

### Community 49 - "Notification Bell"
Cohesion: 0.15
Nodes (14): containerRef, emit, load(), loading, markAllRead(), notifications, onItemClick(), open (+6 more)

### Community 50 - "Combo Explorer"
Cohesion: 0.11
Nodes (19): cardId, effects, filteredCards(), isMounted, load(), loading, locale, matchesRowQuery() (+11 more)

### Community 51 - "Package"
Cohesion: 0.09
Nodes (23): axios, dependencies, axios, @mdi/font, ocgcore-wasm, @supabase/supabase-js, tailwindcss, @tailwindcss/vite (+15 more)

### Community 52 - "Package"
Cohesion: 0.09
Nodes (23): scripts, build, cards:archetype-art, cards:banlist, cards:bulk-upload, cards:sync, cards:tips, community:geo (+15 more)

### Community 53 - "Psct Parser"
Cohesion: 0.12
Nodes (25): arg(), buckets, loadCards(), outDir, useLLM, hasEffectBreakdown(), data, LABEL_COLORS (+17 more)

### Community 54 - "Profile Card & Country/City"
Cohesion: 0.12
Nodes (16): onCityPicked(), data(), draftCityItems(), EMPTY_PROFILE(), mounted(), onAvatarSelected(), onCountryChange(), profileCountry() (+8 more)

### Community 55 - "Deck Detail & Ignore List"
Cohesion: 0.17
Nodes (16): addMissingToWishlist(), beforeUnmount(), loadDeck(), mounted(), onToggleIgnore(), readGuestDecks(), resolveStats(), subscribeRealtime() (+8 more)

### Community 56 - "Announce Kind Detection"
Cohesion: 0.13
Nodes (19): isLf, isLf, lfHeadline, headline(), locale, props, route, rows (+11 more)

### Community 57 - "Community Edit Dialog"
Cohesion: 0.11
Nodes (19): bio, canSubmit, city, close(), country, discordUrl, emit, errorMsg (+11 more)

### Community 58 - "Trader Page & Discord Sign-In"
Cohesion: 0.10
Nodes (19): loginWithDiscord(), onFollowAuthRequired(), onFollowAuthRequired(), signIn(), currentUserId, displayName, isSelf, locale (+11 more)

### Community 59 - "User Menu Chip"
Cohesion: 0.11
Nodes (17): avatarUrl, communityTarget, displayName, emit, handleAction(), initials, loadOwnedCommunities(), loadProfile() (+9 more)

### Community 60 - "Proposals Tab & History"
Cohesion: 0.17
Nodes (12): activeFilter, cancelled, counts, done, emit, filters, historyGroups, meta (+4 more)

### Community 61 - "Slash Commands"
Cohesion: 0.20
Nodes (16): handleVerifyCommand(), registerSlashCommands(), {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  EntryPointCommandHandlerType,
  EmbedBuilder,
}, buildSearchEmbed(), cardDetail(), commandDefinitions(), escapeLinkText(), escapeMd() (+8 more)

### Community 62 - "Package"
Cohesion: 0.11
Nodes (18): dependencies, discord.js, dotenv, @supabase/supabase-js, description, engines, node, dotenv (+10 more)

### Community 63 - "Card Type & Attribute Icons"
Cohesion: 0.18
Nodes (15): typeChips(), levelStarUrl, attribute, hasAny, iconStyle, property, props, attributeIconFor() (+7 more)

### Community 64 - "Trade Chat Panel"
Cohesion: 0.13
Nodes (16): emit, props, statusLabel, { t }, loadingMessages, loadMessages(), messages, msgListRef (+8 more)

### Community 65 - "Deck Import (YDK)"
Cohesion: 0.13
Nodes (9): getCardsByIds(), addMissingToWishlist(), CardSlot, onDrop(), onFileChange(), processFile(), computeStats(), onPanelToggle() (+1 more)

### Community 66 - "Deck Stats & Estimated Value"
Cohesion: 0.17
Nodes (9): estimatedValueRaw(), typeBreakdown(), cardIsSpellTrap(), isST, isSpellTrap(), computeEstimatedValue(), computeTypeBreakdown(), IMPORTANT: this module is pure — it imports nothing from `vue` or (+1 more)

### Community 67 - "Community Kinds & Strictness"
Cohesion: 0.22
Nodes (12): extras, initial, place, primary, props, { t }, profileKinds, KINDS (+4 more)

### Community 68 - "Onboarding Steps & Skip State"
Cohesion: 0.21
Nodes (15): back, skip(), fetchPileCounts(), isEmptyAccount(), needsOnboarding(), nextStep(), ONBOARDING_ENTRY_ROUTES, prevStep() (+7 more)

### Community 69 - "Package"
Cohesion: 0.12
Nodes (17): @aws-sdk/client-s3, devDependencies, @aws-sdk/client-s3, dotenv, sass, vite, vite-plugin-vue-devtools, vite-ssg (+9 more)

### Community 70 - "2026 07 23 Community Section"
Cohesion: 0.12
Nodes (17): Account.vue "My communities" strip, ClaimCommunityDialog.vue, CommunityDirectory.vue, CommunityEditDialog.vue, communityFilters.js, src/lib/community.js data-access layer, CommunityProfile.vue, communitySlug.js (+9 more)

### Community 71 - "Client"
Cohesion: 0.23
Nodes (13): LOCAL_DIR, main(), BUCKET, CROPPED_PREFIX, listExistingKeys(), PREFIX, required, s3 (+5 more)

### Community 72 - "Community Social Links"
Cohesion: 0.31
Nodes (7): editValid, BY_ID, isValidLink(), LINK_PLATFORMS, linkHref(), MAX_LINKS, PLATFORM_IDS

### Community 73 - "Domain Proof Verification"
Cohesion: 0.40
Nodes (8): emailMismatch, state, domainMatches(), emailDomain(), LIVE_SUBSCRIPTION, proofRoute(), siteHost(), verifyStep()

### Community 74 - "Asia-Pacific OTS Scraper"
Cohesion: 0.16
Nodes (14): build_session(), Create a requests Session pre-loaded with the descriptive User-Agent header., Yu-Gi-Oh! Official Tournament Store (OTS) and event scrapers. Two entry points:…, _fetch_group_tournaments(), main(), _normalize_store(), Scrape Asia-Pacific Yu-Gi-Oh! Official Tournament Store locations. Konami runs…, Convert one KCGN tournament record into the shared normalized store shape.… (+6 more)

### Community 75 - "Common"
Cohesion: 0.22
Nodes (14): Any, Response, fetch_html(), fetch_json(), log_diff(), post_json(), Shared helpers for the OTS store and event scrapers. Centralizes the pieces…, Fetch a URL and return its decoded HTML/text body (with retries). (+6 more)

### Community 76 - "Want List"
Cohesion: 0.27
Nodes (10): buildWantRows(), capName(), clampQty(), currencyOf(), parseQtyLine(), parseWantList(), assert, { parseWantList, buildWantRows, wantListTitle } (+2 more)

### Community 77 - "Yugipedia Tips"
Cohesion: 0.20
Nodes (12): args, checkBatch(), __dirname, fetchCardList(), hasUsefulTips(), main(), NAME_TO_ID, parseSearchers() (+4 more)

### Community 78 - "Release Community Claim"
Cohesion: 0.18
Nodes (12): armed, busy, confirm(), emit, failed, mode, open, props (+4 more)

### Community 79 - "Card Info Panel & Banlist Status"
Cohesion: 0.08
Nodes (30): hasBanlist(), levelIcon(), label, props, status, { t }, title, artSrc (+22 more)

### Community 80 - "Marketplace"
Cohesion: 0.25
Nodes (10): handleSearchCommand(), dedupeById(), fetchTraderNames(), groupCollection(), normalizeQuery(), relevance(), searchListings(), assert (+2 more)

### Community 81 - "Build Archetype Slugs"
Cohesion: 0.15
Nodes (12): allNames, ART, body, cardCount(), collisions, countAll(), __dirname, dropped (+4 more)

### Community 82 - "Announces Tab"
Cohesion: 0.15
Nodes (13): currentUserId, emit, filteredOthers, filterOptions, isLf, kindAnnounces, kindFilter, myAnnounces (+5 more)

### Community 83 - "Card Binder Grid"
Cohesion: 0.16
Nodes (12): filtered, hasWanted, more, props, query, rarities, rarityKey(), rarityValue (+4 more)

### Community 84 - "Card Hover Preview"
Cohesion: 0.20
Nodes (10): card, panel, pos, route, cache, hideHoverCard(), hoverState, installCardHoverPreview() (+2 more)

### Community 85 - "EU OTS Scraper"
Cohesion: 0.18
Nodes (13): _cell_radius_miles(), main(), _normalize_store(), _parse_address(), Scrape European Yu-Gi-Oh! Official Tournament Store (OTS) locations. Konami…, Convert one raw EU store record into the shared normalized store shape. Matches…, Fetch and de-duplicate every EU OTS store via adaptive grid subdivision. Tiles…, Entry point for standalone debugging: scrape and log a count by country. (+5 more)

### Community 86 - "Event Post"
Cohesion: 0.22
Nodes (13): postOneEvent(), postPendingEvents(), buildEventEmbed(), communityUrl(), discordTimestamp(), { EmbedBuilder }, { escapeMd, truncate }, eventAnnouncement() (+5 more)

### Community 87 - "Yugipedia Banlist"
Cohesion: 0.24
Nodes (11): args, askPage(), askStatus(), buildNameIndex(), __dirname, FORMATS, idsForTitle(), main() (+3 more)

### Community 88 - "Report Community Dialog"
Cohesion: 0.21
Nodes (11): canSubmit, close(), emit, errorMsg, props, reason, sent, submit() (+3 more)

### Community 89 - "run"
Cohesion: 0.26
Nodes (11): reportTradeError(), load(), onComplete(), onEdited(), reportTradeError(), run(), say(), fetchMyProposals() (+3 more)

### Community 90 - "I18N"
Cohesion: 0.29
Nodes (10): createAppI18n(), detectLocale(), persistLocale(), SUPPORTED, installCardImageFallback(), createApp, localeChildren, routes (+2 more)

### Community 91 - "Parse Announce"
Cohesion: 0.27
Nodes (10): ANNOUNCE_KIND, archetypeRe(), escapeRe(), matchArchetype(), parseAnnounce(), ARCHETYPES, assert, { parseAnnounce, ANNOUNCE_KIND } (+2 more)

### Community 92 - "Nearby Geo Queries"
Cohesion: 0.19
Nodes (13): loadNear(), toggleNear(), callNear(), communitiesNear(), DEFAULT_RADIUS, eventsNear(), GEO_DENIED, GEO_UNAVAILABLE (+5 more)

### Community 93 - "Palette"
Cohesion: 0.27
Nodes (9): AA_NORMAL, contrast(), luminance(), parseCssThemes(), parseVars(), parseVuetifyThemes(), ROLE_PAIRS, css (+1 more)

### Community 94 - "Americas OTS Scraper & Regions"
Cohesion: 0.20
Nodes (11): country_for(), Derive a coarse region code (NA / LATAM / EU / EMEA / APAC / OTHER). This is a…, Best-effort country name from region + state. Only North America can be…, region_for(), _normalize_store(), Scrape Yu-Gi-Oh! Official Tournament Store (OTS) locations. The public OTS…, Collect every OTS store worldwide, from all three of Konami's portals. Konami…, Convert one raw API store record into our normalized output shape. Maps the… (+3 more)

### Community 95 - "Events Scraper"
Cohesion: 0.23
Nodes (11): classify_event_type(), _find_registration_link(), _parse_event_jsonld(), _parse_upcoming_list(), Scrape upcoming Yu-Gi-Oh! events (YCS, Regionals, Locals, specials, etc.). The…, Return the first registration/ticket link on a detail page, if any. Matches…, Parse the "Upcoming Events" section of the events index page. Returns one dict…, Scrape the upcoming events list and enrich each from its detail page. Returns a… (+3 more)

### Community 96 - "Community CRUD & Slugs"
Cohesion: 0.30
Nodes (11): saveEdit(), assertHttp(), createCommunity(), resolveLocation(), uniqueSlug(), updateCommunity(), normalizeKinds(), sanitizeLinks() (+3 more)

### Community 97 - "Trader Cards & Matches Tab"
Cohesion: 0.18
Nodes (9): emit, { t }, emit, initials, kindMeta, location, props, { t } (+1 more)

### Community 98 - "Archetype Art Manifest"
Cohesion: 0.27
Nodes (9): archetypeArt, archetypeArt, archetypeArt, archetypeArtId(), archetypeArtManifest, archetypeArtUrl(), ensureArchetypeArtManifest(), lowerIndexFor() (+1 more)

### Community 99 - "Trader Profile Dialog"
Cohesion: 0.24
Nodes (10): close(), emit, isSelf, locale, open, profile, propose(), props (+2 more)

### Community 100 - "claim-verify-code Edge Function"
Cohesion: 0.40
Nodes (5): claim-verify-code Edge Function, Ownership is set server-side only, claim-create-checkout Edge Function, communityPricing.js (location to currency mapping), 365-day free trial with card up front

### Community 101 - "Close Announce"
Cohesion: 0.27
Nodes (8): canCloseAnnounce(), CLOSE_COMMANDS, CLOSE_STATUS, closedStatusFor(), isCloseCommand(), assert, { isCloseCommand, closedStatusFor, canCloseAnnounce }, test

### Community 102 - "Index"
Cohesion: 0.22
Nodes (10): One for One App Shell (index.html), Impact Affiliate Impression Tracking, Noscript Crawler Fallback Content, SEO / Open Graph / Twitter Card Meta, JSON-LD Structured Data (WebApplication + WebSite SearchAction), Offline Bundled Landing Page Snapshot, robots.txt Allow-All + Sitemap Pointer, Vue 3 + Vite Frontend Project Setup (+2 more)

### Community 103 - "Community Geo Backfill"
Cohesion: 0.33
Nodes (9): db, DRY, forward(), LIMIT, main(), nominatim(), normalizeNames(), reverse() (+1 more)

### Community 104 - "Prune Sitemap"
Cohesion: 0.22
Nodes (9): __dirname, DIST, DIST_SITEMAP, dropped, pageExists(), pruned, PUBLIC_SITEMAP, seen (+1 more)

### Community 105 - "Upcoming Events Row"
Cohesion: 0.27
Nodes (9): events, load(), locale, props, route, { t, locale: i18nLocale }, fetchUpcomingEvents(), mergeFollowedFirst() (+1 more)

### Community 106 - "Add Card Dialog"
Cohesion: 0.24
Nodes (5): checkDuplicates(), open(), reset(), selectCard(), submit()

### Community 107 - "Side Nav"
Cohesion: 0.24
Nodes (9): activate(), emit, isActive(), isItemActive(), items, locale, props, route (+1 more)

### Community 108 - "Common"
Cohesion: 0.24
Nodes (10): load_existing(), _output_path(), Return the absolute path of a file inside the data/ directory., Load a previously generated data file, or an empty envelope if absent/invalid.…, Write the standard envelope to data/<filename>, atomically. Enforces the "fail…, write_output(), main(), Entry point: scrape events, log a diff, and write data/events.json.… (+2 more)

### Community 109 - "Trade Meetup Location"
Cohesion: 0.22
Nodes (9): public.counter_trade_proposal(), public.create_trade_proposal(), public.fetch_my_proposals(), public.update_trade_proposal(), "Card", public."Card", public."Trade", "Trade" (+1 more)

### Community 110 - "eventPlace"
Cohesion: 0.32
Nodes (6): mapUrlFor(), placeFor(), placeLabel(), communityLocation(), eventMapUrl(), eventPlace()

### Community 111 - "Nearby & Upcoming Events"
Cohesion: 0.22
Nodes (9): whenLabel(), locale, placeLabel(), props, route, { t, locale: i18nLocale }, whenLabel(), whenLabel() (+1 more)

### Community 112 - "Deck Completion Bar"
Cohesion: 0.25
Nodes (3): pct(), deckCompletionPct(), computeCompletionPct()

### Community 113 - "Phone Gate Trading"
Cohesion: 0.28
Nodes (7): public.require_phone_verified_to_trade, public.app_setting, public.is_phone_verified(), public.phone_gate_enabled(), auth.users, trade_requires_phone_on_accept, trade_requires_phone_on_insert

### Community 114 - "Railway"
Cohesion: 0.25
Nodes (7): build, builder, deploy, restartPolicyMaxRetries, restartPolicyType, startCommand, $schema

### Community 115 - "Announce & Community Plan Docs"
Cohesion: 0.50
Nodes (5): announce table, lib/parseAnnounce.js, Extend announce table rather than fork a parallel table, Looking For (LF) announces, Single community table discriminated by kind

### Community 116 - "Phone Verification"
Cohesion: 0.25
Nodes (8): app_setting.phone_gate_enabled flag, Exit paths stay ungated, Phone verification trade gate, src/lib/phoneGate.js and phoneVerify.js, Trade table phone-gate trigger, VerifyPhoneDialog.vue, Trade.meetup_location jsonb column, create/update/counter_trade_proposal RPCs

### Community 117 - "Discord Entitlement Sync"
Cohesion: 0.23
Nodes (9): pushGuildEntitlement(), syncEntitlements(), entitlementIsActive(), syncGuildEntitlement(), assert, { entitlementIsActive, syncGuildEntitlement }, run(), TARGET (+1 more)

### Community 118 - "Community Image Uploads"
Cohesion: 0.43
Nodes (5): onPickCover(), onPickImage(), mediaPath(), uploadCommunityMedia(), validateImageFile()

### Community 119 - "Index"
Cohesion: 0.25
Nodes (5): cors, EUROZONE, stripe, SWISS, TRIAL_DAYS

### Community 120 - "Index"
Cohesion: 0.32
Nodes (5): cors, domainMatches(), emailDomain(), siteHost(), STRICTNESS

### Community 121 - "Announces"
Cohesion: 0.39
Nodes (6): announce, announce_image, auth, auth.users, claim_community_announces(), trg_claim_community_announces

### Community 122 - "2026 07 19 Trade Meetup Location"
Cohesion: 0.29
Nodes (7): LocationPicker.vue, Trade Meetup Location feature, OTS locations loader and distance helpers, ProposeTradeDialog.vue, SSG-safe runtime data fetching, Claim-ready SEO pages, OTS seed script (seed-communities.mjs)

### Community 123 - "Email-code identity verification (Plan 1)"
Cohesion: 0.83
Nodes (4): claim_community RPC (instant free claim), Email-code identity verification (Plan 1), Stripe subscription claim gate (Plan 2), Verified Paid Store Claim design

### Community 124 - "Trade Event Timeline"
Cohesion: 0.33
Nodes (4): shownEvents, describeEvent(), EVENT_META, UNKNOWN

### Community 125 - "Community Event Mutations"
Cohesion: 0.43
Nodes (6): assertHttp(), createEvent(), MAX_DESC, MAX_TITLE, toRow(), updateEvent()

### Community 126 - "Complete Trade Photos Not A Gate"
Cohesion: 0.29
Nodes (6): received, public.complete_trade(), "Card", "Trade", trade_card, updated

### Community 127 - "Index"
Cohesion: 0.33
Nodes (4): cors, kindsOf(), strictestKind(), STRICTNESS

### Community 128 - "Index"
Cohesion: 0.33
Nodes (4): cors, kindsOf(), strictestKind(), STRICTNESS

### Community 129 - "Locked Cards"
Cohesion: 0.38
Nodes (6): create_locked_copies_on_accept(), delete_locked_copies_on_close(), "Card", trg_create_locked_copies, trg_delete_locked_copies, trade_item

### Community 130 - "Trader Favorites Trending"
Cohesion: 0.29
Nodes (6): get_trending_cards(), auth.users, "Card", "Trade", trade_card, trader_favorite

### Community 131 - "Trade Event Log"
Cohesion: 0.43
Nodes (6): fetch_trade_events(), log_trade_status_change(), auth.users, "Trade", trade_event, trade_status_audit

### Community 132 - "Discord Link"
Cohesion: 0.47
Nodes (5): auth.identities, on_auth_user_discord_sync, on_identity_discord_link, sync_discord_id_from_identity(), sync_discord_id_from_user()

### Community 133 - "Readme"
Cohesion: 0.33
Nodes (6): Remote Duel activity HTML shell, CLIENT_ACTIONS allowlist, shared/duelReducer.js (authoritative reducer), One Durable Object per instanceId, Remote Duel Discord Activity, WebSocket Hibernation API

### Community 134 - "Readme"
Cohesion: 0.33
Nodes (6): community_event_post table (announce ledger), 0nefor.one Discord Bot v2 (Premium), discord_pending_event_posts() function, Guild Subscription entitlements as source of truth, Verified checked at post time, not creation time, Ownership granted and revoked only by the Stripe webhook

### Community 135 - "Jsconfig"
Cohesion: 0.33
Nodes (5): compilerOptions, paths, exclude, dist, node_modules

### Community 136 - "Archetype Art"
Cohesion: 0.47
Nodes (5): __dirname, elect(), isElectableMonster(), main(), outArg

### Community 137 - "Sync Ots Data"
Cohesion: 0.33
Nodes (4): __dirname, FILES, outDir, repoData

### Community 138 - "Verify Beats"
Cohesion: 0.33
Nodes (5): beats, ORDER, props, srSummary, { t }

### Community 139 - "Auth Callback & Discord Resync"
Cohesion: 0.16
Nodes (11): history, loading, META, props, resyncDiscord(), destination(), route, router (+3 more)

### Community 140 - "Announce Chat"
Cohesion: 0.33
Nodes (5): public.announce_message, auth, auth.users, public, public.announce

### Community 141 - "Package"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 142 - "Seed Community Private"
Cohesion: 0.40
Nodes (3): __dirname, DRY, STORES

### Community 143 - "Trader Link"
Cohesion: 0.40
Nodes (4): linked, locale, props, route

### Community 144 - "Trending Cards Activity"
Cohesion: 0.40
Nodes (4): get_trending_cards(), "Card", "Trade", trade_card

### Community 145 - "Named Wishlists"
Cohesion: 0.40
Nodes (4): public.wishlist, auth, auth.users, public."Card"

### Community 146 - "Proposal Photo State"
Cohesion: 0.40
Nodes (4): public.fetch_my_proposals(), "Card", trade_card, trade_photo

### Community 147 - "2026 07 21 Looking For Announces"
Cohesion: 0.50
Nodes (4): AnnounceCard.vue, announceKind.js helpers, YGOPRODeck archetype matching, CreateAnnounceDialog.vue

### Community 148 - "2026 07 27 Verified Paid Claim Subscription"
Cohesion: 0.50
Nodes (4): stripe-webhook Edge Function, stripe_webhook_event dedupe table, Claim state machine (owner NULL until subscription active), Lapse policy (revert to unclaimed, keep content)

### Community 149 - "Landing Traders"
Cohesion: 0.50
Nodes (3): public."Trader", public.top_tradepile_traders(), public."Card"

### Community 150 - "Index"
Cohesion: 0.50
Nodes (3): ADMINS, cors, REQUIRED_CURRENCIES

### Community 152 - "Announce Want Card"
Cohesion: 0.50
Nodes (3): public.announce_want_card, public, public.announce

### Community 153 - "SSG Output Verification"
Cohesion: 0.20
Nodes (6): BODY_MARKERS, CONTENT_TYPES, __dirname, DIST, DIST_SITEMAP, ROUTES

### Community 155 - "Common"
Cohesion: 0.67
Nodes (3): Logger, get_logger(), Return a configured logger that prints to stdout. Using a plain stdout logger…

### Community 206 - "Deck Section Rows"
Cohesion: 0.24
Nodes (4): ignoredInSection(), isIgnored(), missingInSection(), setup()

### Community 207 - "Place Geocoding"
Cohesion: 0.38
Nodes (6): dedupe(), formatPlace(), geocodePlace(), MAX_RESULTS, MIN_QUERY, searchPlaces()

### Community 208 - "Pending Trade Hints"
Cohesion: 0.33
Nodes (6): confirmKey, waitKey, waitKey, acceptingBlind(), confirmHintKey(), pendingWaitKey()

### Community 209 - "Trade Proposal Mutations"
Cohesion: 0.31
Nodes (8): close(), emit, removePhoto(), submit(), counterTradeProposal(), createTradeProposal(), fetchTradeEvents(), updateTradeProposal()

### Community 210 - "Followed Communities"
Cohesion: 0.25
Nodes (7): loadFollowing(), locale, props, route, rows, { t }, fetchFollowing()

### Community 211 - "Notification Formatting"
Cohesion: 0.36
Nodes (6): emit, FALLBACK_META, NOTIF_META, notifMeta(), notifText(), timeAgo()

### Community 212 - "community table"
Cohesion: 0.33
Nodes (6): community_for_guild(guild_id) RPC, HMAC-signed tournament grant, Tournament mode (verified stores), community_report table, Community Section (directory + profiles + claim), community table

### Community 213 - "fetchDirectory"
Cohesion: 0.38
Nodes (5): load(), syncUrl(), fetchDirectory(), fromQueryParams(), toQueryParams()

### Community 214 - "Proposal Filters & History Split"
Cohesion: 0.62
Nodes (5): isCancelled(), isDone(), PROPOSAL_FILTERS, resolveFilter(), splitHistory()

### Community 215 - "isValidCode"
Cohesion: 0.47
Nodes (4): canVerify, canVerifyCode, deriveClaimState(), isValidCode()

### Community 216 - "Platform Icons"
Cohesion: 0.40
Nodes (5): meta, props, SVG_PATHS, svgPath, platformMeta()

### Community 217 - "Yu-Gi-Oh Icon Auto-Discovery (cardIcons.js)"
Cohesion: 0.40
Nodes (5): YGOPRODeck Card API, Card Image CDN Preconnect, Yu-Gi-Oh Icon Auto-Discovery (cardIcons.js), Missing dark.svg Attribute Icon, Case-Insensitive Normalized Filename Matching

### Community 218 - "fetchBySlug"
Cohesion: 0.40
Nodes (5): finalizeClaim(), load(), onGaveUp(), onStale(), fetchBySlug()

### Community 219 - "cancelTradeProposal"
Cohesion: 0.40
Nodes (5): doCancel(), onCancel(), doCancel(), onCancel(), cancelTradeProposal()

### Community 221 - "Q: Why do the Discord tournament gate, the Stripe claim gate, and the phone gate keep converging on the same shape without sharing any code?"
Cohesion: 0.50
Nodes (3): Answer, Q: Why do the Discord tournament gate, the Stripe claim gate, and the phone gate keep converging on the same shape without sharing any code?, Source Nodes

### Community 222 - "Q: How does the Discord bot entitlement branch work, and does it break the server-side-authority pattern?"
Cohesion: 0.50
Nodes (3): Answer, Q: How does the Discord bot entitlement branch work, and does it break the server-side-authority pattern?, Source Nodes

### Community 228 - "community_claim table"
Cohesion: 0.40
Nodes (5): /verify command (link guild to community), claim-request-code Edge Function, Manual-review fallback (no email on file), community_claim table, community_private table (RLS-hidden claim_email)

## Ambiguous Edges - Review These
- `Inline Community Profile Editing` → `data/stores.json`  [AMBIGUOUS]
  scrapers/README.md · relation: shares_data_with

## Knowledge Gaps
- **1222 isolated node(s):** `META`, `TABS`, `avatarInput`, `bannerInput`, `canonicalUrl` (+1217 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Inline Community Profile Editing` and `data/stores.json`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **Why does `getClient()` connect `getClient` to `Trade Detail Page`, `Account Page & My Communities`, `Announce Detail & Actions`, `Built-With & Trader Search`, `Community Claim Verification`, `Auth Callback & Discord Resync`, `Propose Trade Dialog`, `TradeCenter.vue`, `Phone Verification Flow`, `Card Library & Wishlists`, `BulkAddCards.vue`, `Decks List & Guest Migration`, `Onboarding Start Page`, `Card Detail Page`, `Community Claim Dialog & Edge Calls`, `Announce Messaging`, `Trade Photo Uploads`, `Proposal Row & Pending State`, `Trader Profile Tabs`, `Community Events`, `Community Follow`, `Notification Bell`, `Profile Card & Country/City`, `Deck Detail & Ignore List`, `Announce Kind Detection`, `User Menu Chip`, `Trade Chat Panel`, `Deck Import (YDK)`, `Onboarding Steps & Skip State`, `Domain Proof Verification`, `Trade Proposal Mutations`, `Followed Communities`, `fetchDirectory`, `Report Community Dialog`, `run`, `fetchBySlug`, `cancelTradeProposal`, `Nearby Geo Queries`, `Community CRUD & Slugs`, `Upcoming Events Row`, `Add Card Dialog`, `Community Image Uploads`, `Community Event Mutations`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `cardImage()` connect `Card Info Panel & Banlist Status` to `Deck Import (YDK)`, `Trade Detail Page`, `Proposal Row & Pending State`, `Trader Profile Tabs`, `Trader Cards & Matches Tab`, `Announce Detail & Actions`, `Want List Input`, `Add Card Dialog`, `Propose Trade Dialog`, `Archetype & Set Pages (JSON-LD)`, `Deck Section Rows`, `Combo Explorer`, `Card Binder Grid`, `BulkAddCards.vue`, `Card Library & Wishlists`, `Onboarding Start Page`, `Announce Card & Expiry`, `Card Detail Page`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `getCurrentSession()` connect `Card Detail Page` to `Community Profile Page`, `Community Directory & Filters`, `Admin Review Queue`, `Trader Page & Discord Sign-In`, `Community Claim Verification`, `Propose Trade Dialog`, `Auth Callback & Discord Resync`, `Trade Proposal Mutations`, `App Shell & Navigation`, `Onboarding Start Page`, `Community Claim Dialog & Edge Calls`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `cardImage()` (e.g. with `AddCard.vue` and `BulkAddCards.vue`) actually correct?**
  _`cardImage()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `META`, `TABS`, `avatarInput` to the rest of the system?**
  _1222 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community Profile Page` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._