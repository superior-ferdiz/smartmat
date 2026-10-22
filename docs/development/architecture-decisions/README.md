# Arkitekturbeslutninger (ADR)

En ADR (Architecture Decision Record) er et kort notat om én viktig teknisk beslutning: hva vi valgte, hvorfor,
hvilke alternativer vi vurderte og hva det får av konsekvenser. Poenget er at vi senere kan forklare *hvorfor*
systemet ser ut som det gjør – også i rapporten.

En beslutning endres ved å skrive en ny ADR som erstatter den gamle (og markere den gamle som `Erstattet`).

| Nr | Beslutning |
|---|---|
| [0001](0001-monorepo-npm-workspaces.md) | Monorepo med npm workspaces |
| [0002](0002-fastify-rest-api.md) | Fastify + Zod, REST under /api/v1 |
| [0003](0003-postgresql-prisma.md) | PostgreSQL 16 + Prisma |
| [0004](0004-ren-css-uten-tailwind.md) | Ren CSS med tokens og CSS Modules, ikke Tailwind |
| [0005](0005-sesjoner-og-argon2id.md) | Serverlagrede sesjoner og argon2id |
| [0006](0006-penger-og-mengder-som-heltall.md) | Penger i øre og mengder i grunnenheter, som heltall |
| [0007](0007-kjop-som-eneste-utgiftskilde.md) | Kjøp (Purchase) som eneste kilde til utgifter |
| [0008](0008-husholdning-fra-start.md) | Alle data tilhører en husholdning fra første migrering |
| [0009](0009-egne-froppskrifter.md) | Egne norske frøoppskrifter i stedet for eksternt oppskrifts-API |
| [0010](0010-ingen-skraping-av-priser.md) | Ingen skraping av priser |
| [0011](0011-ocr-velges-etter-maling.md) | OCR-løsning velges etter måling, Tesseract først |
| [0012](0012-lokal-utvikling-forst.md) | Lokal utvikling først, ingen Git ennå (Git-delen erstattet av 0013, hosting-delen av 0015) |
| [0013](0013-git-og-github.md) | Versjonskontroll med Git og privat repo på GitHub |
| [0014](0014-produkter-og-strekkoder.md) | Produkter fra Open Food Facts som globalt mellomlager, og husholdningens egne strekkoder |
| [0015](0015-lukket-testmiljo.md) | Lukket testmiljø med HTTPS på smartmat.risansolutions.no |
| [0016](0016-oppskrifter-fra-apne-kilder.md) | Oppskrifter fra åpne kilder, oversatt til norsk (**foreslått, ikke godkjent**; skal erstatte 0009) |
