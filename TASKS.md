# Current work

- [x] Fix the demo's explicit zero-blur group override; add a rendering regression test at DPR 1 and 2.
- [ ] Redesign documentation in `edinstvo-glass-site`, branch `Dev`, using Makar's three references and real elements from this glass package. On 10 November 2026 Makar explicitly requested changes to composition, placement and animation, superseding the earlier fixed-layout constraint. Keep compact Martian Mono typography. Ask about uncertain visual decisions before implementation. The previous editor-style design was rejected; passing layout checks does not complete this task.
- [x] Document the shared merged material and correct double-escaped API examples in both languages.
- [x] Recheck adaptation transitions, merged edges and partially visible surfaces: 32 browser checks pass at DPR 1 and 2.
- [ ] Show the revised design to Makar. Visual acceptance remains pending.
- [x] Publish 1.1.4 at Makar's request. Merged into main and published through GitHub Actions on 11 November 2026. Safari 27.2 CI failures remain open and are documented in the changelog and audit.
- [ ] Investigate Safari 27.2 CI backdrop/layer failures and uninitialized merge canvas; retain the failing checks.

Commit each completed change separately. Do not publish the landing page. Do not add 3D rendering.
