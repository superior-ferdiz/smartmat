# ADR-0004: Ren CSS med tokens og CSS Modules, ikke Tailwind

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
APP2000 dekker HTML, CSS, CSS Grid og responsiv layout (antatt ut fra Arbeidskrav 1; offisielle kriterier er ikke verifisert).
Vi må kunne vise og forklare egen CSS.

## Beslutning
Designtokens som CSS custom properties i `tokens.css` (farger, avstand, typografi, lys/mørk modus), komponentstiler i
CSS Modules, layout med Grid og Flexbox. Mobil først.

## Alternativer
- Tailwind: raskere å style, men rapporten ville forklart verktøyklasser i stedet for CSS, og layoutlogikken blir mindre synlig.
- Komponentbibliotek (MUI o.l.): generisk utseende, mindre eget designarbeid å vise.

## Konsekvenser
Mer CSS å skrive selv, men full kontroll og tydelige eksempler for rapporten.
