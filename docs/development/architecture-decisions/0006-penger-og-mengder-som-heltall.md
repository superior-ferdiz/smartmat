# ADR-0006: Penger i øre og mengder i grunnenheter, som heltall

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Desimaltall i JavaScript gir avrundingsfeil (`0.1 + 0.2 !== 0.3`). Budsjett og oppskriftsmatching må regne nøyaktig.

## Beslutning
- Alle beløp lagres og beregnes som heltall i **øre** (`49,90 kr` = `4990`). Valuta lagres (`NOK`) for senere utvidelse.
- Mengder lagres som heltall i grunnenhet: **gram, milliliter eller stykk**. Visningsenhet (kg, dl, pakke) lagres separat.
- Formatering og parsing (f.eks. `"49,90"` → `4990`) ligger i `packages/shared` og testes.

## Alternativer
- `Decimal`/`numeric`: korrekt, men tyngre å bruke i TypeScript og lett å blande med vanlige tall.

## Konsekvenser
Ingen flyttallsfeil i summer. Enheter som ikke kan omregnes (f.eks. "en klype") må håndteres eksplisitt i oppskrifter.
