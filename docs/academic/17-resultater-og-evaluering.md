# Resultater og evaluering

> **Status: UTKAST (KI).** Skrevet av KI (Claude) i fase 14, 2026-10-27. Bare påstander med bevis i repoet er tatt
> med, og hver har en lenke. **Teamets evaluering står tom.** Ikke gjennomgått av teamet. Offisielle APP2000-krav
> er ikke verifisert.

## Hvilke krav som er oppfylt

98 av 99 krav i [kravoversikten](../development/requirements/00-kravoversikt.md) er implementert. Det som mangler, er
FR-AUTH-006 (tilbakestilling av passord og e-postverifisering), fordi teamet ikke har en e-posttjeneste. Oversikten
per modul står i kapittel 05, og koblingen fra krav til tester i [vedlegg-sporbarhet.md](vedlegg-sporbarhet.md).

«Implementert» betyr at automatiske tester består. Flere krav er bare oppfylt med forbehold:

| Krav | Forbehold |
|---|---|
| FR-SCAN-002 (produktinfo fra strekkode) | Oppslag hos Open Food Facts er av til teamet har valgt kontaktadresse |
| FR-PRICE-001, 003, 004 (eksterne priser) | Av uten nøkkel til Kassalapp. Bare testet mot et falskt Kassalapp med oppdiktede priser |
| FR-RCPT-004 (tolke kvitteringen) | Målt på 3 kvitteringer. Linjer foreslås ikke som standard (ADR-0017, ikke godkjent) |
| FR-REC-001–006 (oppskrifter) | De 27 oppskriftene og allergenene er oversatt og anslått av KI, ikke kontrollert |
| FR-PRIV-003 (personvernerklæring) | Utkast. Kontaktadressen og behandlingsgrunnlaget for allergier mangler |
| NFR-UX-002, NFR-UX-005 (WCAG 2.2 AA) | Testet automatisk og ved lesing av koden. Ikke med skjermleser eller av mennesker |

## Brukervennlighet

**Ikke evaluert med brukere.** Det som finnes, er automatiske kontroller:

- axe på alle sider i lyst og mørkt tema, på 360 px og 1280 px, uten funn i siste kjøring (209 bestått, 7
  hoppet over, [`07-e2e.txt`, fase 13](../evidence/test-results/fase-13/07-e2e.txt))
- tastaturgang gjennom hvert tabulatorstopp, 200 % zoom, 320 px, tekstavstand og redusert bevegelse
  (`e2e/a11y.spec.ts`)
- KI-ens vurdering av WCAG 2.2 AA kriterium for kriterium, der seks kriterier helt eller delvis må vurderes av
  mennesker (1.3.1, 1.3.2, 2.1.1, 2.4.3, 2.4.6 og 3.1.2) ([tilgjengelighet.md](../development/testing/tilgjengelighet.md))

## Ytelse

| Måling | Resultat | Bevis |
|---|---|---|
| Hovedfil i bygget | 881 kB → 608 kB (gzip 265 → 192 kB) etter kodedeling | [før](../evidence/test-results/fase-13/20-bundle-before.txt), [etter](../evidence/test-results/fase-13/20-bundle-after.txt) |
| Svinnoversikt, 501 husholdninger | Median 9,8 ms, p95 11,9 ms gjennom appen | [`21-perf-explain-after.txt`](../evidence/test-results/fase-13/21-perf-explain-after.txt) |
| Varsler | Median 8,2 ms, p95 13,4 ms | samme fil |
| Oppskriftsrangering | Median 31,0 ms, p95 38,1 ms | samme fil |
| Prisanslag på handlelisten | Median 20,9 ms, p95 28,7 ms | samme fil |

Målt på utviklingsserveren mens andre prosjekter kjørte. Det sier ingenting om hvordan appen oppleves på en telefon
over mobilnett. Det er ikke målt.

## Sikkerhet

| Hva | Resultat | Bevis |
|---|---|---|
| Sårbarheter i avhengigheter | `npm audit`: 0 i hver fase | `08-npm-audit.txt` i hver fasemappe |
| Tilgang til andres husholdning | API-tester per modul, og mutasjonskontroll som slår av sjekken | Kapittel 11 og 12 |
| Mutasjonskontroll, siste kjøring | Alle fanget unntatt tre runder som er forklart (fase 3, 8 og 13), og én avhengig av timing (fase 10) | [Bevisoversikt](../evidence/bevisoversikt.md#mutasjonskontroll) |
| Sikkerhetskopi | 21 av 21 sjekker, nattlig kopi i testmiljøet med status `ok` | [`23`](../evidence/test-results/fase-13/23-backup-test.txt), [`24`](../evidence/test-results/fase-13/24-backup-staging.txt) |
| Testmiljøet | Basic auth, HTTPS, sikkerhetshoder, `noindex`, IPv4 og IPv6 | [`26-caddy-https.txt`](../evidence/test-results/fase-13/26-caddy-https.txt) |

Ingen ekstern sikkerhetstest er gjort, og ingen med kompetanse på personvern har vurdert kapittel 12.
Tofaktorinnloggingen er skrevet av KI uten bibliotek og bør gjennomgås særlig nøye.

## Kjente begrensninger

Den fullstendige listen over det som ikke er testet, står i
[bevisoversikten](../evidence/bevisoversikt.md#det-som-ikke-er-testet). Det viktigste:

1. Ingen brukertester, ingen test på ekte telefon, ingen skjermleser.
2. Ingen registrert kodegjennomgang med funn, og ingen pull request er merget.
3. Innhold skrevet av KI er ikke kontrollert (oppskrifter, ingredienser, kategorier).
4. Kvitteringslesingen er målt på for få kvitteringer.
5. Bare Chromium er testet.

## Teamets evaluering

<!-- Teamet skriver: Svarer appen på problemstillingen i kapittel 02? Hva er dere fornøyde med, og hva ikke? Hvordan
vurderer dere resultatet når KI har skrevet koden? -->

## Kilder i prosjektet

- [Bevisoversikt](../evidence/bevisoversikt.md), [sporbarhet](vedlegg-sporbarhet.md),
  [tilgjengelighet](../development/testing/tilgjengelighet.md)
- Kapittel 05, 11 og 12
