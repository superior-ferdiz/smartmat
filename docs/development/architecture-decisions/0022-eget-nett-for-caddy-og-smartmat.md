# ADR-0022: Eget Docker-nett for Caddy og SmartMat

**Status:** Akseptert 2026-10-25. Foreslått av KI (Claude) i planen for fase 13 og godkjent av Ferdinand Risan i chat
(«Godkjennt i plenum, vennligst fortsett!»). Ikke gjennomgått av Linus Saxe Huseby. Endrer nettverksdelen av
[ADR-0015](0015-lukket-testmiljo.md). Se [spesifikasjon 13](../requirements/13-sikkerhet-drift.md) (NFR-SEC-007).

## Kontekst
- **Slik var det:** i ADR-0015 var appen koblet til `ghostweb`, nettet som Caddy-containeren deler med 17 andre
  containere fra andre prosjekter på serveren. API-et trodde `X-Forwarded-For` fra hele det nettet
  (`TRUST_PROXY=172.26.0.0/16`).
- **Restrisikoen:** hvilken som helst av de andre containerne kunne sende en forespørsel med en falsk klientadresse,
  og dermed få en ny rate limit for hver forespørsel. De tilhører samme eier, men en feil eller et innbrudd i ett av de
  andre nettstedene kunne brukes mot SmartMat.

## Beslutning
- **Nytt nett:** `smartmat-edge` (192.168.252.0/28), opprettet én gang med
  `docker network create --subnet 192.168.252.0/28 --label smartmat=edge smartmat-edge`.
- **Bare to deltakere:** Caddy-containeren (`ghostwebsite-caddy-1`) og `smartmat-staging-app`.
- **Appen er ikke lenger på `ghostweb`.** Den når internett (Open Food Facts, Kassalapp, Have I Been Pwned) gjennom
  `smartmat-edge`, som er et vanlig bridge-nett.
- **Proxy-tillit:** `TRUST_PROXY=192.168.252.0/28`.
- **Caddy ble koblet til** med `docker network connect smartmat-edge ghostwebsite-caddy-1`, uten omstart.
  - Nettet står også i GhostWebsite-prosjektets `docker-compose.yml`, så det kommer med hvis containeren lages på nytt.
  - Det er en endring i et annet prosjekt, gjort med Ferdinands godkjenning. Kopi av filen før endringen:
    `/opt/Websites/smartmat-private/ghostwebsite-docker-compose.yml.bak-2026-10-25`.

## Alternativer
- **Bli på `ghostweb`:** ingen endring i andre prosjekter, men restrisikoen står. Forkastet.
- **Fast IP-adresse for Caddy og `TRUST_PROXY` på én adresse:** enda strammere. Det krever at adressen settes i
  GhostWebsite-prosjektet, og /28-nettet har uansett bare de to. Unødvendig.

## Konsekvenser
- Bare Caddy kan bestemme hvilken klientadresse API-et ser.
- **Andre containere på `ghostweb` når ikke lenger appen.** Det er sjekket at de andre nettstedene (risansolutions.no
  og ghostnetwork.no) fortsatt svarer etter tilkoblingen.
- **Rekkefølgen ved ny server:** nettet må lages før både SmartMat og GhostWebsite startes (det står i
  `testmiljo.md`).
- Standardruten til Caddy er uendret (`caddy-edge` har `gw_priority: 10`).
