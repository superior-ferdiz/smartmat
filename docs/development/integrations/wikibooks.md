# Wikibooks (oppskrifter fra åpne kilder)

**Status:** I bruk fra fase 9 (2026-10-24). Se [ADR-0016](../architecture-decisions/0016-oppskrifter-fra-apne-kilder.md)
og [spesifikasjon 09](../requirements/09-maltidsplan.md).

## Hva vi bruker
- **Kilde:** kokeboka på engelske Wikibooks (`Cookbook:`-sidene på en.wikibooks.org).
- **Lisens:** CC BY-SA 4.0 (nettstedets `rightsinfo`, sjekket 2026-10-24). En oversettelse er en bearbeidelse og
  har samme lisens. Kilden nevnes med lenke til den versjonen som ble oversatt (`?oldid=`).
- **API:** MediaWiki Action API, `action=query&prop=revisions&rvprop=ids|timestamp|content&rvslots=main`, og
  `meta=siteinfo&siprop=rightsinfo` for lisensen.

## Når appen kontakter Wikibooks
Aldri. Bare importskriptet `apps/api/scripts/fetch-wikibooks.ts` gjør det, når en utvikler starter det:

```bash
npm run recipes:fetch -w @smartmat/api            # alle sidene i prisma/seed/sources/wikibooks.json
npm run recipes:fetch -w @smartmat/api -- farikal # bare én
```

- Én forespørsel per sekund, tidsavbrudd 15 s.
- User-Agent: `SmartMat-recipe-import/0.1 (APP2000 student project; <kontakt>)`. Kontakten er
  `WIKIMEDIA_CONTACT`, eller GitHub-profilen til repoet når den ikke er satt. Teamet har ikke oppgitt en e-postadresse.
- Svaret valideres med Zod. Skriptet godtar bare navnerommet `Cookbook:` (102), og stopper hvis lisensen ikke er
  CC BY-SA 4.0.
- Originalen lagres som `prisma/seed/sources/wikibooks/<slug>.json`, med wikitekst, side-id, revisjons-id,
  tidspunkt, lenker og hentedato.

## Fra original til oppskrift
KI (Claude) leser originalen og skriver `prisma/seed/recipes/<slug>.json` på norsk, med mengder i grunnenheter og
ingredienser fra `ingredients.json`. Hva som er endret, står i `adaptationNote`. Wikitekst eller HTML vises aldri i
appen: bare den oversatte teksten, som ren tekst.

## Kjente begrensninger
- Kvaliteten varierer mellom sidene. 19 av 46 hentede sider ble valgt bort (se utviklingsjournalen 2026-10-24).
- Mange originaler mangler porsjoner eller tid. KI har anslått dem, og det står i `adaptationNote`.
- Oppskriftene er amerikanske eller britiske i utgangspunktet. Mål i cups og unser er regnet om av KI.
