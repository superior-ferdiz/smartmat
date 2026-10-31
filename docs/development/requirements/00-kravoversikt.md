# Kravoversikt (MVP og første innlevering)

**Status:** Skrevet i fase 0 og utvidet i fase 7–13 av KI (Claude). Kravene er på overordnet nivå. Hver fase har en
egen, detaljert spesifikasjon (`NN-<modul>.md`) med målbare akseptansekriterier, skrevet før implementeringen.
(Fase 14: det sto at spesifikasjonene også skulle ha brukerhistorier. Det har ingen av dem, se kapittel 04.)
Sporbarhet fra krav til tester: [vedlegg-sporbarhet.md](../../academic/vedlegg-sporbarhet.md).

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
| FR-AUTH-006 | Tilbakestilling av passord og e-postverifisering | K | Delvis i 16: «Glemt passord» med e-post ([spesifikasjon 17](17-glemt-passord.md)). E-postverifisering er fortsatt utsatt. |
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
| FR-REC-005 | Oppskrifter kan importeres fra åpne kilder med kilde, lisens og hva som er endret (lagt til i fase 9, ADR-0016) | B | 9 |
| FR-REC-006 | Oppskriften viser kilde og lisens, og om teamet har kontrollert den (lagt til i fase 9) | B | 9 |
| FR-REC-007 | Husholdningen kan lage, endre og slette egne oppskrifter, merket «Egen oppskrift» (lagt til i fase 15, ADR-0023) | K | 15 |
| FR-REC-008 | Ingredienslinjer velges fra ingredienslisten med mengde og enhet. Fritekstlinjer er lov, men teller ikke. (fase 15) | K | 15 |
| FR-REC-009 | Ingen husholdning kan se, endre, rangere, planlegge eller handle inn en annen husholdnings oppskrift (fase 15) | K | 15 |
| FR-REC-010 | Seed-skriptet rører aldri egne oppskrifter, og eksporten tar dem med (fase 15) | K | 15 |
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


| ID | Krav (måltidsplan, lagt til i fase 9) | Prio | Fase |
|---|---|---|---|
| FR-PLAN-001 | Bruker kan legge oppskrifter og fritekst på dager og måltider, flytte, fjerne og bla mellom uker | K | 9 |
| FR-PLAN-002 | Mengder skaleres til valgt antall porsjoner med heltall, og rundes opp | K | 9 |
| FR-PLAN-003 | Ukeplanens behov regnes ut og trekkes fra matlageret (aldri siste forbruksdag passert) | K | 9 |
| FR-PLAN-004 | Det som mangler, legges på handlelisten etter bekreftelse, uten å bli doblet | K | 9 |
| FR-PLAN-005 | Det som går ut snart, foreslås først, med forklaring | K | 9 |

| ID | Krav (husholdning, lagt til i fase 10) | Prio | Fase |
|---|---|---|---|
| FR-HH-001 | Eieren kan invitere med en engangslenke som utløper, kan trekkes tilbake, og som bare lagres som hash | K | 10 |
| FR-HH-002 | Den inviterte ser hvem og hva før hen blir med, og beholder sine egne data | K | 10 |
| FR-HH-003 | Rollene eier og medlem kontrolleres på serveren | K | 10 |
| FR-HH-004 | En bruker kan være med i flere husholdninger og bytte hvilken som er aktiv | K | 10 |
| FR-HH-005 | Medlemmer kan forlate og fjernes, uten at data lekker etterpå | K | 10 |
| FR-HH-006 | Allergier kan deles med husholdningen etter eget valg, uten navn | K | 10 |
| FR-HH-007 | Det vises hvem som la til noe, men bare for nåværende medlemmer | K | 10 |
| FR-ALG-001 | Allergier og matvarer brukeren ikke tåler, legges inn under Innstillinger, med frivillig deling (fase 15) | K | 15 |
| FR-ALG-002 | Oppskrifter og måltider varsler om registrerte matvarer, egne og delte, uten navn (fase 15) | K | 15 |
| FR-ALG-003 | Fritekstlinjer sjekkes ikke mot allergiene, og det står på oppskriften (fase 15) | K | 15 |

