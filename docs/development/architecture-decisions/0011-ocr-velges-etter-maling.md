# ADR-0011: OCR-løsning velges etter måling, Tesseract først

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Kvitteringer avslører kjøpsvaner. Den vanskelige delen er å tolke norske kvitteringsformater (forkortelser, pant, rabatter, "2 x 24,90"), ikke selve tekstgjenkjenningen.

## Beslutning
I fase 8 tester vi 20–30 ekte kvitteringer fra ulike kjeder mot server-side Tesseract (norsk modell) og minst én skytjeneste, og måler nøyaktighet per felt.
Tesseract foretrekkes hvis resultatet er godt nok, fordi bildene da ikke forlater serveren. Uansett løsning:
- Uttrekket lagres separat fra bekreftede kjøp, og ingenting lagres som kjøp uten at brukeren bekrefter.
- KI-tolkning er valgfri og kan bare *foreslå* verdier.
- Originalbilder slettes etter bekreftelse eller innen en fast frist.

## Konsekvenser
Valget utsettes til vi har data. Teamet må skaffe kvitteringer til testen (ikke gjort per 2026-10-19).
