# Lukket testmiljø (smartmat.risansolutions.no)

**Fase 8 (2026-10-24):** Bildet har nå Tesseract, og compose-oppsettet har en tredje container,
`smartmat-staging-worker`, som leser kvitteringer. Den er bare på det interne nettverket (uten internett) og har
`mem_limit: 512m`. Bildet ble bygd på nytt 2026-10-24 (1,08 GB), og Tesseract og sharp ble kontrollert inni det.
Containerne er ikke startet.

**Status 2026-10-22:** Koden og Docker-oppsettet er ferdig og testet lokalt (bildet ble bygd og røyktestet med
midlertidige containere på serveren, som så ble fjernet). **Ikke satt opp:** DNS finnes ikke ennå, Caddy er ikke
endret, og ingen containere for testmiljøet kjører. Beslutningen står i
[ADR-0015](architecture-decisions/0015-lukket-testmiljo.md).

## Hva som trengs først

| Hva | Hvem | Status |
|---|---|---|
| DNS: A/AAAA-post for `smartmat.risansolutions.no` til serveren | Ferdinand | Ikke gjort |
| Passord for basic auth (brukernavn og passord teamet deler) | Teamet | Ikke valgt |
| Kontaktadresse i User-Agent til Open Food Facts | Teamet | Ikke valgt |
| Fylle ut API-skjemaet til Open Food Facts (se [integrasjonen](integrations/open-food-facts.md)) | Teamet | Ikke gjort |

## Oppsett (når DNS peker til serveren)

1. **Sjekk disken** (`df -h /`). Bildet er rundt 1,1 GB (med Tesseract fra fase 8).
2. **Miljøvariabler:** `cp docker/staging/.env.staging.example docker/staging/.env.staging` og fyll inn.
   Filen er ignorert av Git. Sjekk at `TRUST_PROXY` er nettet til `ghostweb`:
   `docker network inspect ghostweb --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'` (172.26.0.0/16 per
   2026-10-22).
3. **Start:** `docker compose -f docker/staging/compose.yml --env-file docker/staging/.env.staging up -d --build`.
   Containeren kjører migreringene og legger inn ingredienslisten selv. Den har ingen åpne porter. Workeren
   (`smartmat-staging-worker`) starter fra samme bilde og leser kvitteringskøen. Slå kvitteringslesing av med
   `OCR_PROVIDER=off`.
4. **Kontoer** (registreringen er stengt):
   `docker exec -it smartmat-staging-app npm run -s create-user -w @smartmat/api -- --email … --name …`.
   Passordet skrives inn i terminalen og vises ikke.
5. **Caddy:** legg inn blokken under. Caddyfile er én fil som er montert inn i containeren. Rediger den på
   stedet (ikke lagre en ny fil over den, da ser containeren fortsatt den gamle). Sjekk først, last så inn på nytt:
   `docker exec ghostwebsite-caddy-1 caddy validate --config /etc/caddy/Caddyfile`, deretter
   `docker exec ghostwebsite-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.

### Caddy-blokk (forslag, ikke lagt inn)

Passordhashen lages med `docker exec -it ghostwebsite-caddy-1 caddy hash-password`. Den står bare i Caddyfile,
aldri i SmartMat-repoet.

```caddyfile
smartmat.risansolutions.no {
	# Lukket testmiljø (SmartMat, ADR-0015): bare teamet kommer inn.
	basic_auth {
		smartmat <bcrypt-hash fra caddy hash-password>
	}
	reverse_proxy smartmat-staging-app:3000 {
		# Overskriv, ikke legg til: API-et stoler bare på dette hodet fra ghostweb (TRUST_PROXY).
		header_up X-Forwarded-For {remote_host}
		# Passordet til basic auth skal ikke videre til appen.
		header_up -Authorization
	}
	encode gzip
	header {
		X-Robots-Tag "noindex, nofollow"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
}
```

- **Ikke kopier** header-blokken fra risansolutions.no. Den har `Permissions-Policy: camera=()`, som slår av
  kameraet. Appen sender selv `camera=(self)`, CSP og HSTS.
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
