# ADR-0024: E-post via SMTP fra en egen mailer-prosess, foreløpig med en Gmail-konto

**Status:** Akseptert 2026-10-31. Foreslått av KI (Claude) i planen for fase 16 og godkjent av Ferdinand Risan i chat
(«Godkjent av alle i gruppa i plenum»; «alle i gruppa» er registrert som hans erklæring). Linus Saxe Huseby og Hasan
Alhafni har ikke bekreftet det selv i en økt. Se [spesifikasjon 17](../requirements/17-glemt-passord.md) og
[integrations/gmail-smtp.md](../integrations/gmail-smtp.md).

## Kontekst
- FR-AUTH-006 var utsatt fordi appen ikke hadde noen e-posttjeneste. Beslutningsnotatet i spesifikasjon 13 krevde en
  leverandør, en ADR og dokumenterte vilkår før kode.
- 2026-10-31 kom teamet ikke inn på kontoene sine i testmiljøet og hadde ingen måte å få et nytt passord på.
- Ferdinand valgte Gmail-kontoen som Risan Solutions bruker, først med et eget app-passord for SmartMat. Senere samme
  dag ba han om at SmartMat bruker **samme app-passord** som Risan Solutions, og Claude kopierte det inn uten å vise det.
- OCR-workeren står på et internt nett uten internett (spesifikasjon 08), slik at et kvitteringsbilde aldri kan
  sendes ut fra den.

## Beslutning
1. **SMTP bak `providers/mail/`** (`MailSender`), med nodemailer (MIT-0, låst til 10.1.7: eldre versjoner har kjente
   sårbarheter). Kryptering kreves, med tidsavbrudd. Av uten `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` og `MAIL_FROM`.
2. **En egen prosess, `mailer`** (`src/mailer.ts`), som tar jobbene fra pg-boss-køen `mail`. Den får en egen
   container i testmiljøet, koblet til det interne nettet og et eget nett med utgang (`smartmat-staging-mail`).
   Workeren er fortsatt uten internett.
3. **En jobb har bare konto-id og tidspunkt.** Mailer-prosessen lager tokenet når e-posten sendes, så verken token eller
   adresse står i `pgboss`-tabellene (som ikke er med i sikkerhetskopien uansett, ADR-0021).
4. **Avsender foreløpig `Ghostnetwork.bot@gmail.com`** med app-passord. Bare for det lukkede testmiljøet.

## Alternativer
- **Workeren sender:** krever internett i containeren som leser kvitteringsbilder. Forkastet.
- **App-prosessen sender selv:** én container mindre, men webserveren må vente på SMTP og gjøre jobbkø-arbeid.
- **Leverandør med databehandleravtale i EØS** (for eksempel Brevo eller Mailjet, ikke lest): riktig for produksjon,
  men krever konto, vilkår og DNS for et eget domene. Ikke valgt av teamet nå.

## Konsekvenser
- «Glemt passord» virker når app-passordet er fylt inn. Uten det sier siden at funksjonen ikke er tilgjengelig.
- **Åpen risiko:** ingen databehandleravtale med Google. Google mottar e-postadresse, navn og innholdet i e-posten.
  Kapittel 12 og `/personvern` sier det. Må vurderes før noe annet enn testmiljøet.
- Kvoten (500 e-poster per dag) og **app-passordet** deles med Risan Solutions. Trekkes app-passordet tilbake (eller
  byttes passordet på Google-kontoen), stopper e-posten fra begge prosjektene. Lekker det fra SmartMat, må det byttes
  også hos Risan Solutions.
- Ny avhengighet (nodemailer) og en ny container å drifte.
