# Kravoversikt (MVP og første innlevering)

**Status:** UTKAST fra fase 0. Kravene er på overordnet nivå. Hver fase lager en egen, detaljert spesifikasjon
(`NN-<modul>.md`) med brukerhistorier og målbare akseptansekriterier før implementering.

**Kilde for kravene:** produktprompten fra teamet (2026-10-19). Offisielle APP2000-krav er ikke levert, så kursrelaterte
krav (KURS-*) er **antatt** ut fra beskrivelsen av Arbeidskrav 1 i prompten.

Prioritet: **M** = må (MVP), **B** = bør (første innlevering), **K** = kan (senere).

## Funksjonelle krav

| ID | Krav | Prio | Fase |
|---|---|---|---|
| FR-AUTH-001 | Bruker kan registrere seg med e-post og passord | M | 2 |
| FR-AUTH-002 | Bruker kan logge inn og ut | M | 2 |
| FR-AUTH-003 | Gjentatte mislykkede innlogginger begrenses | M | 2 |
| FR-AUTH-004 | Bruker kan endre visningsnavn, språk og passord | M | 2 |
| FR-AUTH-005 | Bruker kan slette kontoen sin og alle tilhørende data | M | 2 |
| FR-AUTH-006 | Tilbakestilling av passord og e-postverifisering | K | 13 (krever e-posttjeneste) |
| FR-INV-001 | Bruker kan legge til en vare med navn, kategori, mengde, enhet, lagringssted og valgfrie datoer/pris | M | 3 |
| FR-INV-002 | Samme vare kan ha flere partier med ulike datoer | M | 3 |
| FR-INV-003 | Bruker kan redigere, flytte og slette varer/partier | M | 3 |
| FR-INV-004 | Bruker kan søke, filtrere (sted, kategori, status) og sortere lageret | M | 3 |
| FR-INV-005 | Lageret viser hva som går ut snart, hva som har passert datoen og hva som mangler dato, med ulik ordlyd for best før og siste forbruksdag | M | 3 |
| FR-INV-006 | Bruker kan registrere forbruk (helt eller delvis) | M | 3 |
| FR-INV-007 | Bruker kan kassere en vare med mengde, årsak og verdi (faktisk/estimert) | M | 3 |
| FR-INV-008 | Bruker kan se historikk for en vare og angre siste endring | B | 3 |
| FR-BUD-001 | Bruker kan registrere et kjøp manuelt (butikk, dato, linjer eller totalsum) | M | 4 |
| FR-BUD-002 | Matvarer i et kjøp kan legges rett inn i lageret | M | 4 |
| FR-BUD-003 | Bruker kan sette et månedlig matbudsjett | M | 4 |
| FR-BUD-004 | Oversikten viser brukt, gjenstående og forbruk per kategori denne måneden | M | 4 |
| FR-BUD-005 | Retting eller sletting av et kjøp oppdaterer alle summer | M | 4 |
| FR-DASH-001 | Forsiden viser varer som trenger oppmerksomhet, månedens forbruk, gjenstående budsjett og hurtighandlinger | M | 3–5 |
| FR-REC-001 | Bruker kan bla i og åpne oppskrifter | B | 5 |
| FR-REC-002 | Oppskrifter rangeres etter hva som finnes, hva som går ut snart og hva som mangler, med forklaring | B | 5 |
| FR-REC-003 | Oppskriften viser hva man har, hva som mangler og om mengden er nok | B | 5 |
| FR-REC-004 | Oppskrifter med brukerens registrerte allergener filtreres bort eller varsles, med tydelig forbehold | B | 5 |
| FR-SHOP-001 | Bruker kan føre handleliste manuelt og huke av varer | B | 6 |
| FR-SHOP-002 | Manglende ingredienser kan legges til fra en oppskrift | B | 6 |
| FR-SHOP-003 | Avhukede varer kan legges inn i lageret | B | 6 |
| FR-SCAN-001 | Bruker kan skanne strekkode med kameraet eller skrive den inn | B | 7 |
| FR-SCAN-002 | Kjent strekkode fyller ut produktinfo; bruker bekrefter og legger til mengde/dato | B | 7 |
| FR-SCAN-003 | Strekkoden kan skrives inn og valideres med kontrollsiffer på klient og server (lagt til i fase 7) | B | 7 |
| FR-SCAN-004 | Ukjent strekkode gir et manuelt skjema og huskes for husholdningen (lagt til i fase 7) | B | 7 |
| FR-SCAN-005 | Ingenting fra en skanning lagres uten bekreftelse; dobbel innsending gir ett parti (lagt til i fase 7) | B | 7 |
| FR-RCPT-001 | Bruker kan laste opp bilde av en kvittering fra kamera eller fil, med grenser for type og størrelse (lagt til i fase 8) | K | 8 |
| FR-RCPT-002 | Bildet skrives om på serveren uten metadata (EXIF/GPS) (lagt til i fase 8) | K | 8 |
| FR-RCPT-003 | Kvitteringen leses i bakgrunnen, med tydelige tilstander og manuell reserve (lagt til i fase 8) | K | 8 |
| FR-RCPT-004 | Teksten tolkes til linjer med beløp i øre, pant, rabatt, dato og total (lagt til i fase 8) | K | 8 |
| FR-RCPT-005 | Bruker ser bildet og retter forslaget før noe lagres (lagt til i fase 8) | K | 8 |
| FR-RCPT-006 | Bekreftelsen lager kjøp, linjer og lagerpartier i én transaksjon (lagt til i fase 8) | K | 8 |
| FR-RCPT-007 | Samme kvittering kan ikke gi to kjøp (lagt til i fase 8) | K | 8 |
| FR-RCPT-008 | Bilde og uttrekk slettes ved bekreftelse eller etter 7 dager (lagt til i fase 8) | K | 8 |

