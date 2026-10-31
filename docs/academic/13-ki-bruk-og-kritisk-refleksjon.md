# KI-bruk og kritisk refleksjon

> **Status: UTKAST (KI) – refleksjonen mangler.** Avsnittene om hvordan KI ble brukt, hva som er kontrollert og
> hvilke feil KI gjorde, er sammenstilt av KI (Claude) i fase 14, 2026-10-27, fra
> [KI-loggen](../evidence/ai-usage/ai-logg.md), utviklingsloggen og kapittel 11. **Den kritiske refleksjonen er
> teamets egen og står tom.** Ikke gjennomgått av teamet. Offisielle APP2000-krav er ikke verifisert.

## Hvordan KI ble brukt

| Hva | Hvem | Bevis |
|---|---|---|
| Planer for hver fase (fasemalen) | KI skrev, Ferdinand godkjente i chat | KI-loggen, én rad per plan |
| Spesifikasjoner, ADR-er, datamodell | KI skrev før koden, godkjent gjennom planen | `docs/development/` |
| All kode og alle tester | KI | Git: alle commits har `Co-Authored-By: Claude` |
| Innhold: 27 oversatte oppskrifter, ingredienslisten, OFF-kategoriene, kjedeformatene | KI | Merket «KI-utkast» i filene og i appen |
| Vilkår for eksterne tjenester (OFF, Wikibooks, Spoonacular, TheMealDB, Kassalapp, HIBP) | KI leste og oppsummerte | `docs/development/integrations/` |
| Kjøring av tester, lagring av bevis, mutasjonskontroll | KI | [Bevisoversikt](../evidence/bevisoversikt.md) |
| Oppsett på serveren (testmiljø, nett, backup, Caddy) | KI, etter godkjent plan | Kapittel 07 og 12, utviklingsloggen fase 13 |
| Rapportkapitlene 07–12 og utkastene i fase 14 | KI | Statuslinjen øverst i hvert kapittel |
| Prompter, beslutninger, godkjenninger, repo på GitHub, DNS | Ferdinand Risan | KI-loggen, utviklingsloggen |
| Fasit til OCR-piloten, kontrollert mot papirkvitteringene | KI skrev av, Ferdinand kontrollerte | KI-loggen rad 25 |

Linus Saxe Huseby har ikke vært med i noen av øktene med KI-assistenten. Ferdinand har oppgitt at begge har
gjennomgått noen faser «i plenum» (se kapittel 15).

## Hva som er kontrollert, og av hvem

- **Av teamet (oppgitt i chat):** godkjenning av planen for hver fase (om planen ble lest i detalj, er ikke oppgitt),
  kontroll av fasiten til OCR-piloten, og gjennomganger «i plenum» av fase 5 og 7, og planene for fase 8, 9 og
  fase 13 (omfang og funn ikke oppgitt). Ingen kodegjennomgang med funn er registrert.
- **Av KI selv:** automatiske tester, mutasjonskontroll, sammenligning med lagrede utdata, og lesing av egne
  skjermbilder. En KI som kontrollerer sin egen kode, kan ha de samme blindsonene i testene som i koden.
- **Ikke kontrollert av noen:** innholdet i oppskriftene og ingredienslisten, OFF-kategoriene, tolkningen av
  vilkårene, personvernvurderingene i kapittel 12, og testvektorene for TOTP.

## Mønstre i feilene KI gjorde

Fra notatene under og kapittel 11. Alle ble funnet av KI-en selv, de fleste av testene:

1. **Usynlige tegn i kildekoden** (hardt mellomrom) kom tilbake i fase 3, 5 og 6, selv om fallgruven sto i CLAUDE.md fra fase 1.
2. **Feil i egne beregninger og eget minne:** kontrollsifre, en paritetstabell for EAN-13, en grense hos Open Food Facts
   (15, ikke rundt 100), og testvektorer for TOTP som ikke er kontrollert mot kilden.
