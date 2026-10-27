# Innleveringsrapport

> **Status: UTKAST (KI) – venter på format og frist.** Innholdsfortegnelse og status laget av KI (Claude) i fase 14,
> 2026-10-27. Den endelige sammenstillingen gjøres når teamet kjenner kravene til format, sideantall og frist.
> Offisielle APP2000-krav til innleveringen er ikke lagt inn i prosjektet. Det som står under, er **antatt**.

## Antatte krav (ikke verifisert)

- Én samlet rapport (PDF eller Word) med kapitlene under
- En erklæring om bruk av KI
- En presentasjon med demo
- Kildeliste i én stil (anbefalt: APA 7, ikke bestemt av teamet)

## Kapitler og status

«KI» = utkast av KI-assistenten, ikke godkjent. «Teamet» = teamets egen tekst mangler.

| Kap. | Tittel | Status 2026-10-27 | Hva som mangler |
|---|---|---|---|
| 00 | [Prosjektoversikt](00-prosjektoversikt.md) | KI | Målgruppe og forventet verdi (teamet) |
| 01 | [Prosjektbeskrivelse](01-prosjektbeskrivelse.md) | KI | Bakgrunn (teamet) |
| 02 | [Problemstilling og målgruppe](02-problemstilling-og-malgruppe.md) | Mal | **Hele kapittelet (teamet)** |
| 03 | [Behovsanalyse](03-behovsanalyse.md) | Mal | **Hele kapittelet, med kilder (teamet)** |
| 04 | [Brukerhistorier](04-brukerhistorier.md) | KI | Godkjenning |
| 05 | [Kravspesifikasjon](05-kravspesifikasjon.md) | KI | Godkjenning, sjekk mot offisielle krav |
| 06 | [SDD og metode](06-sdd-og-metode.md) | KI | Teamets vurdering av metoden |
| 07 | [Systemarkitektur](07-systemarkitektur.md) | KI, kontrollert mot koden 2026-10-27 | Gjennomgang |
| 08 | [Databasemodell](08-databasemodell.md) | KI, kontrollert mot koden 2026-10-27 | Gjennomgang |
| 09 | [Design og brukervennlighet](09-design-og-brukervennlighet.md) | KI, kontrollert mot koden 2026-10-27 | Gjennomgang, brukervennlighet slik dere opplever den |
| 10 | [Teknisk implementering](10-teknisk-implementering.md) | KI, kontrollert mot koden 2026-10-27 | Gjennomgang |
| 11 | [Testing og testresultater](11-testing-og-testresultater.md) | KI, kontrollert mot bevisene 2026-10-27 | Gjennomgang |
| 12 | [Sikkerhet og personvern](12-sikkerhet-og-personvern.md) | KI, kontrollert mot koden 2026-10-27, **ingen juridisk vurdering** | Gjennomgang, særlig tofaktor og art. 9 |
| 13 | [KI-bruk og kritisk refleksjon](13-ki-bruk-og-kritisk-refleksjon.md) | KI + mal | **Den kritiske refleksjonen (teamet)** |
| 14 | [Prosjektgjennomføring](14-prosjektgjennomforing.md) | KI | Teamets vurdering |
| 15 | [Gruppearbeid og ansvarsfordeling](15-gruppearbeid-og-ansvarsfordeling.md) | Mal + fakta | **Fordeling, samarbeid og ansvarsregister (teamet)** |
| 16 | [Utfordringer og løsninger](16-utfordringer-og-losninger.md) | KI | Det som var vanskelig for teamet |
| 17 | [Resultater og evaluering](17-resultater-og-evaluering.md) | KI | Teamets evaluering |
| 18 | [Refleksjon og videreutvikling](18-refleksjon-og-videreutvikling.md) | Mal | **Hele kapittelet (teamet)** |
| 19 | [Kildeliste](19-kildeliste.md) | KI | Kontroll av kildene, egne kilder |
| – | [Vedlegg: KI-erklæring](vedlegg-ki-erklaering.md) | KI-utkast | **Teamet må lese, rette og stå inne for den** |
| – | [Vedlegg: sporbarhet](vedlegg-sporbarhet.md) | KI, generert | – |
| – | [Presentasjon](presentasjon.md) | KI-forslag | Valg av disposisjon og hvem som viser hva |

«Kontrollert mot koden» betyr at KI i fase 14 har sjekket at alle filstier og kodenavn i kapittelet finnes i repoet,
at tallene stemmer med de lagrede utdataene, og rettet det som var utdatert (se utviklingsloggen for fase 14). Det
betyr ikke at hver setning er lest på nytt mot koden, og ikke at teamet har godkjent kapittelet.

## Bevis

- [Bevisoversikt](../evidence/bevisoversikt.md): testresultater, mutasjonskontroll, målinger og skjermbilder per fase,
  og hva som ikke er testet
- [KI-logg](../evidence/ai-usage/ai-logg.md)
- [Utviklingslogg](../development/development-journal.md)

## Sammenstilling

Kapitlene er skrevet i Markdown. Når formatet er kjent, kan de settes sammen til ett dokument (for eksempel med
pandoc til PDF eller Word). Det er ikke installert eller prøvd. Mermaid-diagrammene i kapittel 07 må da gjøres om til
bilder.
