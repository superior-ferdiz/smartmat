# Lukket testmiljø (smartmat.risansolutions.no)

**Status 2026-10-27 (fase 13):**
- DNS peker på serveren (A 78.46.83.188 og AAAA 2a01:4f8:120:104b::2, sjekket 2026-10-25).
- Containerne `smartmat-staging-db`, `smartmat-staging-app` og `smartmat-staging-worker` kjører.
- Appen er på det egne nettet `smartmat-edge` sammen med Caddy, ikke på `ghostweb`
  ([ADR-0022](architecture-decisions/0022-eget-nett-for-caddy-og-smartmat.md)).
- Nattlig, kryptert sikkerhetskopi kjører ([ADR-0021](architecture-decisions/0021-sikkerhetskopi-og-gjenoppretting.md)).
- **Caddy-blokken er lagt inn 2026-10-27.** `https://smartmat.risansolutions.no` krever basic auth (brukernavn
  `smartmat`) og svarer over IPv4 og IPv6 med sertifikat fra Let's Encrypt (bevis: `26-caddy-https.txt`).
  - Passordet er tilfeldig, laget av Claude rett i en fil og aldri vist i chatten:
    `/opt/Websites/smartmat-private/testmiljo-passord.txt` (0600). Teamet leser det der.
  - Første forsøk med kommandoen fra Claude ga `EOF`, fordi `printf '%s'` ikke sendte linjeskift til
    `caddy hash-password`.
- **Ingen kontoer i appen ennå:** registreringen er stengt. Kontoer lages med `create-user` (se under).

Beslutningen står i [ADR-0015](architecture-decisions/0015-lukket-testmiljo.md).

## Hva som trengs først

| Hva | Hvem | Status |
|---|---|---|
| DNS: A/AAAA-post for `smartmat.risansolutions.no` til serveren | Ferdinand | Gjort (sjekket 2026-10-25) |
| Passord for basic auth | Claude (etter Ferdinands spørsmål 2026-10-27) | Gjort: tilfeldig, i `smartmat-private/testmiljo-passord.txt` |
| Kontoer til teamet med `create-user` (e-post og navn) | Teamet | Ikke gjort |
| Ta vare på backup-passfrasen (`/etc/smartmat-backup/passphrase`) og `TOTP_ENCRYPTION_KEY` (i `docker/staging/.env.staging`) et annet sted enn serveren, for eksempel i en passordbehandler | Ferdinand | Ikke gjort |
| Kontaktadresse i User-Agent til Open Food Facts | Teamet | Ikke valgt |
| Fylle ut API-skjemaet til Open Food Facts (se [integrasjonen](integrations/open-food-facts.md)) | Teamet | Ikke gjort |

## Oppsett (når DNS peker til serveren)

1. **Sjekk disken** (`df -h /`). Bildet er rundt 1,1 GB (med Tesseract fra fase 8).
2. **Eget nett** (én gang, ADR-0022): `docker network create --subnet 192.168.252.0/28 --label smartmat=edge
   smartmat-edge` og `docker network connect smartmat-edge ghostwebsite-caddy-1`. Nettet står også i
   `/opt/GhostWebsite/docker-compose.yml`.
3. **Miljøvariabler:** `cp docker/staging/.env.staging.example docker/staging/.env.staging` og fyll inn (0600, ignorert
   av Git):
   - `STAGING_POSTGRES_PASSWORD` og `TOTP_ENCRYPTION_KEY`: tilfeldige verdier, for eksempel med `openssl rand`
   - `TRUST_PROXY=192.168.252.0/28`
   - `PWNED_PASSWORDS=on`
   - `BACKUP_STATUS_FILE=/run/smartmat-backup/status.json`
4. **Start:** `docker compose -f docker/staging/compose.yml --env-file docker/staging/.env.staging up -d --build`.
   Containeren kjører migreringene og legger inn ingredienslisten selv. Den har ingen åpne porter. Workeren
   (`smartmat-staging-worker`) starter fra samme bilde og leser kvitteringskøen. Slå kvitteringslesing av med
   `OCR_PROVIDER=off`.
5. **Kontoer** (registreringen er stengt):
   `docker exec -it smartmat-staging-app npm run -s create-user -w @smartmat/api -- --email … --name …`.
   Passordet skrives inn i terminalen og vises ikke.
