# Tesseract (kvitteringslesing, fase 8)

**Status:** Skrevet av KI (Claude) 2026-10-24. Versjoner og lisenser er lest fra Debian-pakkene i Docker-bildet
`docker/ocr` (`dpkg -s` og `/usr/share/doc/*/copyright`). Ikke kontrollert av teamet.

## Hva vi bruker

| Pakke (Debian 12, bookworm) | Versjon | Hva | Lisens |
|---|---|---|---|
| `tesseract-ocr` | 5.3.0-2 | OCR-motoren (LSTM) | Apache-2.0 |
| `tesseract-ocr-nor` | 4.1.0-2 | Norsk modell fra `tessdata_fast` | Apache-2.0 |
| `tesseract-ocr-osd` | (følger med `tesseract-ocr`) | Retningsgjenkjenning. Installert, men ikke brukt (se ADR-0017). | Apache-2.0 |

**Bildebehandling:** sharp 0.35.5 (Apache-2.0), med libvips (LGPL-3.0-or-later) som følger med som ferdig bygd
bibliotek. Den brukes til å skrive om bildet og forberede det for OCR.

## Ingen tjeneste utenfor serveren
- Tesseract er et program som kjører på vår server. Det finnes ingen konto, nøkkel, avtale eller vilkår for bruk,
  og ingen data sendes til noen.
- **Lokalt:** programmet kjører i Docker-bildet `smartmat-ocr` med `--network none`. Bildet går inn på stdin og
  teksten kommer ut på stdout, og ingenting skrives til disk i containeren.
- **I testmiljøet:** containeren `smartmat-staging-worker` er bare koblet til det interne nettverket uten
  internett (ADR-0015).
- Lisensen (Apache-2.0) tillater bruk, også kommersiell, så lenge lisensteksten følger med hvis programmet
  distribueres. Vi distribuerer det ikke: det installeres fra Debian i Docker-bildet.

## Begrensninger vi kjenner
- `tessdata_fast` er den raske og minste modellen. `tessdata_best` kan gi bedre lesing, men er ikke målt (ADR-0017).
- OSD (retningsgjenkjenning) valgte feil retning på to av tre ekte kvitteringer i piloten. Appen velger derfor
  retning ut fra formen på papiret, og leser flere retninger når den er usikker.

## Skytjenester
Ingen er brukt eller vurdert i detalj. ADR-0011 krever teamets godkjenning og dokumenterte vilkår først.
