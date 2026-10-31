# Prosjektoversikt

> **Status: UTKAST (KI).** Skrevet av KI (Claude) i fase 14, 2026-10-27, fra veikartet, ADR-ene og bevisoversikten.
> Ikke gjennomgått av teamet. Offisielle APP2000-krav til rapporten er ikke verifisert.

## Hva SmartMat er

SmartMat er en norsk webapp for husholdninger som vil kaste mindre mat og ha bedre oversikt over matutgiftene. Appen
samler fire ting som ellers ligger i hver sin app eller på en lapp på kjøleskapet:

- **matlageret** med holdbarhetsdatoer, der *best før* og *siste forbruksdag* behandles som to ulike ting
- **kjøp og budsjett**, der kjøpene er den eneste kilden til utgifter (ADR-0007)
- **oppskriftsforslag** rangert etter hva husholdningen har, og hva som snart går ut
- **handleliste og måltidsplan**, som henger sammen med matlageret

I tillegg finnes strekkodeskanning (Open Food Facts), kvitteringslesing (eksperimentell, Tesseract), delte
husholdninger, svinnstatistikk, varsler i appen og prisanslag (Kassalapp, av uten nøkkel).

## Målgruppe

<!-- Teamet skriver: målgruppen slik dere har definert den. Se kapittel 02. -->

Målgruppen er ikke definert av teamet ennå (kapittel 02). Appen er laget for norske husholdninger, med norsk som
standardspråk og engelsk som valg, og for telefon først (360 px).

## Omfang

| Del | Faser | Status |
|---|---|---|
| MVP: app-skall, innlogging, matlager, kjøp og budsjett | 1–4 | Implementert og testet av KI |
| Første innlevering: oppskrifter, handleliste, strekkode | 5–7 | Implementert og testet av KI |
| Valgfritt og senere: kvittering, måltidsplan, husholdning, svinn og varsler, priser, sikkerhet og drift | 8–13 | Implementert og testet av KI |
| Akademisk ferdigstilling | 14 | Pågår |

Ikke laget: tilbakestilling av passord og e-postverifisering (FR-AUTH-006, krever e-posttjeneste), produksjonsmiljø
og varsler på e-post eller push. Se [veikartet](../development/roadmap.md).

## Teknologi

React, TypeScript og Vite i nettleseren, Fastify og Zod i API-et, PostgreSQL 16 med Prisma, og ren CSS med
designtokens (ikke Tailwind). Valgene og begrunnelsene står i 22 arkitekturbeslutninger
([ADR-0001–0022](../development/architecture-decisions/README.md)). Arkitekturen er beskrevet i kapittel 07.

## Slik er prosjektet laget

Prosjektet er laget med spesifikasjonsdrevet utvikling (SDD) og en KI-assistent (Claude Code). **All kode og
nesten all dokumentasjon er skrevet av KI.** Teamet har gitt promptene, tatt beslutningene og godkjent planene. Hvem
som gjorde hva, står i kapittel 13 og 15 og i [KI-loggen](../evidence/ai-usage/ai-logg.md).

## Forventet verdi

<!-- Teamet skriver: hva dere mener appen gir brukeren, og hva dere har lært. Påstander om effekt (mindre svinn,
lavere utgifter) krever kilder eller brukertester – ingen av delene finnes ennå. -->

Om appen faktisk reduserer svinn eller utgifter, er ikke undersøkt. Ingen brukertester er gjort.

## Kilder i prosjektet

- [Veikart](../development/roadmap.md), [ADR-er](../development/architecture-decisions/README.md),
  [kravoversikt](../development/requirements/00-kravoversikt.md)
- [Bevisoversikt](../evidence/bevisoversikt.md), [KI-logg](../evidence/ai-usage/ai-logg.md)