6. **Sikkerhetskopi** (ADR-0021): passfrase i `/etc/smartmat-backup/passphrase` (0600), og så
   `systemctl link` for enhetene i `docker/backup/systemd/` og `systemctl enable --now smartmat-backup.timer
   smartmat-backup-check.timer smartmat-restore-test.timer`. Test skriptene med `docker/backup/test-backup.sh`.
7. **Caddy:** legg inn blokken under. Caddyfile er én fil som er montert inn i containeren. Rediger den på
   stedet (ikke lagre en ny fil over den, da ser containeren fortsatt den gamle). Sjekk først, last så inn på nytt:
   `docker exec ghostwebsite-caddy-1 caddy validate --config /etc/caddy/Caddyfile`, deretter
   `docker exec ghostwebsite-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.

### Caddy-blokk (lagt inn 2026-10-27)

Passordhashen lages med `docker exec -it ghostwebsite-caddy-1 caddy hash-password`. Den står bare i Caddyfile,
aldri i SmartMat-repoet.

```caddyfile
smartmat.risansolutions.no {
	# Lukket testmiljø (SmartMat, ADR-0015): bare teamet kommer inn.
	basic_auth {
		smartmat <bcrypt-hash fra caddy hash-password>
	}
	reverse_proxy smartmat-staging-app:3000 {
		# Overskriv, ikke legg til: API-et stoler bare på dette hodet fra smartmat-edge (TRUST_PROXY, ADR-0022).
		header_up X-Forwarded-For {remote_host}
		# Passordet til basic auth skal ikke videre til appen.
		header_up -Authorization
	}
	encode gzip
	header {
		X-Robots-Tag "noindex, nofollow"
		-Server
	}
}
```

- **Ikke kopier** header-blokken fra risansolutions.no. Den har `Permissions-Policy: camera=()`, som slår av
  kameraet. Appen sender selv `camera=(self)`, CSP, HSTS, `Referrer-Policy: no-referrer`, COOP og CORP
  (NFR-SEC-006). Fase 13: `Referrer-Policy` er tatt ut av blokken, fordi Caddy og appen da sendte to ulike.
- Blokken har ingen `log`, så Caddy skriver ingen tilgangslogg for SmartMat.

## Oppdatere og ta ned
- **Ny versjon:** `git pull` på riktig gren, og så samme `up -d --build`. Migreringene kjøres ved oppstart.
- **Ta ned:** `docker compose -f docker/staging/compose.yml down`. Databasen ligger igjen i volumet
  `smartmat_staging_pgdata`. Det slettes bare med vilje (`docker volume rm smartmat_staging_pgdata`).
- Fjern også Caddy-blokken, ellers svarer Caddy med feil for domenet.

## Sjekkliste for test på ekte telefon (manuell, ikke utført)

Teamet fyller ut tabellen når testen faktisk er gjort. Bevis legges i `docs/evidence/`.

| # | Hva | Android Chrome | iPhone Safari |
|---|---|---|---|
| 1 | Basic auth spør om passord, og innloggingen virker | | |
| 2 | Banneret «Testmiljø» vises | | |
| 3 | «Start kamera» spør om tilgang. Bakkameraet brukes. | | |
| 4 | En vanlig EAN-13 på en vare leses, og skjemaet fylles ut | | |
| 5 | En EAN-8 (liten pakke) leses | | |
| 6 | Si nei til kameraet → teksten «Ingen tilgang til kameraet» | | |
| 7 | Bytt fane mens kameraet går → kameralyset slukker | | |
| 8 | Ukjent strekkode → tomt skjema, og den huskes neste gang | | |
| 9 | Vekt- eller prisvare fra disken (starter med 2) → «Butikkens egen kode» | | |
| 10 | Ingen horisontal rulling, knappene er lette å treffe | | |
| 11 | Kvittering: «Ta bilde» åpner bakkameraet, bildet lastes opp, og siden viser «Leser kvitteringen …» | | |
| 12 | Kvittering: butikk, dato og total er fylt ut. «Bekreft kjøpet» lagrer, og bildet forsvinner fra listen. | | |
| 13 | Kvittering: et uskarpt bilde gir «Kunne ikke leses» med «Prøv igjen» og «Fyll inn selv» | | |
| 14 | Kvittering: kontroller at det lagrede bildet ikke har GPS (be Claude lese EXIF fra databasen) | | |
