# Prosjektbeskrivelse

> **Status: UTKAST (KI).** Skrevet av KI (Claude) i fase 14, 2026-10-27. Mål, avgrensning og leveranser er hentet fra
> veikartet og kravoversikten. **Bakgrunnen er teamets egen tekst og står tom.** Ikke gjennomgått av teamet.
> Offisielle APP2000-krav til rapporten er ikke verifisert.

## Bakgrunn

<!-- Teamet skriver: hvorfor dere valgte dette prosjektet. Påstander om matsvinn i Norge må ha en kilde dere har lest
(se kapittel 03). -->

## Mål

Målene slik de står i [kravoversikten](../development/requirements/00-kravoversikt.md) og
[veikartet](../development/roadmap.md):

1. En husholdning skal kunne se hva den har, hvor det står og når det går ut, med tydelig forskjell på *best før* og
   *siste forbruksdag* (FR-INV-001–008).
2. Kjøp skal kunne registreres én gang og gi både utgifter og varer i matlageret (FR-BUD-001–006, ADR-0007).
3. Appen skal foreslå middager ut fra det som finnes og det som snart går ut, og forklare hvorfor (FR-REC-001–006).
4. Det skal være raskt å få varer inn: handleliste, strekkode og kvittering (FR-SHOP, FR-SCAN, FR-RCPT).
5. Appen skal være sikker, tilgjengelig (mål: WCAG 2.2 AA) og fungere på telefon (NFR-SEC, NFR-UX).
6. Arbeidet skal kunne etterprøves: krav før kode, lagrede testresultater og en logg over KI-bruken (KURS-07–09,
   antatt).

Hvilke mål som er nådd, står i kapittel 17.

## Avgrensning

| Med | Ikke med |
|---|---|
| Webapp for telefon og PC | App i App Store eller Google Play |
| Lukket testmiljø med HTTPS (ADR-0015) | Produksjonsmiljø (ikke bestemt) |
| Varsler i appen (ADR-0019) | E-post, SMS og push |
| Oppskrifter importert fra Wikibooks og oversatt av KI (ADR-0016) | Oppskrifts-API mens appen kjører, og oppskrifter laget av KI fra bunnen |
| Priser fra Kassalapp som anslag (ADR-0020) | Skraping av nettbutikker (ADR-0010), priser fra Rema 1000, Kiwi og Coop |
| Kvitteringslesing på egen server, bare butikk, dato og total som standard (ADR-0017, foreslått) | Skytjenester for OCR |
| Innlogging med passord og valgfri tofaktor | Tilbakestilling av passord på e-post (FR-AUTH-006) |

## Leveranser

| Leveranse | Hvor |
|---|---|
| Kildekode | Privat repo på GitHub, én gren per fase (ADR-0013) |
| Testmiljø | `https://smartmat.risansolutions.no` (bak basic auth) |
| Krav og beslutninger | `docs/development/requirements/`, `docs/development/architecture-decisions/` |
| Testbevis | [`docs/evidence/`](../evidence/bevisoversikt.md) |
| Rapport | `docs/academic/` (dette dokumentet) |
| KI-erklæring | [vedlegg-ki-erklaering.md](vedlegg-ki-erklaering.md) |
| Presentasjon | [presentasjon.md](presentasjon.md) |

Formatet og fristen for innleveringen er ikke kjent per 2026-10-27.

## Kilder i prosjektet

- [Kravoversikt](../development/requirements/00-kravoversikt.md), [veikart](../development/roadmap.md)
- [ADR-0010](../development/architecture-decisions/0010-ingen-skraping-av-priser.md),
  [ADR-0015](../development/architecture-decisions/0015-lukket-testmiljo.md),
  [ADR-0016](../development/architecture-decisions/0016-oppskrifter-fra-apne-kilder.md),
  [ADR-0017](../development/architecture-decisions/0017-tesseract-pa-serveren-forelopig.md),
  [ADR-0019](../development/architecture-decisions/0019-varsler-beregnes-ved-lesing.md),
  [ADR-0020](../development/architecture-decisions/0020-priser-fra-kassalapp-som-anslag.md)
