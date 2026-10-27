# Prosjektgjennomføring

> **Status: UTKAST (KI).** Skrevet av KI (Claude) i fase 14, 2026-10-27, fra [utviklingsloggen](../development/development-journal.md),
> [veikartet](../development/roadmap.md) og Git-historikken. **Teamets egen vurdering står tom.** Ikke gjennomgått av
> teamet. Offisielle APP2000-krav er ikke verifisert.

## Forløp

Hele utviklingen av fase 0–13 skjedde på ni dager, 2026-10-19 til 2026-10-27, i økter med KI-assistenten (som regel én
chat per fase, men fase 2 og 3 i samme chat). Alle øktene ble ledet av Ferdinand Risan.

| Fase | Dato | Commit | Hva som skjedde utenom planen |
|---|---|---|---|
| 0 | 2026-10-19 | (med fase 1) | Teamsammensetningen i den første prompten var feil og ble rettet. Git og hosting ble utsatt (ADR-0012). |
| 1 | 2026-10-19/20 | `0f7296c` | Git ble innført etter fasen, fordi Ferdinand spurte om det (ADR-0013). |
| 2 | 2026-10-20 | `8cb938c` | Alle 47 API-testene besto første gang. Det førte til mutasjonskontrollen. |
| 3 | 2026-10-21 | `856e68b` | Kjørt i samme chat som fase 2. Produktkatalogen ble flyttet til fase 7. |
| 4 | 2026-10-21 | `9e93aee` | Fase 3 og 4 ble pushet samtidig. |
| 5 | 2026-10-21 | `3197771` | Teamet skulle skrive oppskriftene (ADR-0009). Det ble ikke gjort, så databasen hadde ingen oppskrifter. |
| 6 | 2026-10-21 | `48bd67b` | Handlelisten ble flyttet foran strekkode og OCR. |
| 7 | 2026-10-21/22 | `5ecceb2` | Testmiljøet ble bygd, men kunne ikke settes opp fordi DNS manglet. |
| 8 | 2026-10-24 | `f590468` | Bare 3 av 6 planlagte kvitteringer (ingen fra Rema 1000). Kvitteringene lå i roten av repoet og ble flyttet ut før noe ble committet. ADR-0017 er foreslått, ikke godkjent. |
| 9 | 2026-10-24 | `92a8a34` | Teamet bestemte at oppskrifter skal «hentes fra internett». Det ble import fra Wikibooks (ADR-0016 erstattet ADR-0009). |
| 10 | 2026-10-24/25 | `a91c2b1` | Høy last fra et annet prosjekt på serveren ga to feilede Playwright-kjøringer. |
| 11 | 2026-10-25 | `2d1afb7` | En feil fra fase 4 ved sletting av kjøp ble funnet og rettet. |
| 12 | 2026-10-25 | `18f0789` | Teamet hadde ingen nøkkel til Kassalapp. Pushen ble stoppet av verktøyets sikkerhetssperre og gjort 2026-10-27. |
| 13 | 2026-10-25/27 | `9053c15` | Testmiljøet ble satt opp på nett. Basic auth ble lagt inn av KI etter at Ferdinands kommando feilet på grunn av KI-ens instruks. |
| 14 | 2026-10-27– | – | Pågår. |

## Avvik fra planen

1. **Rekkefølgen ble endret.** Handlelisten ble flyttet fra fase 9 til 6, fordi den var billig og brukte
   oppskriftene direkte. Priser ble flyttet sent, fordi tilgangen var uavklart (veikartet).
2. **Oppskriftene byttet kilde.** Planen fra fase 0 var at teamet skrev egne oppskrifter (ADR-0009). I fase 9 ble det
   import fra Wikibooks, oversatt av KI (ADR-0016). De 27 oppskriftene er ikke kontrollert av teamet.
3. **Kvitteringslesingen ble ikke ferdig målt.** Bare 3 kvitteringer, og parseren ble justert mot de samme
   kvitteringene den ble målt på. Derfor foreslår ADR-0017 bare butikk, dato og total som standard.
4. **Eksterne tjenester er av.** Open Food Facts mangler kontaktadresse, og Kassalapp mangler nøkkel.
5. **Gjennomgangen fra teamet mangler.** Planen for hver fase var at KI implementerer og teamet gjennomgår via pull
   request. Ingen pull request er opprettet eller merget per 2026-10-27, så ingen fase er «Ferdig» etter Definition of
   Done.
6. **Test på ekte telefon og med skjermleser** sto i planen fra fase 6, men er ikke gjort.
7. **Tempoet.** Ni dager for 13 faser betyr at kode ble skrevet raskere enn teamet kunne lese den.

## Teamets vurdering

<!-- Teamet skriver: Hvordan opplevde dere forløpet? Hva betydde tempoet for læringen og for kontrollen? Hvorfor ble
gjennomgangen og telefontestene ikke gjort, og hva skal gjøres før innleveringen? -->

## Kilder i prosjektet

- [Utviklingslogg](../development/development-journal.md), [veikart](../development/roadmap.md),
  [endringslogg](../development/changelog.md)
- Git-historikken (`git log`)
