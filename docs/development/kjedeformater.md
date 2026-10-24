# Kvitteringsformater per kjede

**Status:** Skrevet av KI (Claude) 2026-10-24, i fase 8. Bygger på teamets 3 kvitteringer: 2 fra Extra (Coop) og
1 fra Kiwi (NorgesGruppen). **Rema 1000 er ikke observert.** Dokumentet sier bare hva vi har sett, og ingenting her
er hentet fra kjedene selv. Eksemplene er oppdiktet, men har samme oppsett. Utvides når teamet har flere
kvitteringer.

Parseren (`packages/shared/src/receipts/`) har én felles regelmotor og en profil per familie: `coop`, `ng`, `rema`
og `generic`. Profilen avgjøres av kjeden i toppteksten, eller av kjennetegn i oppsettet når logoen ikke kan leses.

## Oversikt

| | Extra (Coop) | Kiwi (NorgesGruppen) | Rema 1000 |
|---|---|---|---|
| Kjede i toppteksten | Logo (bilde, ikke tekst), deretter stedsnavn | «KIWI ‹nr› ‹sted›» og selskapet «NG KIWI … AS» | Ikke observert |
| Kjennetegn uten logo | «Totalt (N Artikler)», «Herav Dagligvarer», «Antall: N stk», «Coop Medlem» nederst | «Sum N varer», «Kvitt:», selskap som starter med «NG » | – |
| Desimaltegn | Punktum: `29.90` | Komma: `29,90` | – |
| Dato og tid | `24.10.2026 12:43` på linjen «Salgskvittering ‹nr›» | `24.10.26 12:32` (toårig år) | – |
| Kvitteringsnummer | «Salgskvittering ‹nr›» | «Kvitt:‹nr›» | – |
| Mva per linje | Nei. Oversikt nederst med 0 %, 15 % og 25 %. | Ja: `15%` / `0%` foran beløpet | – |
| Antall | Egen linje **under** varen: `Antall: 2 stk 46.50 kr/stk`. Beløpet står på varelinjen. | Ikke observert | – |
| Vekt | Egen linje under varen: `0.946 kg 31.90 kr/kg` | Ikke observert | – |
| Pant | Egen linje `PANT`, med sin egen antall-linje når det er flere | `+ Pant` med mva 0 %, rett under varen | – |
| Rabatt | Oppsummert nederst («Spart», «Herav medlemsfordel», «Andre rabatter»). Hvordan rabatt står per linje, er ikke observert (0,00 på alle tre). | Ikke observert | – |
| Total | `Totalt (N Artikler)`, `Bank:`, `Totalbeløp: NOK` | `Sum N varer`, `BANK`, `Totalbeløp: NOK` | – |
| Antall artikler | Summen av antallene, uten pant (vekt teller som 1) | Antall varer, uten pant | – |
| Betaling | Maskert kortnummer, terminal, AID, autorisasjon | Samme | – |

## Ting parseren må tåle
- **«2 x 24,90»** er ikke sett på noen av de tre. Parseren støtter det likevel, både på egen linje og inne i
  varelinjen, men bare testet med oppdiktet tekst.
- **Avrunding i mva-oversikten:** grunnlag + mva kan være én øre unna summen. Mva-oversikten brukes derfor ikke som
  kontrollsum.
- **Avkuttede varenavn:** kassen kutter navn på rundt 20 tegn («… FERSKEN 0.»).
- **Varenavn med kjedenavn:** frukten «KIWI GRØNN» på en Coop-kvittering. Kjeden leses bare fra toppteksten.
- **Ikke-mat:** plastposer har 25 % mva hos Kiwi. Hos Coop står det ikke per linje, så parseren kjenner igjen
  posene på navnet.

## Det OCR gjorde i piloten (generelt, ikke knyttet til én kvittering)
- Korte «ord» fra bordet i venstre kant foran linjen («HÅ», «Fy»).
- Mellomrom inne i beløp («79, 90»), bokstaven O for null («O%»), «Part» for «Pant».
- Et beløp som flyttes til linjen under når bildet er skjevt eller papiret krøllete.
- Siffer som leses feil, for eksempel 9 som 0, eller 1 foran et tall. Kontrollsummene på kvitteringen fanger noen
  av dem, men ikke alle.
- Logoen er et bilde og blir ikke lest som tekst.

## Trenger vi regler per kjede?
**Per familie, ja, per kjede, nei.** Coop og NorgesGruppen skiller seg i desimaltegn, hvor antall og pant står, og
hvordan totalen skrives. Innenfor en familie ser vi ingen forskjell, men det bygger på én kvittering fra
NorgesGruppen. Rema 1000 får foreløpig de generelle reglene.
