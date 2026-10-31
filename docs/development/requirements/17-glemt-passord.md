# 17 – «Glemt passord» med e-post (fase 16)

**Status:** Planen ble lagt fram etter fasemalen og godkjent 2026-10-31. Ferdinand Risan skrev i chat: «Godkjent av
alle i gruppa i plenum». Det er registrert som Ferdinands erklæring; Linus Saxe Huseby og Hasan Alhafni har ikke
bekreftet det selv i en økt. De sju åpne spørsmålene i planen ble ikke besvart enkeltvis, så anbefalingene gjelder
(se under). Spesifikasjonen er skrevet av KI (Claude) før implementeringen.

**Bygger på:** FR-AUTH-002/003/006/008/009/010, NFR-SEC-001–005 i [00-kravoversikt.md](00-kravoversikt.md),
ADR-0005, ADR-0015, ADR-0021 og [ADR-0024](../architecture-decisions/0024-e-post-via-smtp.md). Beslutningsnotatet
«Hva e-post krever» i [13-sikkerhet-drift.md](13-sikkerhet-drift.md).

FR-AUTH-006 er bare **delvis** gjort: tilbakestilling av passord. E-postverifisering, endring av e-postadresse,
invitasjoner på e-post og varsler på e-post er fortsatt utsatt.

## Teamets beslutninger (2026-10-31)

- Engangslenke på e-post med tokenet etter `#`, bare SHA-256 lagret, 30 minutter, kan brukes én gang.
- Samme svar uansett om adressen har en konto.
- Nytt passord etter samme regler som ellers (12 tegn, Pwned Passwords).
- Alle økter logges ut, og kontoen får et varsel. Tofaktor gjelder fortsatt.
- Sendes i bakgrunnen (pg-boss) via SMTP bak `providers/`. Av uten SMTP-oppsett.
- Avsender: Gmail-kontoen `Ghostnetwork.bot@gmail.com` med et eget app-passord for SmartMat (Ferdinands valg).
  *Endret 2026-10-31, senere samme dag:* Ferdinand ba Claude fylle inn passordet fra Risan Solutions («Fyll inn passordet fra Risan Solutions siden du har min godkjenning»). SmartMat bruker derfor **samme app-passord** som Risan Solutions, ikke et eget.
  Innstillingene står bare i `docker/staging/.env.staging`, som Git ignorerer. Google blir mottaker av
  e-postadressen og innholdet i e-posten.

## Avgjørelser tatt ved godkjenningen (anbefalingene i planen)

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Databehandleravtale | En vanlig Gmail-konto har ingen databehandleravtale (art. 28). Akseptert for det lukkede testmiljøet, men står som åpen risiko i ADR-0024 og kapittel 12. Teamet må vurdere det før noe annet enn testmiljøet. |
| 2 | Hvem sender | En egen prosess, `mailer` (`src/mailer.ts`), i en egen container med utgang til internett. OCR-workeren er fortsatt uten internett. |
| 3 | Varselet etter bytte | En e-post «Passordet ditt er endret». Alle økter er slettet, så et varsel i appen ville ikke vises noe sted. |
| 4 | Avsender | `Ghostnetwork.bot@gmail.com`, som står i `.env.staging`. Risan Solutions-prosjektet røres ikke. |
| 5 | Registrering med en adresse som finnes | Svarer fortsatt 409. Det krever e-postverifisering og er ikke med. |
| 6 | Dokumentasjon fra fase 15 som ikke var committet | Ble med over på `fase-16`. Committes når teamet ber om det. |
| 7 | Diskplass | Sjekkes med `df -h /` før hvert Docker-bygg. Bare SmartMats egne images ryddes. |

## FR-AUTH-006a Be om lenke

- `POST /api/v1/auth/password-reset` med `{ email }`. Ikke innlogget; Origin-sjekken gjelder som for innlogging.
- Svaret er alltid **202** uten innhold, enten adressen har en konto eller ikke. Siden sier: «Hvis adressen har en
  konto, har vi sendt en lenke. Den virker i 30 minutter.»
- Ugyldig adresse gir 400 med feltfeil, som ved innlogging (det sier ingenting om kontoer).
- Grense per IP-adresse: `RATE_LIMIT_PASSWORD_RESET_MAX` (standard 5) per 15 minutter, for hvert av de to
  endepunktene (forespørsel og bekreftelse). Over grensen: 429.
- Grense per konto: høyst `PASSWORD_RESET_PER_HOUR` (standard 3) e-poster i timen. Forespørsler over grensen gir
  samme 202, men ingen e-post. Det hindrer at noen bruker skjemaet til å fylle innboksen til en annen.
- Når kontoen finnes, legges en jobb i køen med bare `userId` og tidspunktet. Verken e-postadressen eller tokenet
  står i jobben.

## FR-AUTH-006b Engangslenken

