# Kravspesifikasjon

> **Status: UTKAST (KI).** Skrevet av KI (Claude) i fase 14, 2026-10-27, som en sammenstilling av
> kravoversikten, de 13 fasespesifikasjonene og sporbarhetsmatrisen. Kravene og kriteriene er også skrevet av KI og
> godkjent av Ferdinand Risan som en del av hver faseplan. Ikke gjennomgått av teamet som helhet. Offisielle
> APP2000-krav er ikke verifisert. Kravene til kurset (KURS-*) er antatt.

## Hvordan kravene er organisert

| Nivå | Hvor | Hva |
|---|---|---|
| Oversikt | [00-kravoversikt.md](../development/requirements/00-kravoversikt.md) | 99 krav med ID, prioritet og fase |
| Fasespesifikasjon | `docs/development/requirements/01–13` | Akseptansekriterier for hvert krav, avgjørelser ved godkjenning, avvik under implementeringen, sporbarhet til tester |
| Beslutninger | [ADR-0001–0022](../development/architecture-decisions/README.md) | Hvorfor kravet er løst slik |

Kravene har faste ID-er (`FR-<modul>-<nr>` for funksjonelle, `NFR-<tema>-<nr>` for ikke-funksjonelle). Testene
nevner ID-ene i navnet, slik at et krav kan følges fra spesifikasjon til test og til lagret testresultat.

## Funksjonelle krav

| Modul | Krav | Prioritet | Fase | Status (2026-10-27) |
|---|---|---|---|---|
| Konto og innlogging | FR-AUTH-001–005, 008–010 | M / K | 2, 13 | Implementert |
| Tilbakestilling av passord, e-postverifisering | FR-AUTH-006 | K | – | **Ikke laget** (krever e-posttjeneste) |
| Matlager og forside | FR-INV-001–008, FR-DASH-001 | M / B | 3–5 | Implementert |
| Kjøp og budsjett | FR-BUD-001–006 | M / K | 4, 13 | Implementert |
| Oppskrifter | FR-REC-001–006 | B | 5, 9 | Implementert. De 27 oppskriftene er ikke kontrollert av teamet. |
| Handleliste | FR-SHOP-001–003 | B | 6 | Implementert |
| Strekkode | FR-SCAN-001–005 | B | 7 | Implementert. Oppslag hos Open Food Facts er av uten kontaktadresse. |
| Kvittering | FR-RCPT-001–008 | K | 8 | Implementert, eksperimentell (ADR-0017 ikke godkjent) |
| Måltidsplan | FR-PLAN-001–005 | K | 9 | Implementert |
| Husholdning | FR-HH-001–007 | K | 10 | Implementert |
| Svinn og varsler | FR-WASTE-001–005, FR-NOTIF-001–006 | K | 11 | Implementert |
| Priser | FR-PRICE-001–006 | K | 12 | Implementert, men av uten nøkkel til Kassalapp |
| Personvern | FR-PRIV-001–003 | K | 13 | Implementert. Kontaktadressen i personvernerklæringen mangler. |

«Implementert» betyr at koden finnes og at automatiske tester består (se [bevisoversikten](../evidence/bevisoversikt.md)).
Det betyr ikke at teamet har gjennomgått koden, eller at kravet er testet på en ekte telefon.

## Ikke-funksjonelle krav

| Tema | Krav | Hvordan det er kontrollert |
|---|---|---|
| Sikkerhet | NFR-SEC-001–004, 006–008 | API-tester mot database, egne sikkerhetstester per fase, mutasjonskontroll (kapittel 11 og 12) |
| Data | NFR-DATA-001–002 | Heltall i øre og grunnenheter (ADR-0006), idempotente opprettelser |
| Brukervennlighet | NFR-UX-001–005 | axe og Playwright på 360 px og 1280 px, `a11y.spec.ts`. **Ikke** testet med skjermleser eller brukere. |
| Pålitelighet | NFR-REL-001–002 | Tester med eksterne tjenester som er nede eller av |
| Drift | NFR-OPS-001–004 | Backup-skriptene (21 sjekker), kontroll av testmiljøet med `curl` |
| Ytelse | NFR-PERF-001 | `perf:explain` med genererte data (501 husholdninger), måling av bygget |

## Akseptansekriterier

Kriteriene står i fasespesifikasjonene, under hvert krav. Et eksempel fra [spesifikasjon 09](../development/requirements/09-maltidsplan.md)
(FR-PLAN-002): mengden regnes som `ceil(mengde × porsjoner / oppskriftens porsjoner)` med heltall, og rundes opp så man
ikke handler for lite.

## Sporbarhet

Matrisen fra krav til testfiler er laget med et skript og står i [vedlegg-sporbarhet.md](vedlegg-sporbarhet.md).
92 av 99 krav nevnes av minst én testfil. Av de sju som ikke gjør det, er ett ikke laget (FR-AUTH-006), tre er testet
uten at ID-en står i testen, to er testet med et skallskript, og ett er kontrollert for hånd (forklart i vedlegget).

## Kursrelaterte krav (antatt)

KURS-01–09 i kravoversikten er **antatt** ut fra beskrivelsen av Arbeidskrav 1 i teamets prompt. De offisielle
kravene til APP2000 er ikke lagt inn i prosjektet. Før innleveringen bør teamet sjekke dem mot de offisielle kravene.

## Kilder i prosjektet

- [Kravoversikt](../development/requirements/00-kravoversikt.md) og spesifikasjon 01–13
- [Sporbarhet](vedlegg-sporbarhet.md), [bevisoversikt](../evidence/bevisoversikt.md)
