# Gifted Brainz Assessment Hub v50.3.0 — Shared visuals

- Added **the exact same graphic asset files** from Gifted Brainz EduSpace v12.6.0: brand logos, 24 avatars, 24 team crests, and five subject-specific cover illustrations.
- Updated existing logo asset reference to use EduSpace's brand artwork and retained an archived old asset.
- Added `brand-shared.css` to refine entry, quiz and results card styling using the matching navy, gold and white design language.
- Student CBT introduction now chooses relevant subject illustration based on subject or quiz title (Chemistry, Mathematics, Physics, Biology and English, with fallback).
- Existing Question Bank, 1,000-document-question extraction and standalone **Brainz Biltz** are unchanged.

## Important separation
Hub's existing device-code private library access is not automatically connected to EduSpace's Free/Activated accounts. This release aligns appearance only, while EduSpace v12.6.0 implements the separate Public/Premium content spaces in its authenticated student portal. A future secure account identity/token integration will be needed for automatic account-tier recognition in both platforms.

No database changes or new SQL migrations are introduced in this visual release. Any earlier Brainz Biltz migrations remain necessary when not previously applied.
