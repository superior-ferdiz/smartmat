# Kildeliste

> **Status: UTKAST (KI).** Samlet av KI (Claude) i fase 14, 2026-10-27, fra kildene som ble registrert i fase 7–13 og
> fra programvaren i `package.json`. Stil: **APA 7, norsk utgave** (anbefalt av KI, ikke bestemt av teamet, og ikke
> kontrollert mot kravene i emnet). Lenkene er ikke åpnet på nytt i fase 14. **Ingen kilder er merket som lest av
> teamet**, fordi det ikke er registrert. Teamet flytter en kilde til «Lest av teamet» når den faktisk er lest.

## Merking

| Merke | Betyr |
|---|---|
| **[T]** | Lest av teamet (dato og hvem) |
| **[KI-lest]** | Lest av KI-assistenten på den datoen som står i «Hentet». Oppsummert i `docs/development/integrations/`. Ikke kontrollert av teamet. |
| **[KI-delvis]** | Lenket fra appen eller brukt av KI, men ikke lest i sin helhet |
| **[KI-kunnskap]** | Brukt fra KI-ens egen kunnskap, **ikke lest i prosjektet**. Må slås opp og sjekkes av teamet før den siteres. |

## Lest av teamet

<!-- Teamet fører inn kilder de selv har lest, for eksempel til kapittel 02 og 03, og flytter kilder fra listene under
hit når de er kontrollert. -->

Ingen registrert per 2026-10-27.

## Kilder lest av KI

Creative Commons. (u.å.). *Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)*. Hentet 24. oktober 2026 fra
https://creativecommons.org/licenses/by-sa/4.0/ **[KI-delvis]**

Have I Been Pwned. (u.å.-a). *API v3*. Hentet 25. oktober 2026 fra https://haveibeenpwned.com/API/v3 **[KI-lest]**
(avsnittene om Pwned Passwords, k-anonymitet, polstring og User-Agent)

Have I Been Pwned. (u.å.-b). *Pwned Passwords*. Hentet 25. oktober 2026 fra https://haveibeenpwned.com/Passwords
**[KI-lest]**

Have I Been Pwned. (u.å.-c). *Privacy*. Hentet 25. oktober 2026 fra https://haveibeenpwned.com/Privacy **[KI-lest]**

Kassalapp. (u.å.-a). *API*. Hentet 25. oktober 2026 fra https://kassal.app/api **[KI-lest]**

Kassalapp. (u.å.-b). *API-dokumentasjon*. Hentet 25. oktober 2026 fra https://kassal.app/api/docs **[KI-lest]**

Kassalapp. (u.å.-c). *OpenAPI-beskrivelse* (versjon 0.0.1) [JSON]. Hentet 25. oktober 2026 fra
https://kassal.app/docs/api.json **[KI-lest]**

Kassalapp. (u.å.-d). *Om Kassalapp*. Hentet 25. oktober 2026 fra https://kassal.app/om **[KI-lest]**

Kassalapp. (u.å.-e). *Priser*. Hentet 25. oktober 2026 fra https://kassal.app/pris **[KI-lest]**

Kassalapp. (u.å.-f). *Spørsmål og svar om API-et*. Hentet 25. oktober 2026 fra https://kassal.app/api/faq **[KI-lest]**
(bruksvilkårene for Hobby, dekning, rate limit og logging)

Kassalapp. (u.å.-g). *llms.txt* og *ai.txt*. Hentet 25. oktober 2026 fra https://kassal.app/llms.txt og
https://kassal.app/ai.txt **[KI-lest]**

Kassalapp. (2023, 8. juni). *Personvernerklæring*. Hentet 25. oktober 2026 fra https://kassal.app/personvern
**[KI-lest]**

Open Data Commons. (u.å.). *Open Database License (ODbL) v1.0*. Hentet 22. oktober 2026 fra
https://opendatacommons.org/licenses/odbl/1-0/ **[KI-delvis]**

Open Food Facts. (u.å.-a). *Introduction to Open Food Facts API documentation*. Hentet 22. oktober 2026 fra
https://openfoodfacts.github.io/openfoodfacts-server/api/ **[KI-lest]**

Open Food Facts. (u.å.-b). *Terms of use, contribution and re-use*. Hentet 22. oktober 2026 fra
https://world.openfoodfacts.org/terms-of-use **[KI-lest]**

Open Food Facts. (u.å.-c). *Tutorial on using the Open Food Facts API*. Hentet 22. oktober 2026 fra
https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/ **[KI-lest]**

Spoonacular. (u.å.). *Terms of use*. Hentet 24. oktober 2026 fra https://spoonacular.com/food-api/terms **[KI-lest]**
(vurdert og valgt bort)

TheMealDB. (u.å.-a). *API*. Hentet 24. oktober 2026 fra https://www.themealdb.com/api.php **[KI-lest]** (vurdert og
valgt bort)

TheMealDB. (u.å.-b). *Terms of use*. Hentet 24. oktober 2026 fra https://www.themealdb.com/terms_of_use.php
**[KI-lest]**

Wikibooks. (u.å.). *Cookbook: Table of contents*. Hentet 24. oktober 2026 fra
https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents **[KI-lest]**. De 27 oppskriftene som er oversatt, lenker
hver til den versjonen (`?oldid=`) som ble brukt. Listen står i `prisma/seed/sources/wikibooks.json` og på siden
«Kilder og lisenser» i appen. Lisens: CC BY-SA 4.0.

## Kilder fra KI-ens egen kunnskap (ikke lest i prosjektet)