3. **Tester som var for svake:** mutasjonskontrollen fant hull i testene i nesten hver fase (se
   [bevisoversikten](../evidence/bevisoversikt.md#mutasjonskontroll)).
4. **Feil som bare den ekte kjeden eller en ekte nettleser fant:** OCR-røyktesten, kodedelingen som brøt fokus, og
   kappløp som bare viste seg under høy last.
5. **Feil påstander om eget arbeid i dokumentasjonen:** tre i fase 13, én i fase 9, og ett tall i kapittel 11
   (fase 8) som ble funnet i fase 14.
6. **KI tok i praksis mange beslutninger.** Planene hadde åpne spørsmål, og Ferdinand godkjente ofte uten å svare på
   dem enkeltvis. Da gjaldt KI-ens anbefalinger (fase 2–13).

## Teamets kritiske refleksjon

<!-- Teamet skriver. Dette er den delen sensor trolig vil lese mest nøye. Spørsmål å ta stilling til:
- Hva lærte dere om webutvikling når KI skrev koden? Kan dere forklare koden (for eksempel tofaktorinnloggingen)?
- Hvordan kontrollerte dere det KI laget? Var det nok?
- Hva betyr punkt 6 over – at KI-ens anbefalinger ble gjeldende når spørsmålene ikke ble besvart?
- Hvilke feil ville dere ikke ha funnet selv?
- Hva ville dere gjort annerledes neste gang?
Skriv med egne ord. Ikke bruk KI til å skrive denne delen. -->

## Læring

<!-- Teamet skriver. -->

## Notater fra loggene (ikke kapittelets endelige tekst)

- **Fase 0–4 (2026-10-19 til 2026-10-21)**, lagt til i fase 14 fra kapittel 11:
  - KI skrev planen, ADR-0001–0012, kravoversikten, datamodellen og malene for kapitlene (fase 0), og all kode for
    app-skall, innlogging, matlager, kjøp og budsjett (fase 1–4).
  - **Feil KI-en gjorde og fant selv:** Zod 4 som avviste store beløp med feil melding, for små lenker i
    feiloppsummeringen (axe), usynlige tegn i kildekoden, en cookie som utløp for tidlig (`curl`), `?neste` som ble
    ignorert etter innlogging, fremmednøkler med feil `ON DELETE` (lest før migreringen ble kjørt), og to hull i
    testene i fase 4 (mutasjonskontrollen).
  - **Feil i KI-ens egne tester:** en påstand om tap av én øre ved flyttall som ikke stemte, feil antall kolonner,
    feil rekkefølge på argon2-parametrene, og et skript for testbevis som alltid skrev exit-kode 0. Det siste ble
    oppdaget fordi en formateringsfeil ikke ble rapportert, og alle bevisfilene i fase 1 ble laget på nytt.
  - **Alle 47 API-testene i fase 2 besto første gang.** Det var grunnen til at mutasjonskontrollen ble innført.
  - Ferdinand skrev i fase 4: «Godkjennt du kan committe jeg har gått igjennom alt.» Hva «alt» omfattet, er ikke
    oppgitt.

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
- **Fase 7 (2026-10-22):** KI skrev all kode for strekkodeskanning og testmiljøet, tre ADR-er (0014–0016, der 0016
  bare er et forslag), vilkårsdokumentet for Open Food Facts og en KI-laget tabell fra OFF-kategorier til
  SmartMat-kategorier (merket i filen, ikke kontrollert). Reglene for GS1-prefikser og UPC-E bygger på KI-ens
  kunnskap. Testverdiene ble regnet ut for seg, men reglene er ikke kontrollert mot GS1-spesifikasjonen.
- Feil KI-en gjorde og fant selv i fase 7 (detaljer i kapittel 11):
  - **feil i egne beregninger:** to testverdier med feil kontrollsiffer (funnet da Python regnet dem ut på nytt), og
    en paritetstabell for EAN-13 der radene for 6 og 7 var byttet (funnet fordi strekkodeleseren ikke kunne lese
    bildet, og så sammenlignet med zxing sin egen tegning)
  - **feil i egen kode:** strekkoden i den loggede URL-en (funnet av egen loggtest), et skjema som ble bygd på nytt
    og mistet `onSuccess` (funnet av Playwright, ikke av komponenttesten), og tre Playwright-tester som traff feil
    element
  - **planen bygde på feil tall:** grensen til OFF er 15 oppslag i minuttet, ikke rundt 100. Det ble funnet da
    vilkårene faktisk ble lest, før koden ble skrevet.
- **Fase 8 (2026-10-24):** KI skrev all kode for kvitteringslesing, og i tillegg:
  - fasiten for pilotmålingen, skrevet av fra bildene av teamets kvitteringer og kontrollert av Ferdinand Risan
  - ADR-0017, foreslått og ikke godkjent
  - dokumentet om kjedeformater
  - de fiktive testkvitteringene

  Bildene av de ekte kvitteringene ble vist til KI-assistenten i chat, fordi teamet ba om det.
- Feil KI-en gjorde og fant selv i fase 8 (detaljer i kapittel 11):
  - **målingen målte først forbehandlingen:** OSD valgte feil retning, og beskjæringen fant ikke en smal kvittering.
    Første kjøring ga 0 på to av tre kvitteringer. Det ble rettet, og alle kjøringene er lagret.
  - **egne mål som var feil:**
    - minnemålingen målte en tom prosess (et bakgrunnsjobb i `sh` får ikke stdin)
    - målet «ord × sikkerhet» valgte søppeltekst
    - `singletonKey` i pg-boss gjorde ikke det KI-en trodde
  - **feil som bare den ekte kjeden fant:** en kort kvittering som lå på siden, ble ikke lest. De falske testene
    kunne ikke finne det, men røyktesten med ekte Tesseract fant det.
  - **risikoen for å tilpasse seg dataene:** parseren ble justert etter å ha sett resultatene på de samme tre
    kvitteringene den ble målt på. Tallene i ADR-0017 er derfor sannsynligvis for gode, og det står der.
- Teamets refleksjon over dette er ikke skrevet.

- Fase 9 (2026-10-24), notater:
  - **KI som oversetter og forfatter:** de 27 oppskriftene er oversatt og tilpasset av KI fra Wikibooks. Der
    originalen manglet porsjoner eller tid, anslo KI dem, og det står i hver oppskrift (`adaptationNote`). KI la også
    til 45 ingredienser med allergener og omregninger som anslag. Ingenting av dette er kontrollert av teamet, og
    appen merker det «KI-utkast».
  - **Valg av kilde:** KI leste vilkårene til Spoonacular og TheMealDB og anbefalte bort fra begge. Ønsket om at
    oppskrifter skal «hentes fra internett» ble tolket som en import fra en åpen kilde, ikke som oppslag mens appen
    kjører. Teamet godkjente planen med den tolkningen.
  - **Kontaktadressen** til Wikimedia: teamet oppga ingen, og KI brukte GitHub-profilen til repoet i stedet for en
    e-postadresse.
  - **Feil KI-en gjorde og fant selv:** avrundingen i frødata fra fase 5 (en halv løk ble en hel), en melding som
    forsvant på telefon (en kjent felle som allerede stod i CLAUDE.md), landemerker med samme navn, og fire hull i
    egne tester. Detaljer i kapittel 11.
  - **En påstand som ble rettet før den ble levert:** et utkast til kapittel 11 sa at en ny test «feilet med den
    gamle koden». Det var ikke kjørt, og teksten ble rettet.
- Teamets refleksjon over fase 9 er ikke skrevet.

- Fase 10 (2026-10-24/25), notater:
  - **KI foreslo og bestemte i praksis reglene for deling.** Planen hadde sju åpne spørsmål. Teamet godkjente med
    «godkjennt» uten å svare på dem enkeltvis, så anbefalingene til KI gjelder. Det gjelder blant annet:
    - flere husholdninger per bruker
    - at eierskapet overføres automatisk når en eier sletter kontoen
    - at allergier deles bare etter eget valg

    Dette er valg med følger for personvernet, og teamet bør ta stilling til dem selv.
  - **Behandlingsgrunnlaget** for å dele allergier (samtykke etter art. 9) er KI-ens forslag. Det er ikke en juridisk
    vurdering, og teamet har ikke vurdert det.
  - **Feil KI-en gjorde og fant selv:**
    - en løkke som spurte etter sesjonen i det uendelige, til testprosessen gikk tom for minne
    - en funksjon som kastet feil synkront i stedet for å avvise
    - to hull i egne tester (mutasjonskontrollen)
    - knappenavn som skjermlesere ville lest som «FjernOla»
    - en kappløpssituasjon i en eldre test

    Detaljer i kapittel 11.
  - **Ustabil testkjøring:** under sluttkjøringen var serveren svært belastet av et annet prosjekt. To kjøringer av
    Playwright feilet, og begge er lagret. Den ene feilen var en svakhet i en test fra fase 1, og den ble rettet.
- Teamets refleksjon over fase 10 er ikke skrevet.
- Fase 11 (2026-10-25), notater:
  - **KI valgte arkitekturen for varslene.** Planen foreslo å regne dem ut ved lesing i stedet for en jobb som lagrer
    dem (ADR-0019). Teamet godkjente med «Godkjent commit og push» uten å svare på de seks spørsmålene enkeltvis.
  - **KI skrev ordlyden** i varslene om siste forbruksdag og best før. Det er tekst om mattrygghet, og teamet bør
    lese den selv. En test stopper noen farlige fraser, men den kan ikke vite om teksten er god.
  - **Hva som er «ærlige tall»** er også KI-ens forslag: ingen anslag for ukjente verdier, andelen anslått vises, ingen
    tall per person og ikke svinn i prosent av utgiftene.
  - **Feil KI-en gjorde og fant selv:**
    - «Avvis» virket ikke når handlelisten hadde fått en ny linje etter at siden ble lastet (API-test)
    - en test for farlig ordlyd som var for bred («trygg» i «mattrygghet»)
    - to landemerker med samme navn, fordi toast-regionen fra fase 1 også het «Varsler» (axe)
    - en eldre feil ved sletting av kjøp, som den nye varselspørringen gjorde synlig (Playwright under høy last)

    Detaljer i kapittel 11.
- Teamets refleksjon over fase 11 er ikke skrevet.
- Fase 12 (2026-10-25), notater:
  - **KI leste vilkårene til Kassalapp** og skrev både hva de sier (med sitat) og sin egen tolkning, før noe kode ble
    skrevet. Konklusjonen om at Kassalapp ikke er databehandler for SmartMat, er KI-ens tolkning og ikke vurdert av
    teamet.
  - **KI fant det viktigste forbeholdet i vilkårene:** Rema 1000, Kiwi og Coop er ikke med, og det er nettopp de
    butikkene teamets egne kvitteringer kommer fra. Derfor ble egne priser grunnmuren, og Kassalapp et lag oppå.
  - **Teamet har ikke konto eller nøkkel**, så funksjonen er bygd og testet bare mot et falskt Kassalapp. Svarformatet
    bygger på eksempelet i dokumentasjonen, og OpenAPI-filen var uenig med eksempelet. KI-en kan ha tolket det feil.
  - **Feil KI-en gjorde og fant selv:** samtidige oppslag ga 500 (Playwright), ett hull i testene (mutasjonskontrollen),
    og to svakheter i eldre tester som ble synlige under høy last og ny rekkefølge. Detaljer i kapittel 11.
- Teamets refleksjon over fase 12 er ikke skrevet.
- Fase 13 (2026-10-25/27), notater:
  - **KI gjorde mer på serveren enn i tidligere faser:**
    - startet testmiljøet
    - opprettet et Docker-nett og koblet til en container i et annet prosjekt (GhostWebsite)
    - endret det prosjektets compose-fil
    - installerte systemd-timere for sikkerhetskopi
    - laget hemmeligheter (databasepassord, passfrase, tofaktornøkkel) i filer uten å skrive dem ut

    Alt var med i den godkjente planen. Endringen i det andre prosjektet var et eget spørsmål som ble godkjent sammen
    med planen («i plenum»), ikke enkeltvis.
  - **To sikkerhetssperrer i verktøyet stoppet KI-en:**
    - push av fase 12, fordi prompten sa «bare når jeg ber om det»
    - en `rm` på en variabel som i verste fall kunne vært tom

    Den første er registrert som et åpent punkt. Den andre ble rettet med `${VAR:?}` i alle skriptene.
  - **KI skrev feil påstander om sitt eget arbeid tre ganger** og rettet dem før de ble stående:
    - at stedssiden allerede brukte `aria-label`
    - at produktmellomlageret slettes etter 30 dager
    - at eksporttesten hadde feilet da tofaktorfeltene kom
  - **Kilder fra hukommelsen:** testvektorene for TOTP (RFC 6238) og listen over WCAG-kriterier er skrevet fra KI-ens
    kunnskap, ikke lest i fasen. Det står i kildelisten. At testene består, viser bare at koden og KI-ens vektorer
    stemmer overens.
  - **Måling avslørte noe manuell lesing ikke gjorde:** en `EXPLAIN` med faste verdier så fin ut, men `auto_explain`
    på de spørringene appen faktisk sendte, viste at Postgres leste alle husholdningers hendelser.
  - **Tofaktor** ble tatt med fordi planen sa «sist, hvis resten er grønt». Det er sikkerhetskritisk kode skrevet av
    KI, uten bibliotek, og bør gjennomgås særlig nøye av teamet (`lib/totp.ts`, `modules/twoFactor/`,
    `loginSecondStep` i `auth/service.ts`).
- Teamets refleksjon over fase 13 er ikke skrevet.

## Kilder i prosjektet

<!-- Lenk til ADR-er, krav, testbevis og logg som kapittelet bygger på. -->
