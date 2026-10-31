# ADR-0021: Nattlig, kryptert sikkerhetskopi uten kvitteringsbilder, med full lesetest ved gjenoppretting

**Status:** Akseptert 2026-10-25. Foreslått av KI (Claude) i planen for fase 13 og godkjent av Ferdinand Risan i chat
(«Godkjennt i plenum, vennligst fortsett!»; «i plenum» er registrert som hans erklæring). Ikke gjennomgått av Linus
Saxe Huseby. Endrer «Ingen sikkerhetskopier» i [ADR-0015](0015-lukket-testmiljo.md). Se
[spesifikasjon 13](../requirements/13-sikkerhet-drift.md) (NFR-OPS-001–003).

## Kontekst
- Testmiljøet hadde ingen sikkerhetskopi. Det har bare testdata, men det samme oppsettet skal kunne brukes hvis appen
  åpnes for andre.
- To krav fra tidligere faser:
  - Kvitteringsbilder (spesifikasjon 08) skal ikke ligge lenger enn 7 dager.
  - En sikkerhetskopi må enten utelate dem, eller ha like kort slettefrist.
- Fra et annet prosjekt på samme server vet vi at `pg_restore --list` alene ikke beviser at dataene kan leses: den
  viser bare innholdslisten.
- Appen har ingen e-posttjeneste, så et varsel kan ikke sendes på e-post.

## Beslutning
1. **Hva:** `pg_dump --format=custom` av testmiljøets database hver natt (systemd-timer kl. 02.30 Oslo-tid).
   - Uten data fra `receipt_images`, `receipt_extractions` og jobbkøen (`pgboss.*`). Tabellene er med, tomme.
   - Pilotdataene for OCR ligger utenfor databasen og er aldri med.
2. **Kryptering:** dumpen går rett gjennom `gpg --symmetric --cipher-algo AES256` til disk, så ingen ukryptert kopi
   skrives.
   - Passfrasen ligger i `/etc/smartmat-backup/passphrase` (root, 0600), aldri i repoet eller chatten.
   - `backup.sh` nekter å kjøre hvis filen kan leses av andre.
3. **Lagring:** `/var/backups/smartmat/` (0700). De 7 nyeste beholdes.
4. **Manifest fra samme øyeblikksbilde:** en egen økt eksporterer et øyeblikksbilde (`pg_export_snapshot`).
   `pg_dump --snapshot` og lesingen av manifestet (antall rader og md5 av alle rader per tabell) bruker begge dette
   øyeblikksbildet.
5. **Test av gjenoppretting** (`restore-test.sh`, hver søndag og manuelt):
   - nyeste kopi dekrypteres og gjenopprettes i en midlertidig Postgres-container uten nettverk
   - **alle rader i alle tabeller** leses og sammenlignes med manifestet
   - kvitteringstabellene skal finnes og være tomme
   - containeren fjernes etterpå
6. **Varsel uten e-post:**
   - `check-backup.sh` kjører hver time og feiler hvis nyeste kopi er eldre enn 26 timer eller ikke kan
     dekrypteres. Da blir systemd-enheten «failed» (`systemctl --failed`, journalen).
   - Sjekken skriver en statusfil (bare tidspunkter), montert skrivebeskyttet i appen. Testmiljøet viser et banner
     når kopien ikke er ok.
   - Appen regner også en status som «gammel» hvis selve sjekken ikke har kjørt på 26 timer.

## Alternativer
- **Bare `pg_restore --list` som test:** rask, men finner ikke tapte eller ødelagte rader. Forkastet.
- **Ta med kvitteringsbildene, med 7 dagers slettefrist på kopiene:** like kort frist, men bildene ville ligget i
  enda en kopi, og en gjenoppretting kunne hentet tilbake bilder som allerede var slettet i appen. Forkastet.
- **restic eller borg med kopi til en annen maskin:** bedre vern mot tap av serveren. Krever et sted å lagre (kostnad,
  databehandler) og et valg fra teamet. Utsatt (avgjørelse 5 i spesifikasjon 13).
- **`age` i stedet for gpg:** enklere nøkkelhåndtering, men ikke installert på serveren. gpg finnes allerede.

## Konsekvenser
- **Gjenoppretting** krever passfrasen. Kontoer med tofaktorinnlogging krever i tillegg `TOTP_ENCRYPTION_KEY` fra
  `docker/staging/.env.staging`. Begge må tas vare på utenfor serveren, ellers er kopiene verdiløse hvis serveren
  forsvinner.
- **Kopiene ligger på samme server** som databasen. De beskytter mot sletting, feil og ødelagte data, ikke mot at
  disken eller serveren går tapt.
- **En slettet konto** kan ligge i en kopi i opptil 7 dager. Det står i personvernerklæringen.
- **Testen** av skriptene (`test-backup.sh`) bruker en egen database med oppdiktede data, aldri testmiljøets egen.
