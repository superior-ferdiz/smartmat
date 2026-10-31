# Gmail som avsender (SMTP)

**Lest 2026-10-31 av KI (Claude)**, mens fase 16 ble bygd. Teamet har ikke lest sidene selv. Kildene er Googles
hjelpesider om [app-passord](https://support.google.com/accounts/answer/185833),
[sendegrenser i Gmail](https://support.google.com/mail/answer/22839) og
[Gmail Program Policies](https://support.google.com/mail/answer/16734397). Sitatene er gjengitt slik de sto
2026-10-31. Googles generelle vilkår og personvernerklæring er **ikke** lest i denne fasen.

## Hva tjenesten er
SmartMat sender e-posten for «Glemt passord» (spesifikasjon 17, ADR-0024) gjennom Gmails SMTP-server
(`smtp.gmail.com`, port 587, STARTTLS) med Gmail-kontoen `Ghostnetwork.bot@gmail.com`. Ferdinand Risan valgte kontoen
2026-10-31, først med et eget app-passord for SmartMat; senere samme dag ba han om at SmartMat bruker **samme
app-passord som Risan Solutions**. Kontoen brukes også av Risan Solutions.

## Hva sidene sier (sitat)

| Tema | Sitat |
|---|---|
| Anbefaling | «App passwords aren't recommended and are unnecessary in most cases.» |
| Krav | «App passwords can only be used with accounts that have 2-Step Verification turned on.» |
| Passordbytte | «we revoke your app passwords when you change your Google Account password» |
| Sendegrense | Grensen kan nås ved «more than 500 emails sent in a day» eller én e-post til «more than 500 recipients in a single email». Etterpå skal man kunne sende igjen «within 1 to 24 hours». |
| Søppelpost | «Don't use Gmail to distribute spam or unsolicited commercial mail.» |
| Håndheving | Google kan «limiting or terminating a user's access» etter et mulig brudd. |

Sidene sier ingenting om SMTP fra apper eller om e-post som sendes automatisk (som en lenke for nytt passord).

## Vår tolkning (ikke juridisk råd)
- **Mulig for testmiljøet:** e-postene sendes bare når en bruker ber om det, til én mottaker, og er ikke reklame.
  Med høyst 3 e-poster per konto i timen er vi langt under 500 per dag.
- **Delt konto:** kvoten på 500 per dag deles med Risan Solutions. Bytter noen passordet på Google-kontoen, slutter
  e-posten fra SmartMat å virke til et nytt app-passord er lagt inn (`SMTP_PASSWORD` i `.env.staging`). Appen virker
  likevel: jobben feiler med en feilkode i loggen til `mailer`, og ingen lenke blir gyldig.
- **Ingen databehandleravtale:** en vanlig Gmail-konto har ingen avtale etter GDPR art. 28 slik Google Workspace har
  (KI-kunnskap, ikke lest i Googles vilkår denne fasen). Google får mottakerens e-postadresse, navnet i kontoen og
  innholdet i e-posten. Akseptert for det lukkede testmiljøet; må vurderes av teamet før noe annet (ADR-0024).
- **Avsenderadresse:** e-posten kommer fra en `@gmail.com`-adresse, så SPF/DKIM er Googles. Vi trenger ikke egne
  DNS-oppføringer, men kan heller ikke sende fra et eget domene med denne løsningen.

## Hva vi gjør
- Bare SMTP med kryptering (`requireTLS`), tidsavbrudd 10 s for tilkobling og 20 s totalt.
- Ren tekst, ingen sporing, ingen vedlegg. En e-post per forespørsel, til kontoens egen adresse.
- App-passordet ligger bare i `docker/staging/.env.staging` (ignorert av Git), aldri i repoet, chatten eller loggene.
- Loggen får bare jobb-id, utfall og SMTP-feilkoden (`EAUTH`, `ECONNECTION` …).

## Hva teamet må gjøre
- Lese sidene over og Googles vilkår selv, og bekrefte eller endre tolkningen.
- Vurdere en leverandør med databehandleravtale i EØS før appen brukes av andre enn teamet.
- ~~Fylle inn `SMTP_PASSWORD` i `.env.staging`.~~ Gjort 2026-10-31: kopiert fra Risan Solutions av Claude på
  Ferdinands forespørsel, uten å vise verdien. Vurdere et eget app-passord senere, så et bytte bare rammer ett prosjekt.
