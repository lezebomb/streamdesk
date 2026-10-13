# Design QA — StreamDesk 0.4.1

final result: passed

Scope: existing production PWA, mobile visual layout and desktop responsiveness. This is a visual / interaction gate, not a claim that disconnected phone hardware or an undiscovered TV has passed.

## Visual truth and evidence

- User supplied sketch: home / my information architecture; original attachment retained locally.
- User supplied catalog reference: 1005×2048 px; original attachment retained locally.
- Initial catalog capture: reports/evidence/ui-0.4-mobile-filter-final.jpg, 376×813 px, before density correction. Source and this capture were opened together in one comparison input.
- Revised catalog capture: reports/evidence/ui-0.4-mobile-filter-compact.jpg, 390×844 px; browser CSS viewport approximately 390×845, one-pixel rounding. Source normalized conceptually by 390/1005; the reference places the first poster at about 297 CSS px, revised implementation at about 300 CSS px. Same state: 剧集, four filter rows, all values, three poster columns. Sort controls follow the user's newer 最新 / 高分 instruction.
- Desktop: reports/evidence/ui-0.4-desktop-final.jpg, 1295×899 px; reports/evidence/ui-0.4-my-desktop.jpg, 1309×909 px. Requested desktop surface 1440×1000; existing browser zoom / ratio 1.1 yields a CSS viewport around 1309×909. Compare content proportions rather than raw pixel equality. Browser zoom was not changed.
- Native desktop My capture: reports/evidence/ui-0.4-my-native.png, 1440×1000 physical pixels. The native screenshot call was unusually slow; ordinary browser captures were used for the remaining checks.
- Loading and search: reports/evidence/ui-0.4-searching.png and ui-0.4-season-results.png, actual 怪奇物语3 query. The browser screenshot API encoded JPEG despite these early .png filenames; viewers detect the actual format. Later evidence uses .jpg correctly.
- Real phone evidence: reports/runs/mobile-0.4. It records pre-fix gesture failures, not a post-fix pass.

## Findings and repair history

- [P2, fixed] Excess vertical space pushed the first poster row down to about 354 px at a narrow viewport, while the normalized reference starts near 287–297 px. Removed the repeated category heading, reduced mobile top padding, header / tab gaps, chip height and bottom navigation height. Revised capture shows matching first-row position and a third-row peek.
- [P2, fixed] Filter scrollbars and persistent page scrollbar distracted from the reference on small viewports. Added both standard scrollbar-width and WebKit rules. Horizontal and vertical scrolling remain enabled; overflow checks and native scroll widths confirm the filters still scroll.
- [P2, fixed] A search without visible activity was ambiguous. Added actual Phosphor spinner glyphs, search aria-busy state and 搜索中 text until the complete / error boundary. Slow source rows keep their already-rendered results.
- [P2, fixed] Source future years and repeated diagnostic UI contradicted the brief. Future dates / years are validated, invalid years use 年份待核实, and tests / source controls / diagnostic DOM are excluded from the consumer interface. Selected chips and navigation now expose aria-pressed; focus outlines remain visible inside scroll rows.

## Required fidelity surfaces

- Typography: system sans stack (Segoe UI / Microsoft YaHei) matches the Chinese sans style. Selected headings use 600–650 weight; poster names remain single-line with ellipsis, full text remains accessible. Secondary year / progress text is intentional functional content.
- Spacing and layout: rounded search, tab row, four non-sticky horizontal chip rows and tall three-column posters follow the reference. Desktop uses six columns, tablet four. Bottom navigation contains 首页 / 我的 only. Search is hidden in the watch view. App padding leaves room to scroll the final cards fully above the fixed bottom navigation.
- Colors: pale background, teal text and cyan selected chips follow the reference palette. Flat surfaces replace the decorative background gradient to satisfy the user's simpler design request. Muted text and navigation colors were darkened for readability.
- Images and icons: actual source poster assets are used, with 2:3 slots and object-fit cover. Titles / release data are live and intentionally differ from the sample screenshot. No AI-generated movie posters, custom icon drawings or invented test-film art were substituted. Phosphor glyphs and the upstream MIT license are preserved.
- Copy and information architecture: home, recommendation / film / series / anime / variety tabs, four filters, a single recent item above recent recommendations, complete history via 更多, My history / downloads / favorites. No topic / ranking / source-management / performance pages in ordinary navigation. 最新 / 高分 and two bottom entries take precedence over the reference screenshot's older labels and four-entry navigation.

## Interaction evidence

Actual browser search finds 第三季 from 怪奇物语3, displays a spinner, then removes the loading state. Actual catalog filters / scrolling, My navigation and watch view were inspected in the in-app browser. Console error log inspection returned no entries for the final state. Automated real-browser tests independently passed persistence, progress-preserving source switching, synthetic HTTP 404 recovery to actual media, no horizontal overflow, offline shell, complete HLS download and offline decoded playback.

Focused region inspection covered the readable header / chip labels, poster captions, loading icon and two-item navigation in the combined source / mobile comparison; these were sufficiently large in the 390 px capture, so no separate edited raster crops were needed. Physical phone / TV verification remains outside this visual pass.

## Follow-up polish and limits

[P3] Some very recent source entries provide a placeholder poster rather than real key art. Do not invent a poster; a future metadata merge can replace it with a verified poster for the same work. Source metadata and supplied Douban scores can be inaccurate and are not presented as live official verification. The post-fix Mate 60 gestures and real TV playback remain pending, as recorded in the performance report.

## Implementation checklist

Passed: mobile composition, desktop / tablet breakpoints, selected / loading / empty states, source fixtures hidden in consumer UI, keyboard focus and selected semantics, responsive scrolling, all core runtime checks. Preserve the local preview for the user.

0.4.1 只修正“更早”的年份边界；视觉布局与上述 0.4.0 证据相同，边界由新增单元检查验证。final result: passed

## 0.5.0 focused regression

Existing visual layout preserved. Selected bottom navigation now uses a solid teal background, white icon / text and stronger weight on both viewport sizes. Multi-select genre chips retain selected states and toggle off. Loading rows append stable cards; 48 default category cards, 18 recommendation cards. Reports/runs/iteration-0.5-index captures desktop filters / search and mobile-width My. Native keyboard controls passed during real source playback; cloud owner login / writes independently verified. Phone follow-up is recorded below; receiver playback remains pending.

## Mate 60 follow-up, 2026-10-13

Real Huawei Browser 17 / Chromium 132, 375 CSS px: three-column catalog with 48 results, no horizontal page overflow, no visible filter scrollbars, correct current-year labels, multi-select genre intersection / toggle and solid selected navigation passed. Actual requested-season and anime-alias search showed spinner / status. Actual mobile double tap, right hold / release / cancel, and application container fullscreen gestures passed. User desktop favorites arrived on phone; phone history appeared in the existing logged-in Edge tab. New sustained Ruyi anime sample: 604.55 seconds, no stalls / drops. Earlier TV post-seek waiting and first ABR timeout stay documented; this does not imply every playback path was flawless. See reports/mobile-0.5.md and docs/validation-mobile-0.5.md. No new UI design, APK, system changes or TV playback claim.
