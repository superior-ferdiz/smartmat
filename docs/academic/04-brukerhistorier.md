# Brukerhistorier

> **Status: UTKAST (KI).** Skrevet av KI (Claude) i fase 14, 2026-10-27. Ikke gjennomgått av teamet. Offisielle
> APP2000-krav til rapporten er ikke verifisert.

## Hva som faktisk ble brukt

**Prosjektet brukte ikke brukerhistorier.** Kravene ble skrevet som nummererte krav med akseptansekriterier
(`FR-INV-003` osv.), først på et overordnet nivå i [kravoversikten](../development/requirements/00-kravoversikt.md)
(fase 0) og deretter i én spesifikasjon per fase før koden ble skrevet. Kravoversikten sa at fasespesifikasjonene
skulle ha brukerhistorier. Ved kontrollen i fase 14 viste det seg at ingen av de 13 spesifikasjonene har det. Den
setningen er rettet.

Kravene kom fra teamets produktprompt (2026-10-19), ikke fra intervjuer eller observasjon av brukere.

## Kravene omskrevet som brukerhistorier

Tabellen under er en **omskriving i fase 14** av kravene som allerede finnes, for å vise hva de betyr for en bruker.
Den er ikke brukt i utviklingen og bygger ikke på noe brukerne har sagt. Prioriteten er den samme som i
kravoversikten (M = må, B = bør, K = kan).

| Modul | Som … vil jeg … slik at … | Krav | Prio |
|---|---|---|---|
| Konto | Som ny bruker vil jeg lage en konto og logge inn, slik at dataene mine er mine | FR-AUTH-001–002 | M |
| Konto | Som bruker vil jeg kunne slette kontoen og alt den eier, slik at ingenting blir liggende | FR-AUTH-005 | M |
| Konto | Som bruker vil jeg se hvor jeg er logget inn og kunne slå på tofaktor, slik at ingen andre kommer inn | FR-AUTH-009–010 | K |
| Matlager | Som bruker vil jeg legge inn en vare med mengde, sted og dato, slik at jeg vet hva jeg har | FR-INV-001–002 | M |
| Matlager | Som bruker vil jeg se hva som går ut snart, og om det er best før eller siste forbruksdag, slik at jeg bruker det i tide uten å ta sjanser | FR-INV-005 | M |
| Matlager | Som bruker vil jeg registrere at noe er brukt opp eller kastet, og hvorfor, slik at jeg ser hva som går til spille | FR-INV-006–007 | M |
| Budsjett | Som bruker vil jeg registrere et kjøp én gang og få varene rett i matlageret, slik at jeg slipper å skrive dem to ganger | FR-BUD-001–002 | M |
| Budsjett | Som bruker vil jeg sette et månedsbudsjett og se hva som er brukt, slik at jeg vet hvor mye som er igjen | FR-BUD-003–004 | M |
| Oppskrifter | Som bruker vil jeg få middagsforslag ut fra det jeg har og det som går ut snart, med en forklaring | FR-REC-002–003 | B |
| Oppskrifter | Som bruker med allergi vil jeg bli varslet om registrerte allergener, uten at appen lover at noe er fritt for dem | FR-REC-004 | B |
| Handleliste | Som bruker vil jeg legge det som mangler i en oppskrift på handlelisten, og føre det jeg kjøpte inn i lageret | FR-SHOP-001–003 | B |
| Skanning | Som bruker vil jeg skanne en strekkode og få navnet fylt ut, men bekrefte før noe lagres | FR-SCAN-001–005 | B |
| Kvittering | Som bruker vil jeg ta bilde av kvitteringen og rette forslaget før det blir et kjøp | FR-RCPT-001–008 | K |
| Måltidsplan | Som bruker vil jeg planlegge ukens middager og få det som mangler på handlelisten uten å få det dobbelt | FR-PLAN-001–005 | K |
| Husholdning | Som eier vil jeg invitere de jeg bor med, slik at vi deler lager, budsjett og handleliste | FR-HH-001–005 | K |
| Svinn | Som bruker vil jeg se hva vi kaster per måned, med ærlige tall der verdien er ukjent | FR-WASTE-001–005 | K |
| Varsler | Som bruker vil jeg få et varsel i appen før siste forbruksdag og når budsjettet nærmer seg slutt | FR-NOTIF-001–005 | K |
| Priser | Som bruker vil jeg se hva en vare har kostet hos kjedene og hos oss, merket som anslag | FR-PRICE-001–006 | K |
| Personvern | Som bruker vil jeg kunne laste ned alle dataene mine og lese hva som lagres | FR-PRIV-001–003 | K |

## Kilder i prosjektet

- [Kravoversikt](../development/requirements/00-kravoversikt.md) og fasespesifikasjonene
  `docs/development/requirements/01–13`
- Kapittel 05 (kravspesifikasjon) og [sporbarhet fra krav til tester](vedlegg-sporbarhet.md)