| ID | Krav (svinn og varsler, lagt til i fase 11) | Prio | Fase |
|---|---|---|---|
| FR-WASTE-001 | Månedsoversikt over svinn: antall, kjent verdi (faktisk og anslått hver for seg), ukjent verdi og mengde per enhet | K | 11 |
| FR-WASTE-002 | Fordeling per årsak og kategori, og det som kastes oftest | K | 11 |
| FR-WASTE-003 | Utvikling over de siste 12 månedene | K | 11 |
| FR-WASTE-004 | Ærlige tall: hvor mye som er anslått og hvor mye som mangler verdi, uten å regne ut ukjente verdier | K | 11 |
| FR-WASTE-005 | Diagrammene har tekst og tabell, ikke bare farger, og virker på 360 px | K | 11 |
| FR-NOTIF-001 | Varsler i appen om siste forbruksdag og best før, med ulik ordlyd og aldri råd om å spise etter siste forbruksdag | K | 11 |
| FR-NOTIF-002 | Varsel når 80 % og 100 % av matbudsjettet er brukt | K | 11 |
| FR-NOTIF-003 | Varsel når andre har lagt til på handlelisten, med navn bare for nåværende medlemmer | K | 11 |
| FR-NOTIF-004 | Varsler kan leses og avvises, og samme varsel kommer ikke igjen | K | 11 |
| FR-NOTIF-005 | Brukeren velger hvilke varsler hen vil ha, og hvor mange dager før | K | 11 |
| FR-NOTIF-006 | Bare nåværende medlemmer ser varsler, og ingenting blir igjen etter utmelding | K | 11 |

| ID | Krav (priser, lagt til i fase 12) | Prio | Fase |
|---|---|---|---|
| FR-PRICE-001 | Pris per kjede for en skannet vare, med kilde, dato, enhetspris og merke for gamle priser, og hvilke kjeder som mangler | K | 12 |
| FR-PRICE-002 | Det husholdningen har betalt (egne priser), adskilt fra eksterne priser og merket | K | 12 |
| FR-PRICE-003 | Anslått pris på handlelisten, med hvor mange linjer som mangler pris og hvor anslagene kommer fra | K | 12 |
| FR-PRICE-004 | «Billigst sist observert hos», bare blant ferske priser | K | 12 |
| FR-PRICE-005 | En ekstern pris er et anslag og blir aldri en utgift (ADR-0007) | K | 12 |
| FR-PRICE-006 | Hver pris har kilde og dato | K | 12 |
| FR-PRICE-007 | Prisanslag for en oppskrift og hver ingrediens, med hva som mangler og uten «total» (fase 15) | K | 15 |

| ID | Krav (sikkerhet og personvern, lagt til i fase 13) | Prio | Fase |
|---|---|---|---|
| FR-AUTH-008 | Passord fra kjente datalekkasjer avvises ved registrering og passordbytte | K | 13 |
| FR-AUTH-009 | Brukeren ser hvor hen er logget inn, kan logge ut andre enheter, og får varsel om ny innlogging | K | 13 |
| FR-AUTH-010 | Valgfri tofaktorinnlogging (TOTP) med gjenopprettingskoder | K | 13 |
| FR-BUD-006 | Samtidig retting av samme kjøp gir en melding i stedet for at siste lagring vinner | K | 13 |
| FR-PRIV-001 | Brukeren kan laste ned alle egne data (art. 15 og 20) | K | 13 |
| FR-PRIV-002 | Lagringstider er dokumentert og håndheves, også for utløpte økter | K | 13 |
| FR-PRIV-003 | Personvernerklæring som kan leses uten å logge inn | K | 13 |

FR-AUTH-006 (tilbakestilling av passord og e-postverifisering) ble ikke gjort i fase 13, fordi teamet ikke hadde en
e-posttjeneste. I fase 16 er tilbakestilling av passord gjort, med e-post fra en Gmail-konto (ADR-0024,
[spesifikasjon 17](17-glemt-passord.md)). E-postverifisering ved registrering og endring av e-postadresse er fortsatt
utsatt.

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
| NFR-REL-001 | Lager og budsjett virker selv om eksterne tjenester er nede (fra fase 12 også uten nøkkel til Kassalapp) | 7+ |
| NFR-REL-002 | Appen virker uten kvitteringslesing; kjøp kan alltid fylles inn selv (lagt til i fase 8) | 8 |
| NFR-SEC-006 | Sikkerhetsheadere og CSP for nettsiden (lagt til i fase 13) | 13 |
| NFR-SEC-007 | Bare den omvendte proxyen kan sette klientens adresse (lagt til i fase 13) | 13 |
| NFR-SEC-008 | Ingen personopplysninger i loggene, kontrollert maskinelt (lagt til i fase 13) | 13 |
| NFR-OPS-001 | Nattlig, kryptert sikkerhetskopi uten kvitteringsbilder (lagt til i fase 13) | 13 |
| NFR-OPS-002 | Gjenoppretting testet ved at alle rader leses (lagt til i fase 13) | 13 |
| NFR-OPS-003 | Varsel når kopien er gammel eller feiler (lagt til i fase 13) | 13 |
| NFR-OPS-004 | Testmiljøet på nett bak HTTPS og basic auth (lagt til i fase 13) | 13 |
| NFR-PERF-001 | Kodedeling per side, og målte spørringer med realistiske datamengder (lagt til i fase 13) | 13 |
| NFR-UX-005 | WCAG 2.2 AA-gjennomgang av alle sider, med sjekkliste for ekte telefon (lagt til i fase 13) | 13 |

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
