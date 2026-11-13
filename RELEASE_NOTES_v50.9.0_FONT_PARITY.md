# Gifted Brainz Assessment Hub v50.9.0 — shared EduSpace font

- The Assessment Hub now loads the same **Plus Jakarta Sans** family used by EduSpace v12.12/v12.13, with system-font fallbacks.
- New `unified-typography.css` loads after the existing styles, preserving the previous contrast fixes, white result/review controls, green channel buttons, CBT design and account-linking flow.
- The typography stylesheet reduces large headings on phone widths and retains 16px input controls to avoid iOS autofocus zoom.
- KaTeX mathematics and monospace content keep their dedicated fonts.
- No font files are bundled. Google Fonts is requested only when internet access permits; otherwise the system-font fallback is used.

Deploy this project separately from EduSpace and confirm old cached CSS is refreshed. No database migration is introduced in this font-only Hub update. The previously required EduSpace device-link migration must already be installed for cross-app linking.
