# KI-bruk og kritisk refleksjon

> **Status: UTKAST / MAL.** Dette kapittelet er ikke skrevet ennå. Innholdet skal bygge på det som faktisk er implementert,
> testet og besluttet, og oppdateres underveis i fasene. Offisielle APP2000-krav til rapporten er ikke verifisert.

## Hva kapittelet skal dekke

- Hvordan KI ble brukt (fra KI-loggen)
- hva teamet gjennomgikk og endret
- feil KI gjorde
- begrensninger
- læring

## Notater fra loggene (ikke kapittelets endelige tekst)

- **Fase 5 (2026-10-21):** KI skrev all kode, og i tillegg et utkast til ingredienslisten (61 ingredienser med
  aliaser, allergener og omregninger). Utkastet er merket som KI-laget i filen (`meta.writtenBy`) og er ikke
  kontrollert. KI skrev ingen oppskrifter for teamet, bare tre fiktive testoppskrifter.
- Feil KI-en gjorde og fant selv i fase 5 (detaljer i kapittel 11): en regel for uavgjort i matchingen som i praksis
  var gjetting, et usynlig hardt mellomrom i en testfil (kjent fallgruve), en type som traff en regex i en annen
  test, to knapper med samme navn på varesiden (funnet da skjermbildeskriptet feilet), og to ting KI-en så da den
  så på sine egne skjermbilder: samme varenavn vist to ganger, og filtre som dekket hele første skjermbilde på
  telefon.
- Teamets refleksjon over dette er ikke skrevet.

## Kilder i prosjektet

<!-- Lenk til ADR-er, krav, testbevis og logg som kapittelet bygger på. -->
