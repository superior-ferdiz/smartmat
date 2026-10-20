# KI-logg

Logg over vesentlige KI-bidrag i SmartMat. Små autofullføringer logges ikke.
Feltet *Menneskelig gjennomgang* fylles bare ut med det som faktisk ble gjort.

| # | Dato | Verktøy / modell | Oppgave | Prompt (sammendrag) | Resultat | Menneskelig gjennomgang | Endringer gjort av studentene | Verifisering | Utfall |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-19 | Claude Code (VS Code-utvidelse), Claude Opus 5.5 | Analyse og prosjektplan | Ferdinands produktprompt for SmartMat: analyser miljø og krav, lag plan, vent på godkjenning | Miljøkartlegging, forslag til stack, MVP, risikoer, datamodell, milepæler, 8 åpne spørsmål | Ferdinand svarte på spørsmålene og godkjente planen overordnet | Rettet teamsammensetning; valgte å utsette Git og hosting, og å ikke legge inn kursdokumenter | Ingen kode – ikke relevant | Plan godkjent |
| 2 | 2026-10-19 | Claude Code, Claude Opus 5.5 | Fase 0-dokumentasjon | Lag struktur, CLAUDE.md, veikart, ADR-er, datamodell, krav og maler | Filene i `docs/` og `CLAUDE.md` | **Ikke gjennomgått ennå** | Ingen ennå | Ingen kode – ikke relevant | Venter på gjennomgang |
| 3 | 2026-10-20 | Claude Code (VS Code-utvidelse), Claude Opus 5.5 | Fase 1-plan | Ferdinands fase 1-prompt: les dokumentasjonen, svar med fasemalen og forslag til palett/typografi, vent på godkjenning | Fasemal med palett (kontrast utregnet), typografi, 9 seksjoner, avhengigheter, testplan, 5 åpne spørsmål | Ferdinand godkjente planen («All good») | Ingen | Kontrastverdiene ble regnet ut med et skript | Plan godkjent |
| 4 | 2026-10-20 | Claude Code, Claude Opus 5.5 | Fase 1-implementering | Implementer den godkjente planen | Monorepo, designsystem, app-skall, grunnkomponenter, i18n, øre-hjelpere, 233 enhetstester, 63 Playwright-tester, skjermbilder, oppdatert dokumentasjon (kap. 9–11) | **Ikke gjennomgått ennå** | Ingen ennå | Typesjekk, lint, enhetstester, bygg, e2e og `npm audit` faktisk kjørt. Utdata i `docs/evidence/test-results/fase-1/` | Venter på gjennomgang |
| 5 | 2026-10-20 | Claude Code, Claude Opus 5.5 | Innføring av Git | Ferdinand: «hva må jeg gjøre for at vi kan bruke git?», deretter repo-adressen | ADR-0013, oppdatert CLAUDE.md/ADR-0012, `git init`, første commit og push | Ferdinand opprettet repoet selv. Innholdet i ADR-0013 er ikke gjennomgått | Ingen | `git status` før commit, `git ls-remote` etter push | Utført |
