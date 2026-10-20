# ADR-0007: Kjøp (Purchase) som eneste kilde til utgifter

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Samme handel kan komme inn via manuell registrering, kvittering og strekkode. Hvis kvittering, transaksjon og budsjett lagres hver for seg, kan samme utgift telles to ganger.

## Beslutning
I MVP finnes ingen separat transaksjonstabell. Et `Purchase` (én handletur) med `PurchaseLine`-linjer er den eneste
kilden. Budsjett og statistikk beregnes fra kjøpene. Kvitteringsimport får en `dedupe_key` med unik begrensning.
Bekreftelse av et kjøp (kjøp + linjer + lagerpartier) skjer i én databasetransaksjon.

## Alternativer
- Egen `FinancialTransaction`: nyttig for generell privatøkonomi senere, men gir dobbeltføring nå.

## Konsekvenser
Retter man et kjøp, blir budsjettet automatisk riktig. Generelle utgifter som ikke er dagligvarer kan legges til senere med en ny ADR.
