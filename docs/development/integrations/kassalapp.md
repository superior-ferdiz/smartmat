# Kassalapp (priser, fase 12)

**Status:** Vilkårene ble lest av KI (Claude) 2026-10-25, før noe kode ble skrevet (ADR-0010). Ikke kontrollert av
teamet. Teamet har ikke oppgitt om det har konto eller API-nøkkel hos Kassalapp (per 2026-10-25), så svarformatet er
ikke sett i et ekte svar. Sitatene under er hentet fra sidene som er lenket. Sidene kan endre seg, så de bør leses
igjen før appen tas i bruk av andre enn teamet.

## Sider som er lest (2026-10-25)

| Side | Hva den inneholder |
|---|---|
| [kassal.app/api/faq](https://kassal.app/api/faq) | «Spørsmål og svar»: bruksvilkår, Hobby og Bedrift, dekning, rate limit, logging. Kassalapp kaller denne siden «Full FAQ and usage terms» i `llms.txt`. |
| [kassal.app/api](https://kassal.app/api) og [kassal.app/pris](https://kassal.app/pris) | Prisnivåene og eksempler på svar |
| [kassal.app/api/docs](https://kassal.app/api/docs) og [kassal.app/docs/api.json](https://kassal.app/docs/api.json) | Endepunktene og en generert OpenAPI-beskrivelse |
| [kassal.app/llms.txt](https://kassal.app/llms.txt) og [kassal.app/ai.txt](https://kassal.app/ai.txt) | Kort oppsummering av vilkårene på engelsk |
| [kassal.app/personvern](https://kassal.app/personvern) | Personvernerklæringen for nettsiden («Sist endret: 08.06.2023») |
| [kassal.app/om](https://kassal.app/om) | Hvem som eier tjenesten |

Det finnes ingen egen side med bruksvilkår: `kassal.app/vilkar` og `kassal.app/terms` gir 404. Bedrift-kunder får en
egen avtale som PDF. For Hobby er FAQ-en det eneste som er skrevet ned. `ai.txt` sier: «The full usage terms are at
https://kassal.app/api/faq.»

**Hvem:** Kassalapp eies av Liseth Solutions AS (org.nr. 924 869 453, Bergen), som drives av Helge Sverre Hessevik
Liseth.

## Hva vilkårene sier

Tabellen skiller mellom hva Kassalapp skriver (med sitat) og hva det betyr for SmartMat. Den siste kolonnen er
**KI-ens tolkning**, ikke en juridisk vurdering.

| Tema | Hva Kassalapp sier | Tolkning for SmartMat |
|---|---|---|
| Studentprosjekt | «En gratis app eller nettside uten inntekter, et hobbyprosjekt, et privat verktøy eller et studentprosjekt kan bruke Hobby, også når det er offentlig tilgjengelig.» Og: «Bruk Hobby, det er gratis og dekker bachelor- og masteroppgaver, forskningsprosjekter og hackathons.» | SmartMat som skoleprosjekt i APP2000 kan bruke Hobby (gratis). |
| Kommersiell bruk | «Enkelt forklart: tjener du penger på det, er det kommersielt. Det inkluderer betalte apper og abonnementer, annonsefinansierte tjenester, betalt rådgivning eller analyse, og bruk internt i en bedrift.» Bedrift koster «750 kr per måned eller 9 000 kr per år» eks. mva. | Blir SmartMat noe som tjener penger, eller brukes internt i et selskap, må det over på Bedrift. Testmiljøet ligger på et underdomene til `risansolutions.no`. Det gjør det etter vår lesing ikke kommersielt, men teamet bør være klar over grensen. |
| Lagring og hurtiglager | «Ja, både på Hobby og Bedrift. Vi anbefaler at du cacher svarene i seks timer. Prisene oppdateres én gang i døgnet» | Vi kan lagre prisene i databasen. Et oppslag gjelder i 6 timer. |
| Kreditering | «Nei, det er ikke et krav. Men en lenke til kassal.app i appen eller på nettsiden din er alltid velkommen.» `ai.txt`: «Link to the canonical HTML product or store page when citing information» | Ikke påkrevd. Vi viser likevel kilde og dato ved hver pris (ADR-0010), med lenke til kassal.app. |
| Videre publisering | «Bruk dataene i din egen tjeneste så mye du vil, men ikke legg ut rå-uttrekk av produktdatabasen eller prishistorikken som åpen nedlasting.» | Prisene vises bare i appen. Ingen eksport av prisdata, og ekte prisdata legges ikke i repoet (testene bruker oppdiktede svar). |
| Bilder | «Kassalapp eier ikke rettighetene til bildene og kan ikke gi deg bruksrett til dem.» | Vi henter og viser ikke bilder. |
| Allergener og næring | «De er kun til informasjon og skal ikke brukes til allergivarsling, medisinsk rådgivning eller andre formål der feil kan skade noen.» | Vi lagrer ikke allergener, ingredienser eller næringsinnhold fra Kassalapp. |
| Rate limit | «Hobby: 60 kall per minutt per konto. Grensen følger kontoen, ikke nøkkelen eller IP-adressen». «Ved overskridelse får du HTTP 429 med en Retry-After-header». | Serveren må holde seg godt under 60 i minuttet til sammen, og vente så lenge `Retry-After` sier. |
| Innlogging | Konto på kassal.app, API-nøkkel fra profilen, sendt som `Authorization: Bearer …`. «Hobby-tilgang er gratis og aktiveres med en gang. Du trenger ikke avtale eller godkjenning» | Nøkkelen er knyttet til kontoen til den som lager den. Den legges bare i `.env` (aldri i repoet, chatten, logger eller tester). |
| Support | «Hobby-tilgang har ingen support» | Feil i API-et må vi tåle selv (NFR-REL-001). |

## Dekning og hvor ferske prisene er

| Tema | Hva Kassalapp sier | Tolkning for SmartMat |
|---|---|---|
| Kjeder med priser | «Prisene hentes daglig fra disse kjedene»: Meny, Spar og Joker, Oda, Bunnpris, Europris, Engrosnett, Havaristen og Holdbart, Fudi, Leske og FastCandy. | Bare et utvalg av kjedene. |
| **Rema 1000, Kiwi og Coop** | «Nei. Disse kjedene har ingen nettbutikk med åpne priser, og vi har ikke funnet en lovlig måte å hente prisene deres på.» Eldre produkter finnes, og de «viser den siste prisen vi registrerte, ofte fra 2024». | **Tre av de største kjedene mangler.** Alle de 3 kvitteringene teamet har levert, er fra Extra (Coop) og Kiwi. En pris fra disse kjedene i API-et er gammel og skal aldri vises som dagens pris eller være med i «billigst». |
| Per kjede, ikke per butikk | «Per kjede. Vi har ikke priser eller sortiment for enkeltbutikker.» | Vi sier «hos Meny», aldri «i butikken din», og sier ingenting om at varen finnes på lager. |
| Tilbud og medlemspriser | «Det finnes ingen kampanjepriser fra kundeaviser og ingen medlemspriser fra Trumf, Æ eller Coop Medlem.» Og: «Stikkprøver viser at nettbutikkprisen vanligvis stemmer med hyllepris, men vi kan ikke garantere» | En pris fra Kassalapp er et anslag. Den kan avvike fra det man betaler. |
| Hvor fersk en pris er | Datoen på den nyeste prisen er «tidspunktet for siste kontroll» (`current_price.date` per butikk på `/products/ean/{ean}`). «Bruk ikke updated_at til dette.» «På kassal.app regnes en pris som utdatert når den ikke er kontrollert på 14 dager.» | Vi lagrer `current_price.date` som observasjonstidspunkt og merker priser eldre enn 14 dager som gamle. |
| Manglende pris | `llms.txt`: «A missing price or check date means unknown, not zero.» | En manglende pris er ukjent og telles aldri som 0. |

## Personvern

| Tema | Hva Kassalapp sier | Tolkning for SmartMat |
|---|---|---|
| Logging hos Kassalapp | «API-kall logges med endepunkt, parametere og tidspunkt for drift, feilsøking og for å oppdage misbruk. Søkeord og strekkoder inngår i loggen.» «Loggene brukes ikke til annet og deles ikke med tredjeparter.» | Strekkoden vi slår opp, havner i Kassalapps logg sammen med vår konto og tidspunktet. Derfor sender vi bare strekkoder, ikke fritekst som brukeren har skrevet. |
| Hvor serverne står | «Serverne står hos Hetzner i Helsinki, Finland, innenfor EU/EØS.» | Ingen overføring ut av EØS. |
| Personvernerklæringen | Gjelder nettsiden kassal.app (Google Analytics, Microsoft Clarity, informasjonskapsler, bankkobling). Den sier ingenting om API-et. | Gjelder den i teamet som lager kontoen, ikke SmartMat-brukerne. |

**Hva SmartMat sender (forslag, se spesifikasjon 12):** bare en gyldig strekkode (GTIN, kontrollert med
kontrollsiffer), fra serveren, med API-nøkkelen. Ikke brukerens IP-adresse, cookie, husholdning, navn, søketekst
eller hva husholdningen har betalt. Etter KI-ens lesing er Kassalapp da ikke databehandler for SmartMat, fordi ingen
personopplysninger om brukerne sendes. Det er en tolkning teamet må vurdere.

## Det vi bruker

Ett endepunkt: slå opp én strekkode på tvers av kjedene.

```
GET https://kassal.app/api/v1/products/ean/{ean}
Authorization: Bearer <KASSALAPP_API_KEY>
```

Svaret har én oppføring per kjede (`products[]`) med `store.code`, `store.name`, `current_price.price` (kroner),
`current_price.unit_price`, `current_price.date`, `weight`, `weight_unit` og `kassalapp.url`. Vi leser alle unntatt
`unit_price`, som ikke sier hvilken enhet den gjelder (vi regner enhetsprisen selv). Søk med fritekst
(`/products?search=`), prishistorikk (`prices-bulk`), handlelister og webhooks brukes ikke.

**Slik er det bygd (fase 12):** `apps/api/src/providers/prices/kassalapp.ts`, med 3 sekunders tidsavbrudd, grense på
svarstørrelsen, Zod-validering, høyst 30 kall i minuttet for hele serveren (`KASSALAPP_MAX_PER_MINUTE`, høyst 60),
pause etter 429 så lenge `Retry-After` sier, og ingen omdirigeringer. Uten `KASSALAPP_API_KEY` er provideren av.
Testene bruker en falsk `fetch` med oppdiktede priser og en oppdiktet nøkkel (`apps/api/test/fakeKassalapp.ts`) og
kaller aldri Kassalapp. Se [spesifikasjon 12](../requirements/12-priser.md).

**Uklart i dokumentasjonen:** eksempelsvaret på API-siden har `store` og `current_price` som objekter, mens den
genererte OpenAPI-beskrivelsen (`api.json`, versjon 0.0.1) sier at de er lister eller `null`. Zod-skjemaet bør derfor
godta begge deler, og formatet bør sjekkes med ett manuelt oppslag når teamet har en nøkkel (som for Open Food Facts).
Vi har ikke sett et ekte svar.

## Søk etter navn (lest 2026-10-30)

Teamet ba i prompten for fase 15 om å undersøke om ingredienser uten strekkode kan prises med Kassalapps søk på
navn. KI (Claude) leste disse sidene 2026-10-30, før noe ble bygd. Sidene har ingen dato for siste endring.

| Side | Hva som ble lest |
|---|---|
| [kassal.app/api/faq](https://kassal.app/api/faq) | Hobby og Bedrift, logging, lagring, dekning, allergener, rate limit, publisering |
| [kassal.app/api/docs](https://kassal.app/api/docs) | `GET /api/v1/products` med parametere og svarfelt |

| Tema | Hva Kassalapp sier | Tolkning for SmartMat |
|---|---|---|
| Søk på Hobby | «Begge nivåene har tilgang til alle endepunkter og de samme produktene og prisene.» `GET /api/v1/products?search=…` «gir fritekstsøk med filtre på butikk, pris og merke.» | Søket er tilgjengelig uten Bedrift. |
| Hvordan søket virker | API-dokumentasjonen: `search` gjør et uskarpt søk i produktnavn («fuzzy matches»). Andre parametere: `size` (høyst 100), `unique` (ett produkt per EAN), `exclude_without_ean`, `sort`, `price_min`/`price_max`, `brand`, `vendor`, `category`. Svaret har `current_price`, `weight`, `weight_unit`, `ean` (kan være tom) og `store`. | Et søk på «melk» gir mange forskjellige produkter (lettmelk, kokosmelk, sjokolademelk). Å velge ett av dem som prisen på ingrediensen er gjetning. |
| Logging | «Søkeord og strekkoder inngår i loggen.» | Ville vi sendt det brukeren har skrevet, havner det hos Kassalapp. Søker vi bare på navnene i ingredienslisten (ikke brukerens tekst), sendes ingen personopplysninger. |
| Bruk til anslag | FAQ-en sier ingenting om å bruke søketreff til prisanslag eller automatisk kobling. | Ikke forbudt, men heller ikke beskrevet. |
| Dekning | Rema 1000, Kiwi og Coop: «Disse kjedene har ingen nettbutikk med åpne priser, og vi har ikke funnet en lovlig måte å hente prisene deres på.» | Uendret fra 2026-10-25. |

**Avgjørelse (spesifikasjon 16, avgjørelse 5):** søk etter navn bygges ikke i fase 15. Grunnene er at koblingen fra
en ingrediens til ett produkt ville vært gjetning, og at teamet ikke har nøkkel. Prisanslaget for en oppskrift bruker
egne priser fra partiene og Kassalapp-priser som allerede er lagret for strekkoder husholdningen har lagt på varene,
uten nye kall (FR-PRICE-007). Et mulig senere alternativ er at teamet kobler hver ingrediens til én eller flere
kontrollerte strekkoder (referanse-GTIN-er), slik at det oppslaget som finnes, kan brukes uten gjetning.

**Hva som virker uten nøkkel:** egne priser (andel av det husholdningen har betalt for samme vare) på handlelisten
og på oppskrifter. Kortet sier at eksterne priser er slått av, og at Rema 1000, Kiwi og Coop uansett ikke er med.

## Uklart eller ikke avklart

1. **Ingen egen avtale for Hobby.** Vilkårene står i en FAQ som kan endres uten varsel. Det er mulig at kontoen har
   vilkår som vises ved registrering. Den i teamet som lager kontoen, bør lese det som vises da, og notere dato.
2. **Hvem kontoen tilhører.** Nøkkelen og grensen på 60 kall følger én persons konto. Teamet må velge hvem.
3. **Dekningen er svak for teamets egne butikker** (Kiwi, Extra/Coop, Rema 1000). Funksjonen kan bli lite nyttig i
   praksis, og egne priser fra kjøpene kan være mer verdt.
4. **Svarformatet** (objekt eller liste, se over) er ikke sett i et ekte svar.
5. **Om tjenesten fortsetter.** FAQ-en svarer «Ja» på om Kassalapp fortsatt er i drift. Det finnes ingen avtale om
   oppetid for Hobby. Appen må virke uten (NFR-REL-001).

**Konklusjon (KI-ens forslag):** Kassalapp kan etter vilkårene brukes på Hobby i SmartMat som studentprosjekt, med
lagring i 6 timer, uten krav om kreditering, så lenge prisene ikke publiseres som datasett og bilder og
allergener ikke brukes. Dekningen gjør at prisene må vises som et ufullstendig anslag. Se forslaget til ADR-0020.
