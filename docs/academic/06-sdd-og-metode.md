# SDD og metode

> **Status: UTKAST (KI).** Skrevet av KI (Claude) i fase 14, 2026-10-27, fra CLAUDE.md, veikartet, KI-loggen og
> utviklingsloggen. Beskriver metoden slik den faktisk ble brukt. **Teamets vurdering av metoden står tom.** Ikke
> gjennomgått av teamet. Offisielle APP2000-krav er ikke verifisert.

## Spesifikasjonsdrevet utvikling i praksis

I SmartMat betydde SDD at ingenting ble kodet før det var skrevet ned hva som skulle lages, og hvordan det skulle
sjekkes. For hver fase:

1. **Plan:** Ferdinand Risan limte inn en prompt i en ny chat (malen står i
   [fase-oppstart.md](../development/fase-oppstart.md), og ble mer detaljert for hver fase). KI-assistenten leste
   CLAUDE.md, veikartet, ADR-ene, kravene og utviklingsloggen, og svarte med en fast mal: mål, nåværende tilstand,
   krav, forslag, filer, avhengigheter, sikkerhet, tester, dokumentasjon, risikoer og åpne spørsmål.
2. **Godkjenning:** Ferdinand godkjente planen i chatten. Det ble registrert ordrett i KI-loggen og
   utviklingsloggen.
3. **Spesifikasjon:** KI skrev fasespesifikasjonen (`docs/development/requirements/NN-*.md`) med krav-ID-er og
   akseptansekriterier, og ADR-er for nye beslutninger, **før** koden.
4. **Implementering og test:** KI skrev koden og testene. Testene nevner krav-ID-ene.
5. **Bevis:** byggetrinnene og testene ble kjørt, og utdataene lagret ordrett i `docs/evidence/test-results/fase-N/`,
   også feilede forsøk. Fra fase 2 ble testene selv kontrollert ved å slå av beskyttelser i koden med vilje
   (mutasjonskontroll).
6. **Dokumentasjon:** veikart, endringslogg, utviklingslogg, KI-logg og berørte kapitler ble oppdatert.
7. **Git:** én gren per fase, commit og push bare når Ferdinand ba om det (ADR-0013).

## Fasemodellen

| Fase | Innhold | Dato |
|---|---|---|
| 0 | Planlegging: ADR-er, krav, datamodell | 2026-10-19 |
| 1 | Designsystem og app-skall | 2026-10-20 |
| 2 | Database og innlogging | 2026-10-20 |
| 3 | Matlager | 2026-10-21 |
| 4 | Kjøp og budsjett | 2026-10-21 |
| 5 | Oppskrifter | 2026-10-21 |
| 6 | Handleliste | 2026-10-21 |
| 7 | Strekkode og testmiljø | 2026-10-21/22 |
| 8 | Kvitterings-OCR | 2026-10-24 |
| 9 | Oppskrifter fra åpne kilder og måltidsplan | 2026-10-24 |
| 10 | Delte husholdninger | 2026-10-24/25 |
| 11 | Svinnstatistikk og varsler | 2026-10-25 |
| 12 | Priser | 2026-10-25 |
| 13 | Sikkerhet, personvern, backup, hosting, ytelse, tilgjengelighet | 2026-10-25/27 |
| 14 | Akademisk ferdigstilling | 2026-10-27– |

Hver fase ble kjørt i en egen chat, slik at KI-assistenten ikke hadde noe minne fra forrige fase. Det som skulle
videre, måtte stå i repoet: CLAUDE.md (regler og fallgruver, utvidet for hver fase), veikartet og utviklingsloggen.

## Arbeidsflyt med KI

- **Verktøy:** Claude Code (VS Code-utvidelsen) med modellen Claude Opus 5.5, på en server som også kjører andre
  nettsteder. KI-assistenten kunne lese og skrive filer, kjøre kommandoer og bruke Git og Docker.
- **Hvem gjorde hva:** KI skrev planene, spesifikasjonene, koden, testene og dokumentasjonen. Ferdinand skrev
  promptene, tok beslutningene og godkjente planene. Linus Saxe Huseby har ikke vært med i øktene. Detaljer i
  kapittel 13 og 15.
- **Faste regler i CLAUDE.md:** ingen oppdiktede datoer, møter, tester, kilder eller forfattere, ingen påstand om at
  noe er gjennomgått uten at det har skjedd i samtalen, og alt KI har gjort skal stå i KI-loggen.
- **Sikkerhetssperrer i verktøyet** stoppet KI-en to ganger i fase 13 (kapittel 13).

## Definition of Done

Fra [veikartet](../development/roadmap.md): en funksjon er ferdig når kravene er dokumentert, koden er implementert,
bygg og typesjekk er grønne, relevante tester er kjørt og bestått med lagret utdata, autorisasjon og validering er
verifisert på serveren, feil- og tomtilstander virker, mobilvisning er sjekket, dokumentasjonen er oppdatert, **og
studentenes gjennomgang er registrert**.

**Ingen fase oppfyller Definition of Done per 2026-10-27.** Alt annet er gjort for fase 1–13, men den siste delen
mangler: ingen kodegjennomgang med funn er registrert, og ingen pull request er merget. Ferdinand har oppgitt
gjennomganger «i plenum» for noen faser, uten omfang eller funn. Derfor står fase 1–13 som «Pågår» i veikartet.

## Teamets vurdering av metoden

<!-- Teamet skriver: Hvordan var det å jobbe slik? Hva fungerte med SDD og KI, og hva ikke? Fikk dere den
kontrollen dere ønsket, eller gikk det for fort til å gjennomgå? Hva ville dere gjort annerledes? -->

## Kilder i prosjektet

- [CLAUDE.md](../../CLAUDE.md), [veikart](../development/roadmap.md), [fase-oppstart.md](../development/fase-oppstart.md)
- [Utviklingslogg](../development/development-journal.md), [KI-logg](../evidence/ai-usage/ai-logg.md)
- [ADR-0013](../development/architecture-decisions/0013-git-og-github.md)
