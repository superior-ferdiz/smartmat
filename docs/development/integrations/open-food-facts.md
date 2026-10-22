# Open Food Facts (strekkodeoppslag, fase 7)

**Status:** Vilkårene ble lest av KI (Claude) 2026-10-22, før integrasjonen ble skrevet. Ikke kontrollert av teamet.
Sitatene under er hentet fra sidene som er lenket. Sidene kan endre seg, så de bør leses igjen før appen tas i bruk
av andre enn teamet.

## Hva vi bruker
Ett endepunkt: les ett produkt med strekkode.

```
GET https://world.openfoodfacts.org/api/v2/product/{strekkode}?fields=code,product_name,...
```

- Bare feltene vi trenger hentes (`fields=`): navn (også norsk), merke, mengde, enhet og kategorier.
- Bilder hentes ikke. De har en annen lisens (CC BY-SA), kan inneholde merkevarer og emballasjedesign med egne
  rettigheter, og gjør svaret mye større.
- Søk, skriving og innlogging brukes ikke.

## Vilkår

| Tema | Hva OFF sier | Hva SmartMat gjør |
|---|---|---|
| Lisens for databasen | Open Database License (ODbL 1.0). Enkeltoppføringer: Database Contents License (DbCL 1.0). | Bare et utvalg felt lagres i et mellomlager (`products`). Det deles ikke videre. |
| Kreditering | «mention the licence and to attribute the authorship to Open Food Facts with a link to https://openfoodfacts.org» ([vilkår](https://world.openfoodfacts.org/terms-of-use)) | Skannesiden viser alltid «Produktdata fra Open Food Facts (ODbL)» med lenke. |
| Del på samme vilkår | «Derivative works must be shared under the same conditions.» | Mellomlageret brukes bare internt. Skal det deles eller publiseres, gjelder ODbL for det. |
| User-Agent | «always use a custom User-Agent to identify your app», formatet `AppName/Version (ContactEmail)` ([API-dokumentasjon](https://openfoodfacts.github.io/openfoodfacts-server/api/)) | Settes i `OFF_USER_AGENT` i `.env`. Uten den er oppslag slått av, og appen viser det manuelle skjemaet. Kontaktadressen er ikke valgt av teamet per 2026-10-22. |
| Grenser | «15 req/min/IP address for all read product queries». I tillegg gjelder globale grenser, og OFF svarer 503 når de er nådd. | Serveren sender høyst 10 oppslag i minuttet til sammen. Hver bruker kan be om 30 oppslag i minuttet. Treff huskes i 30 dager, «fant ingenting» i 24 timer. |
| Innlogging | «READ operations … do not require authentication other than the custom User-Agent.» | Ingen nøkkel eller hemmelighet trengs. |
| Testing | «While testing your applications, make all API requests to the staging environment» (`world.openfoodfacts.net`, basic auth `off`/`off`) | Lokal utvikling bruker testmiljøet til OFF (`OFF_BASE_URL`). Automatiske tester kaller aldri OFF, verken ekte eller testmiljøet. |
| Nøyaktighet | «It can contain errors and must not be used for medical purposes.» OFF garanterer ikke riktighet. | Alt fra OFF er bare et forslag som brukeren retter og bekrefter. Allergener hentes ikke fra OFF. |
| Registrering | API-dokumentasjonen ber brukere fylle ut et skjema om API-bruk. | **Ikke gjort.** Teamet bør vurdere det før testmiljøet brukes. |
| Tilgjengelighet | «The service is provided as-is» og kan stoppes for vedlikehold. | Tidsavbrudd på 3 sekunder. Feil gir det manuelle skjemaet (NFR-REL-001). |

Siden med ODbL-forklaringen på OFF-wikien (`wiki.openfoodfacts.org/ODBL_License`) var sperret av en robotsjekk da den
skulle leses, og er derfor ikke lest.

## Hva som sendes til OFF
Bare strekkoden, fra serveren. Ikke brukerens IP-adresse, cookie, husholdning eller noe annet om brukeren. Kontakt-
adressen i User-Agent sendes med hvert oppslag.

## Format på svaret (sett 2026-10-22, testmiljøet)
To manuelle oppslag ble gjort mot `world.openfoodfacts.net` for å se formatet (ikke fra testene):

- **Treff:** HTTP 200, `{"code": "...", "product": {...}, "status": 1, "status_verbose": "product found"}`.
  `product_quantity` var et tall (400) og `product_quantity_unit` var `"g"`. `quantity` var tekst (`"400.0 g"`).
  `categories_tags` er en liste fra generell til spesifikk, med språkprefiks (`en:spreads`).
- **Ukjent strekkode:** HTTP 404, `{"code": "...", "status": 0, "status_verbose": "product not found"}`.

Svaret valideres med Zod (`apps/api/src/providers/barcode/openFoodFacts.ts`). Det som ikke stemmer med skjemaet,
behandles som «tjenesten svarer ikke».
