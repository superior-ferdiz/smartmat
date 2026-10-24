# ADR-0016: Oppskrifter fra åpne kilder, oversatt til norsk, med kilde og lisens

**Status:** Akseptert 2026-10-24. Foreslått 2026-10-22 av KI (Claude) i planen for fase 7. Ferdinand Risan skrev
2026-10-24 at oppskrifter «skal hentes fra internett slik at det automatisk kommer opp oppskrifer på matretter som
brukeren kan lage basert på hva de har». Planen for fase 9 foreslo Wikibooks som kilde, og den ble godkjent samme dag
(«Godkjent i plenum av Ferdinand og Linus», registrert som Ferdinands erklæring). Erstatter
[ADR-0009](0009-egne-froppskrifter.md). Se [spesifikasjon 09](../requirements/09-maltidsplan.md).

## Kontekst
ADR-0009 sa at teamet skriver 30–50 oppskrifter selv. Ingen i teamet skriver oppskrifter, så de må hentes fra nett.
Rettighetene til oppskrifter er sammensatte. Det som står under, er KI-ens forståelse av norsk rett og ikke
juridisk rådgivning. Teamet bør gjerne spørre veilederen.

- **Opphavsrett** (åndsverkloven § 2): en ingrediensliste er fakta og har normalt ikke verkshøyde. Beskrivelser,
  fremgangsmåter med eget språk og bilder kan være vernet.
- **Databasevern** (åndsverkloven § 24): en samling oppskrifter kan være vernet mot at vesentlige deler hentes ut,
  også når hver oppskrift ikke er vernet. Å hente systematisk fra én nettside kan derfor være ulovlig.
- **Vilkår:** mange oppskriftsnettsteder forbyr kopiering og skraping i bruksvilkårene (avtale). Det gjelder også
  når innholdet i seg selv ikke er vernet.

## Beslutning (forslag)
- **Lovlige kilder**, sjekket for hver oppskrift før den hentes:
  - innhold som er falt i det fri (forfatteren døde for mer enn 70 år siden)
  - CC0
  - CC BY
  - CC BY-SA

  Mulige kilder som må sjekkes: Wikibooks (CC BY-SA) og gamle norske kokebøker som er digitalisert. Ikke vanlige
  oppskriftsnettsteder, kjeder eller blogger, og ikke datasett som er skrapet fra slike.
- **Språk:** norsk bokmål. KI kan oversette og tilpasse (moderne mål, grunnenheter). En oversatt CC BY-SA-oppskrift
  er en bearbeidelse og må selv ha CC BY-SA. Den nevner originalen.
- **Lagres per oppskrift:**

  | Felt | Betydning |
  |---|---|
  | `source` | `external` (åpen kilde), `ai` (KI-generert) eller `test` |
  | `source_url` | Lenke til originalen |
  | `source_title` | Navnet på originalen |
  | `original_author` | Forfatteren av originalen |
  | `license` | SPDX-id: `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0` eller `public-domain` |
  | `retrieved_on` | Datoen oppskriften ble hentet |
  | `adaptation` | `none`, `translated` eller `adapted` |
  | `ai_assisted` | Om KI har oversatt eller tilpasset |
  | `reviewed_by` | Hvem i teamet som har kontrollert oppskriften |
  | `reviewed_on` | Når den ble kontrollert |

- **Visning:** «Kilde: ‹tittel› av ‹forfatter› · Lisens: CC BY-SA 4.0 · Oversatt og tilpasset med KI», med lenker.
  Er oppskriften ikke kontrollert av teamet, står det «KI-utkast – ikke kontrollert av teamet». Ukontrollerte
  oppskrifter vises bare i testmiljøet.
- **Rene KI-oppskrifter** (`source=ai`): **åpent spørsmål for teamet.** Forslaget er at de er lov, merket
  «KI-generert oppskrift», og bare etter at teamet har kontrollert mengder, steker- og koketider og allergener.
- **Allergener:** regnes fortsatt ut fra ingrediensene (fase 5). Kilden brukes ikke til allergenmerking.

## Alternativer
- **TheMealDB / Spoonacular:** engelsk, uklare eller kommersielle vilkår, og tilgang via nøkkel.
- **Fortsette med ADR-0009 (teamet skriver):** lovlig, men skjer ikke i praksis.
- **Skrape norske oppskriftsnettsteder:** bryter trolig vilkår og kan bryte databasevernet. Forkastet.

## Konsekvenser
- Krever en migrering av `recipes` (nye felt og `source`-verdier) og en ny side for kilde og lisens. Det kan bli en
  egen oppgave etter fase 7.
- Hver oppskrift må sjekkes enkeltvis. Lisensen må stå i frødatafilen og vises i appen.
- Kildelisten (kapittel 19) får en oppføring per kilde.

## Gjennomføring (fase 9, 2026-10-24)
- **Kilde:** engelske Wikibooks (Cookbook), CC BY-SA 4.0. Lisensen ble sjekket i nettstedets `rightsinfo` 2026-10-24,
  og importskriptet stopper hvis den endres. Ingen norske, åpne kilder med nok oppskrifter ble funnet.
- **Vurderte nettjenester (2026-10-24):** Spoonacular tillater ikke lagring av ingredienser og fremgangsmåte (bare
  mellomlagring i 1 time med skriftlig tillatelse). Det gjør matching mot matlageret umulig. TheMealDB gir bare
  utviklings- og utdanningsbruk med gratisnøkkelen, søk på flere ingredienser krever betaling, og teksten er hentet fra
  andre nettsteder med uklare rettigheter. Begge ble valgt bort.
- **Import:** `npm run recipes:fetch -w @smartmat/api` lagrer originalen med revisjons-id i
  `prisma/seed/sources/wikibooks/`. 46 sider ble hentet i to omganger, og 27 ble oversatt av KI. 19 ble valgt bort,
  fordi de manglet mengder, var oversikter og ikke oppskrifter, krevde ferdigprodukter, eller hadde en lenke som så ut
  som reklame. Originalene til de som ble valgt bort, er slettet. Hver av dem er nevnt i utviklingsjournalen.
- **User-Agent:** Wikimedia ber om kontaktinformasjon. Teamet oppga ingen adresse, så skriptet bruker GitHub-profilen
  til repoet. Den kan overstyres med `WIKIMEDIA_CONTACT`.
- **Avvik fra forslaget:**
  - `original_author` er ikke laget. `authors` har den rollen for eksterne oppskrifter.
  - `adaptation_note` er lagt til. Den sier hva KI har endret, for eksempel anslåtte tider eller porsjoner.
  - Ukontrollerte oppskrifter vises nå i alle miljøer, fordi det ikke finnes noe produksjonsmiljø. Bryteren
    `RECIPES_INCLUDE_UNREVIEWED=false` skjuler dem, og den skal brukes i et fremtidig produksjonsmiljø.
- **Rene KI-oppskrifter** (`source=ai`) er fortsatt ikke tillatt. Spørsmålet er ikke besvart av teamet.
