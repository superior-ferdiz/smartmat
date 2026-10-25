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

## Kilder i prosjektet

<!-- Lenk til ADR-er, krav, testbevis og logg som kapittelet bygger på. -->
