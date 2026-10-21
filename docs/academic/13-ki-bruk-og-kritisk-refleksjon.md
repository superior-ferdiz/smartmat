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
- **Fase 6 (2026-10-21):** KI skrev all kode for handlelisten. Feil KI-en gjorde og fant selv (detaljer i kapittel
  11): et usynlig hardt mellomrom i en testfil igjen (samme fallgruve som i fase 3 og 5, funnet fordi testen feilet),
  en avkrysningsboks som beholdt haken etter tilbakerulling (funnet av komponenttesten), et redigeringsskript som
  stoppet halvveis, og to ting KI-en så på sine egne skjermbilder: et felt som brøt linjen på 360 px, og to felt som
  begge het «Enhet» i dialogen for ny vare.
- Teamets refleksjon over dette er ikke skrevet.

## Kilder i prosjektet

<!-- Lenk til ADR-er, krav, testbevis og logg som kapittelet bygger på. -->
