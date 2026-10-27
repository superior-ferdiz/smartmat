# Pwned Passwords (Have I Been Pwned)

**Lest 2026-10-25 av KI (Claude)**, før koden ble skrevet. Teamet har ikke lest vilkårene selv. Kildene er
[API-dokumentasjonen](https://haveibeenpwned.com/API/v3), [siden om Pwned Passwords](https://haveibeenpwned.com/Passwords)
og [personvernerklæringen](https://haveibeenpwned.com/Privacy). Sitatene er gjengitt slik de sto 2026-10-25.

## Hva tjenesten er
En samling av passord som har vært med i kjente datalekkasjer, drevet av Troy Hunt. SmartMat bruker den til å avvise
passord som er kjent fra lekkasjer (FR-AUTH-008, spesifikasjon 13).

## Hva vilkårene sier (sitat)

| Tema | Sitat |
|---|---|
| Nøkkel | «The Pwned Passwords API is freely accessible without the need for a subscription and API key.» |
| Rate limit | «There is no rate limit on the Pwned Passwords API.» |
| Lisens | «there is no licencing or attribution requirements on the Pwned Passwords API» |
| k-anonymitet | «the first 5 characters of either a SHA-1 or an NTLM hash (not case-sensitive) to be passed to the API» |
| Polstring | «Padding is enabled by a request header and ensures that all responses contain between 800 and 1,000 results» · «Padded entries always have a password count of 0 and can be discarded once received.» |
| User-Agent | «Each request to the API must be accompanied by a user agent request header.» · «A missing user agent will result in an HTTP 403 response.» |
| Akseptabel bruk | Ikke bruke udokumenterte API-er, ikke gi inntrykk av at dataene kommer fra en annen kilde, ikke angrep som begrenser tjenesten. |
| Logger | «web server logs, retained for up to 31 days» · «These logs may include … browser headers such as the user agent string and, in some cases, the user's IP address.» |

## Vår tolkning (ikke juridisk råd)
- **Lov for oss:** gratis, uten nøkkel og uten krav om kreditering, også for et studentprosjekt.
- **Personopplysninger:** HIBP får de 5 første tegnene i en SHA-1-hash og serverens IP-adresse, ikke brukerens. Ut fra
  5 heksadesimale tegn (ca. 1 million mulige prefiks, 800–1000 svar med polstring) kan ingen finne passordet. Vi
  tolker det slik at HIBP ikke mottar personopplysninger om brukeren. Teamet bør likevel nevne det i
  personvernerklæringen.
- **Logger hos HIBP:** serverens adresse og User-Agent kan bli lagret i opptil 31 dager. User-Agent er
  `SmartMat/1.0 (+https://github.com/superior-ferdiz)`, uten e-post (samme regel som for Wikimedia).

## Hvordan SmartMat bruker den
- Bare ved registrering og passordbytte, fra serveren: `GET https://api.pwnedpasswords.com/range/{5 tegn}` med
  `Add-Padding: true`, tidsavbrudd 2 s, høyst 2 MB svar, `redirect: 'error'`.
- Treff med antall ≥ 1 gir 400 `errors.auth.passwordPwned`. Polstringen (antall 0) teller ikke.
- Tjenesten nede eller rart svar: passordet godtas, og det logges bare at sjekken ble hoppet over.
- Av uten `PWNED_PASSWORDS=on`. Testene bruker et falskt svar (`apps/api/test/fakePwned.ts`).
- Prefikset, hashen og passordet logges aldri.

## Må sjekkes på nytt
- Om vilkårene er endret, før appen brukes av andre enn teamet.
