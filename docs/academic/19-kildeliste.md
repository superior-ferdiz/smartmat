# Kildeliste

> **Status: UTKAST / MAL.** Dette kapittelet er ikke skrevet ennå. Innholdet skal bygge på det som faktisk er implementert,
> testet og besluttet, og oppdateres underveis i fasene. Offisielle APP2000-krav til rapporten er ikke verifisert.

## Hva kapittelet skal dekke

- Bare kilder som faktisk er brukt og kontrollert
- konsekvent referansestil

## Kilder registrert underveis (fase 7)

Lest av KI (Claude) 2026-10-22. Ikke kontrollert av teamet. Referansestil er ikke valgt.

- Open Food Facts. *Terms of use, contribution and re-use.* https://world.openfoodfacts.org/terms-of-use (lest
  2026-10-22).
- Open Food Facts. *Introduction to Open Food Facts API documentation.*
  https://openfoodfacts.github.io/openfoodfacts-server/api/ (lest 2026-10-22).
- Open Food Facts. *Tutorial on using the Open Food Facts API.*
  https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/ (lest 2026-10-22).
- Open Data Commons. *Open Database License (ODbL) v1.0.* https://opendatacommons.org/licenses/odbl/1-0/ (lenket fra
  appen, ikke lest i sin helhet).
- Programvare (lisens fra npm, versjoner i `package-lock.json`): `barcode-detector` 3.2.2 (MIT), `zxing-wasm` 3.1.3
  (MIT), `@fastify/static` 10.1.5 (MIT).

Produktdata i appen kommer fra Open Food Facts (ODbL) og krediteres på skannesiden.

## Kilder registrert underveis (fase 9)

Lest av KI (Claude) 2026-10-24. Ikke kontrollert av teamet. Referansestil er ikke valgt.

- Wikibooks. *Cookbook* (en.wikibooks.org/wiki/Cookbook:Table_of_Contents). 27 oppskrifter er oversatt fra denne
  kokeboka. Hver oppskrift lenker til den versjonen (`?oldid=`) som ble oversatt, og listen står i
  `prisma/seed/sources/wikibooks.json` og på siden «Kilder og lisenser» i appen. Lisens: CC BY-SA 4.0.
- Creative Commons. *Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).*
  https://creativecommons.org/licenses/by-sa/4.0/ (lenket fra appen, ikke lest i sin helhet).
- MediaWiki. *Action API* (`action=query`, `prop=revisions`, `meta=siteinfo`). Brukt i importskriptet. Dokumentasjonen
  ble ikke lest i fase 9: KI brukte det den kunne om API-et fra før, og svarene ble kontrollert mot de faktiske svarene.
- Spoonacular. *Terms of Use.* https://spoonacular.com/food-api/terms (lest 2026-10-24, vurdert og valgt bort).
- TheMealDB. *API* og *Terms of use.* https://www.themealdb.com/api.php og
  https://www.themealdb.com/terms_of_use.php (lest 2026-10-24, vurdert og valgt bort).

## Kilder registrert underveis (fase 12)

Lest av KI (Claude) 2026-10-25, før koden ble skrevet. Ikke kontrollert av teamet. Referansestil er ikke valgt.
Innholdet er oppsummert i `docs/development/integrations/kassalapp.md`.

- Kassalapp. *Spørsmål og svar om API-et.* https://kassal.app/api/faq (lest 2026-10-25). Bruksvilkårene for Hobby,
  dekning, rate limit og logging.
- Kassalapp. *API* og *Priser.* https://kassal.app/api og https://kassal.app/pris (lest 2026-10-25).
- Kassalapp. *API-dokumentasjon* og *OpenAPI-beskrivelse.* https://kassal.app/api/docs og
  https://kassal.app/docs/api.json (lest 2026-10-25, versjon 0.0.1 av beskrivelsen).
- Kassalapp. *llms.txt* og *ai.txt.* https://kassal.app/llms.txt og https://kassal.app/ai.txt (lest 2026-10-25).
- Kassalapp. *Personvernerklæring* («Sist endret: 08.06.2023»). https://kassal.app/personvern (lest 2026-10-25).
- Kassalapp. *Om Kassalapp.* https://kassal.app/om (lest 2026-10-25).

Ingen priser fra Kassalapp er brukt i rapporten eller i testene. Testene bruker oppdiktede priser.

## Kilder i prosjektet

<!-- Lenk til ADR-er, krav, testbevis og logg som kapittelet bygger på. -->
