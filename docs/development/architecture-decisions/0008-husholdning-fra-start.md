# ADR-0008: Alle data tilhører en husholdning fra første migrering

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Deling i husholdning kommer sent i veikartet, men å legge det til i ettertid krever endring av alle tabeller og spørringer.

## Beslutning
Alle husholdningsdata (lager, kjøp, budsjett, handlelister, måltidsplaner, svinn) har `household_id`. Ved registrering
opprettes en husholdning med brukeren som eneste medlem (rolle `owner`). All tilgang sjekkes på serveren mot medlemskap.
Personlige data (profil, allergier, personlig budsjett) knyttes til `user_id`.

## Konsekvenser
Delingsfunksjonen i fase 10 blir i hovedsak brukergrensesnitt og invitasjoner. Tester for "ingen datalekkasje mellom husholdninger" skrives fra fase 3.