Disse er brukt i kode eller tekst uten at KI-assistenten leste dem i prosjektet. **Teamet må slå dem opp før de siteres.**

Europaparlaments- og rådsforordning (EU) 2016/679 av 27. april 2016 om vern av fysiske personer i forbindelse med
behandling av personopplysninger og om fri utveksling av slike opplysninger (personvernforordningen). (2016).
*Den europeiske unions tidende*, L 119. **[KI-kunnskap]** (artikkel 5, 9, 13, 15, 20, 28 og 32 i kapittel 12)

Lov om elektronisk kommunikasjon (ekomloven). Lovdata. **[KI-kunnskap]** (§ 3-15 om informasjonskapsler). *Dato og
lovnummer er med vilje ikke fylt inn: KI-en er ikke sikker på hvilken versjon av loven som gjelder. Teamet må finne
riktig lov og paragraf på Lovdata.*

M'Raihi, D., Bellare, M., Hoornaert, F., Naccache, D. & Ranen, O. (2005). *HOTP: An HMAC-based one-time password
algorithm* (RFC 4226). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc4226 **[KI-kunnskap]**

M'Raihi, D., Machani, S., Pei, M. & Rydell, J. (2011). *TOTP: Time-based one-time password algorithm* (RFC 6238).
Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc6238 **[KI-kunnskap]** (testvektorene i vedlegg B
er brukt i `apps/api/src/lib/totp.test.ts` slik KI husket dem)

Josefsson, S. (2006). *The Base16, Base32, and Base64 data encodings* (RFC 4648). Internet Engineering Task Force.
https://www.rfc-editor.org/rfc/rfc4648 **[KI-kunnskap]**

MediaWiki. (u.å.). *API: Main page* (Action API). https://www.mediawiki.org/wiki/API:Main_page **[KI-kunnskap]**
(brukt i importskriptet. Svarene ble kontrollert mot de faktiske svarene fra Wikibooks.)

PostgreSQL Global Development Group. (u.å.). *PostgreSQL 16 documentation* (`pg_dump --snapshot`,
`pg_export_snapshot()`, `auto_explain`). https://www.postgresql.org/docs/16/ **[KI-kunnskap]**

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. W3C Recommendation.
https://www.w3.org/TR/WCAG22/ **[KI-kunnskap]** (listen over kriterier i `docs/development/testing/tilgjengelighet.md`)

## Programvare

Bibliotekene appen bruker mens den kjører, med versjon fra `package.json` og lisens fra pakkens `package.json` i
`node_modules` (lest av KI 2026-10-27). APA 7 krever ikke at hvert bibliotek siteres. Listen er med for lisensene.

| Pakke | Versjon | Lisens | Brukt til |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | Nettappen |
| react-router | 7.18.4 | MIT | Sider og navigasjon |
| @tanstack/react-query | 5.105.0 | MIT | Data fra API-et i nettleseren |
| i18next, react-i18next | 26.5.11, 17.1.9 | MIT | Norsk og engelsk tekst |
| @fontsource-variable/figtree | 5.3.0 | OFL-1.1 | Skriften |
| barcode-detector, zxing-wasm | 3.2.3, 3.1.6 | MIT | Strekkodeleseren |
| fastify | 5.12.7 | MIT | API-et |
| @fastify/cookie, helmet, multipart, rate-limit, static | 11.1.5, 13.2.0, 10.1.6, 11.2.1, 10.1.8 | MIT | Cookie, sikkerhetshoder, opplasting, grenser, filer |
| fastify-type-provider-zod, zod | 7.0.0, 4.6.7 | MIT | Validering |
| @prisma/client, @prisma/adapter-pg (og prisma) | 7.10.1 | Apache-2.0 | Databasen |
| argon2 | 0.45.1 | MIT | Passordhash |
| pg-boss | 12.38.0 | MIT | Bakgrunnsjobber |
| pino | 10.4.0 | MIT | Logging |
| sharp | 0.35.5 | Apache-2.0 (libvips: LGPL-3.0-or-later) | Bildebehandling for kvitteringer |
| Tesseract (`tesseract-ocr`, `tesseract-ocr-nor`, Debian 12) | 5.3.0-2, 4.1.0-2 | Apache-2.0 | Kvitteringslesing ([tesseract.md](../development/integrations/tesseract.md)) |
| PostgreSQL | 16 (`postgres:16-alpine`) | PostgreSQL License | Databasen |

Utviklingsverktøy (ikke en del av appen): Vite 7.3.7, TypeScript 6.0.3, Vitest 4.1.12, Playwright 1.63.0,
@axe-core/playwright 4.14.0, ESLint 9.39.5, Prettier 3.9.10. Lisensene til disse er ikke registrert.

## Data i appen

- Produktdata fra Open Food Facts (ODbL), kreditert på skannesiden.
- Oppskrifter oversatt fra Wikibooks (CC BY-SA 4.0), kreditert på hver oppskrift og på «Kilder og lisenser».
- Ingen priser fra Kassalapp er brukt i rapporten eller testene. Testene bruker oppdiktede priser og produkter.

## Endringer i fase 14

- Kildene fra fase 7, 9, 12 og 13 er samlet i én stil. Innholdet er det samme som før, men listen per fase er fjernet.
- Versjonene av `barcode-detector`, `zxing-wasm` og `@fastify/static` var fra fase 7 (3.2.2, 3.1.3, 10.1.5). De er
  oppdatert i fase 13, og tabellen viser versjonene som brukes nå.
- RFC-forfatterne og WCAG-datoen er skrevet fra KI-ens kunnskap i fase 14 og er ikke sjekket. For ekomloven er dato
  og lovnummer utelatt.