- Tokenet lages av `mailer` når e-posten sendes: 32 tilfeldige byte (`randomBytes`), base64url (43 tegn).
  Databasen lagrer bare SHA-256 av det (`password_reset_tokens.token_hash`).
- Lenken er `<første APP_ORIGINS>/nytt-passord#<token>`. Tokenet står etter `#`, så nettleseren sender det aldri til
  serveren, og det havner ikke i logger eller `Referer` (appen sender `Referrer-Policy: no-referrer`).
- Lenken virker i 30 minutter fra den ble laget, og bare én gang.
- En ny lenke gjør de eldre, ubrukte lenkene til samme konto ugyldige.
- En jobb som ikke er sendt innen 30 minutter etter forespørselen, droppes (en gammel lenke ingen venter på).
- Mislykkes sendingen, gjøres lenken ugyldig med en gang, og jobben prøves på nytt (høyst 2 ganger).
- Nettsiden leser tokenet fra `#`, fjerner det fra adresselinjen med en gang (`replace`) og sender det bare i
  forespørselens body.

## FR-AUTH-006c Nytt passord

- `POST /api/v1/auth/password-reset/confirm` med `{ token, newPassword }`.
- Ukjent, brukt eller utløpt lenke gir alltid **400 `errors.auth.resetLinkInvalid`**, uten å si hvilken av dem.
- Det nye passordet følger `newPasswordSchema` (12–128 tegn) og Pwned Passwords (FR-AUTH-008), med feltfeil på
  `newPassword`. En lenke som får avslag på passordet, er fortsatt ubrukt.
- Svaret er **204**. Brukeren blir **ikke** logget inn: siden sender videre til innlogging.

## FR-AUTH-006d Etter byttet

Alt i én transaksjon, med en betinget `updateMany` på lenken (`used_at IS NULL AND expires_at > now`), så to
samtidige forsøk med samme lenke gir ett bytte og ett avslag:

- passordhashen byttes, og sperren etter mislykkede innlogginger nullstilles (FR-AUTH-003);
- **alle** økter slettes (FR-AUTH-009), også den som eventuelt er åpen i nettleseren;
- ventende tofaktor-utfordringer slettes (FR-AUTH-010);
- andre ubrukte lenker til kontoen gjøres ugyldige.

Tofaktor er fortsatt på: neste innlogging krever passord **og** kode. Etterpå legges en jobb i køen for e-posten
«Passordet ditt er endret» (med en oppfordring om å ta kontakt hvis det ikke var deg). Mislykkes det å legge jobben i
køen, er passordet likevel byttet; feilen logges uten personopplysninger.

## FR-AUTH-006e Av uten oppsett

- E-post er på bare når `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` og `MAIL_FROM` alle er satt. Mangler én, er den av.
- Av: begge endepunktene svarer **503 `errors.auth.passwordResetUnavailable`**, og siden sier at funksjonen ikke er
  tilgjengelig og at man må kontakte teamet. Resten av appen virker som før (NFR-REL-002).
- `mailer` uten oppsett logger navnene (ikke verdiene) som mangler, og venter uten å sende noe.

## E-posten

- Ren tekst, på kontoens språk (`users.locale`: nb-NO eller en). Ingen HTML, ingen bilder, ingen sporing.
- Avsender `MAIL_FROM_NAME <MAIL_FROM>` (standard «SmartMat»). Emne: «Nytt passord til SmartMat» /
  «Passordet ditt i SmartMat er endret».
- SMTP over STARTTLS (port 587) eller TLS (465). Kryptering kreves (`requireTLS`). Tidsavbrudd 10 s for tilkobling og
  20 s totalt.
- Loggen får bare jobb-id, utfall og feilkoden fra SMTP (`EAUTH`, `ECONNECTION` …), aldri adressen, tokenet eller
  svarteksten fra serveren (den kan inneholde adressen).

## Datamodell

`password_reset_tokens`: `id`, `user_id` (CASCADE når kontoen slettes), `token_hash` (unik, 64 tegn), `created_at`,
`expires_at`, `used_at`. Ingen `household_id`: raden tilhører kontoen, ikke husholdningen.

- Nattjobben (workeren, `session-cleanup`) sletter rader som er eldre enn 24 timer.
- Eksporten (`/me/export`, FR-PRIV-001) tar dem **ikke** med, på samme måte som tofaktor-utfordringene: de er
  kortlivde sikkerhetsdata uten innhold for brukeren (bare tidspunkter og en hash). Testet i
  `passwordReset.api.test.ts`.

## Ikke med

E-postverifisering ved registrering, endring av e-postadresse, e-post ved vanlig passordbytte (`/me/password`),
invitasjoner og varsler på e-post, HTML-e-post, egen leverandør med databehandleravtale. Feilen ved registrering i
Brave er utenfor fasen.

## Sporbarhet

Testene nevner krav-ID-en (`FR-AUTH-006a` … `FR-AUTH-006e`), så `node scripts/traceability.mjs` finner dem.
