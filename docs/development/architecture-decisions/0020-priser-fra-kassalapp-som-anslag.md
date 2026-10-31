# ADR-0020: Priser fra Kassalapp som anslag, holdt adskilt fra husholdningens egne priser

**Status:** Akseptert 2026-10-25. Foreslått av KI (Claude) i planen for fase 12, og godkjent av Ferdinand Risan i chat
(«Godkjennt»). Ikke gjennomgått av Linus Saxe Huseby. Utdyper [ADR-0010](0010-ingen-skraping-av-priser.md). Se
[spesifikasjon 12](../requirements/12-priser.md) og [integrations/kassalapp.md](../integrations/kassalapp.md).

## Kontekst
ADR-0010 sier at vi ikke skraper, og at Kassalapp først vurderes når vilkårene er lest. Vilkårene ble lest
2026-10-25. Kassalapp tillater gratis bruk (Hobby) i studentprosjekter, lagring og hurtiglager i 6 timer, og krever
ikke kreditering. Rådata skal ikke publiseres. Prisene gjelder per kjede, uten tilbud og medlemspriser, og
**Rema 1000, Kiwi og Coop er ikke med**. Teamets egne kvitteringer er fra Extra og Kiwi. Teamet har ikke konto eller
nøkkel per 2026-10-25.

## Beslutning
- **Kassalapp på Hobby, av som standard.** Uten `KASSALAPP_API_KEY` sendes ingen forespørsler, og appen viser bare
  egne priser. Blir SmartMat kommersielt, må vilkårene vurderes på nytt (Bedrift).
- **Bare strekkoder fra serveren:** `GET /products/ean/{ean}`. Ingen fritekstsøk, ingen brukerdata, ingen bilder,
  allergener eller næringsinnhold.
- **Global lagring:** `price_observations` med siste observasjon per kjede og strekkode, med kilde,
  observasjonstidspunkt og hentetidspunkt, og `price_lookups` for hurtiglageret på 6 timer. Slettes etter 30 dager uten
  nytt oppslag.
- **Ærlig dekning:** priser eldre enn 14 dager og priser fra kjeder Kassalapp ikke henter, er aldri med i «billigst»
  eller i anslag, og grensesnittet sier alltid hvilke kjeder som mangler.
- **Egne priser regnes ut ved lesing** fra partiene (`price_ore`, `initial_quantity_base`), som budsjettet
  (ADR-0007). De lagres ikke på nytt.
- **Et anslag er aldri en utgift.** Eksterne priser skrives aldri til kjøp, partier, budsjett eller svinn.

## Alternativer
- **Bare egne priser (ingen ekstern kilde):**
  - Fordeler: ingen avhengighet og ingen vilkår.
  - Ulemper: ingen pris før husholdningen har kjøpt varen selv.
  - Bygges uansett, og er det appen gjør uten nøkkel.
- **Full prishistorikk fra Kassalapp:** gir grafer, men mer lagret data og nærmere et «uttrekk» av prishistorikken.
  Forkastet for nå.
- **Fritekstsøk for handlelistelinjer:** dekker linjer uten strekkode, men teksten havner i Kassalapps logg, og koblingen
  fra «melk» til ett produkt ville vært gjetting. Forkastet.
- **Skraping av kjedenes nettsider:** forbudt av ADR-0010.

## Konsekvenser
- Appen virker likt med og uten Kassalapp (NFR-REL-001).
- For teamets egne butikker gir Kassalapp ingen ferske priser. Egne priser er det mest nyttige.
- Vilkårene står i en FAQ som kan endres. De må leses igjen før appen brukes av andre enn teamet.
- Svarformatet er ikke sett i et ekte svar før teamet har en nøkkel.