## Ikke-funksjonelle krav

| ID | Krav | Fase |
|---|---|---|
| NFR-SEC-001 | All tilgang til husholdningsdata kontrolleres på serveren; en bruker kan aldri lese eller endre en annen husholdnings data | 2+ |
| NFR-SEC-002 | All input valideres på serveren (Zod), også når klienten har validert | 2+ |
| NFR-SEC-003 | Passord lagres med argon2id; sesjonscookie er HttpOnly/Secure/SameSite | 2 |
| NFR-SEC-004 | Feilmeldinger og logger lekker ikke personopplysninger eller interne detaljer | 2+ |
| NFR-DATA-001 | Beløp beregnes uten flyttallsfeil (heltall i øre) | 3+ |
| NFR-DATA-002 | Samme kjøp kan ikke registreres to ganger ved import | 4/8 |
| NFR-UX-001 | Alle sider fungerer på 360 px bredde uten horisontal rulling | 1+ |
| NFR-UX-002 | Mål: WCAG 2.2 AA (kontrast, tastatur, synlig fokus, skjemaetiketter, feilmeldinger knyttet til felt) | 1+ |
| NFR-UX-003 | Alle datavisninger har tilstand for lasting, feil og tomt | 1+ |
| NFR-UX-004 | Grensesnittet er på norsk bokmål; engelsk kan velges | 1+ |
| NFR-REL-001 | Lager og budsjett virker selv om eksterne tjenester er nede | 7+ |
| NFR-REL-002 | Appen virker uten kvitteringslesing; kjøp kan alltid fylles inn selv (lagt til i fase 8) | 8 |

## Kursrelaterte krav (antatt, ikke verifisert)

| ID | Tema | Hvor det vises i SmartMat |
|---|---|---|
| KURS-01 | HTML/semantikk | App-skall, skjemaer (fase 1) |
| KURS-02 | CSS Grid og responsiv layout | Forside-rutenett, lageroversikt (fase 1, 3) |
| KURS-03 | JavaScript/DOM og hendelser | Filtrering av lager, handleliste (fase 3, 6) |
| KURS-04 | Validering klient og server | Delte Zod-skjemaer (fase 2+) |
| KURS-05 | TypeScript og datastrukturer | Typede modeller i `packages/shared` |
| KURS-06 | JSON | API-svar, frødata for oppskrifter |
| KURS-07 | Testing og verifisering | Vitest, Playwright, lagrede resultater |
| KURS-08 | SDD | Denne kravstrukturen og fasespesifikasjonene |
| KURS-09 | KI-assistert utvikling | KI-loggen og refleksjonskapittelet |
