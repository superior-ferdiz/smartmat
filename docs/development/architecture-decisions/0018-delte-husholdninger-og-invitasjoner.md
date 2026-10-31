# ADR-0018: Delte husholdninger med engangslenke, én eier og aktiv husholdning på brukeren

**Status:** Akseptert 2026-10-24. Foreslått av KI (Claude) i planen for fase 10, og godkjent av Ferdinand Risan i chat
(«godkjennt»). Ikke gjennomgått av Linus Saxe Huseby. Utdyper [ADR-0008](0008-husholdning-fra-start.md). Se
[spesifikasjon 10](../requirements/10-husholdning.md).

## Kontekst
ADR-0008 ga alle data en `household_id` fra start, og alle har vært alene i husholdningen sin. I fase 10 skal flere
dele én husholdning. Appen har ingen e-posttjeneste (FR-AUTH-006 er utsatt), så en invitasjon kan ikke sendes på
e-post. Den som inviteres, har ofte allerede data i sin egen husholdning.

## Beslutning
- **Invitasjon med engangslenke:**
  - Eieren lager en lenke `…/bli-med#<token>` (256 bit) og deler den selv, for eksempel i en melding.
  - Bare SHA-256 av tokenet lagres.
  - Lenken utløper etter 48 timer, kan brukes én gang, og kan trekkes tilbake.
  - Tokenet står i fragmentet, så det sendes aldri til serveren i en GET og kommer ikke i logger.
  - Forsøk begrenses per bruker og per IP-adresse.
- **Flere husholdninger per bruker** (høyst 5). Den inviterte beholder sin egen husholdning, og ingenting slås
  sammen. Den aktive husholdningen lagres på brukeren (`users.active_household_id`), og sjekkes mot medlemskapet ved
  hver lesing.
- **Nøyaktig én eier per husholdning**, sikret med en delvis unik indeks. Eierskap overføres, og eieren kan ikke
  forlate husholdningen uten å overføre først.
- **Alle har alltid minst én husholdning.** Blir noen stående uten, får de en ny, tom husholdning i samme
  transaksjon.
- **Sletting av konto blokkeres ikke.** Eierskapet til en delt husholdning går til medlemmet som har vært med lengst.
- **Allergier deles bare etter eget valg**, per husholdning, og uten navn.

## Alternativer
- **Kort kode (for eksempel 8 tegn) i stedet for lenke:** lett å skrive inn, men lav entropi. Den kan gjettes uten
  streng begrensning, og den må uansett deles i en melding. Forkastet.
- **Én husholdning per bruker:** enklere, men den inviterte må slette egne data, eller de må slås sammen. En
  sammenslåing kan gi doble varer og feil budsjett. Forkastet.
- **Aktiv husholdning per sesjon:** hver enhet kunne hatt sitt eget valg, men ny innlogging ville landet i den
  eldste husholdningen. Forkastet.
- **Flere eiere:** mer fleksibelt, men to eiere kan fjerne hverandre. Forkastet inntil videre.
- **Blokkere sletting av konto til eierskapet er overført:** gjør retten til sletting (GDPR art. 17) tyngre å bruke.
  Forkastet.

## Konsekvenser
- Én migrering:
  - tabellen `household_invitations`
  - `household_members.share_allergens`
  - `users.active_household_id`
  - indeksen for én eier
- Sidene som finnes, er uendret: `session.user.householdId` betyr nå «aktiv husholdning».
- Alle endringer i medlemskap låser husholdningsraden, og samtidig bruk av samme invitasjon gir ett medlem.
- Lenken kan videresendes. Den gjelder bare én gang og i 48 timer, og eieren ser hvem som brukte den.
