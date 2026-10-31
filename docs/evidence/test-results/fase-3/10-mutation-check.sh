#!/usr/bin/env bash
# Kontroll av sikkerhets- og regeltestene for matlageret (fase 3): slår av én beskyttelse om gangen i kildekoden,
# kjører API-testene mot testdatabasen og sjekker at minst én test feiler. Filen settes tilbake etter hver runde.
# Kjøres fra repo-roten: bash docs/evidence/test-results/fase-3/10-mutation-check.sh
set -u
backup=$(mktemp)
mutate() { # fil, tekst som byttes ut, ny tekst, beskrivelse
  cp "$1" "$backup"
  python3 -c "import sys;p=sys.argv[1];s=open(p).read();assert sys.argv[2] in s, 'not found';open(p,'w').write(s.replace(sys.argv[2],sys.argv[3],1))" "$1" "$2" "$3"
  result=$(npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')
  cp "$backup" "$1"
  echo "$4"
  echo "    endret: $1"
  echo "    resultat: $result"
}
R=apps/api/src/modules/inventory/repo.ts
mutate $R "      db.inventoryBatch.findFirst({
        where: { id: batchId, householdId }," "      db.inventoryBatch.findFirst({
        where: { id: batchId }," "1. Parti slås opp uten husholdningsfilter"
mutate $R "      const row = await db.inventoryItem.findFirst({
        where: { id: itemId, householdId }," "      const row = await db.inventoryItem.findFirst({
        where: { id: itemId }," "2. Vare slås opp uten husholdningsfilter"
mutate $R "deleteMany({ where: { id: itemId, householdId } })" "deleteMany({ where: { id: itemId } })" "3. Sletting av vare uten husholdningsfilter"
mutate $R "where: { id: batch.id, householdId, quantityBase: { gte: quantity } }," "where: { id: batch.id, householdId }," "4. Forbruk/kassering uten sjekk av hvor mye som er igjen"
mutate apps/api/src/modules/inventory/service.ts "if (!(await this.deps.locations.exists(householdId, locationId))) {" "if (false) {" "5. Lagringssted i forespørselen sjekkes ikke mot husholdningen"
mutate $R "AND NOT EXISTS (SELECT 1 FROM inventory_events u WHERE u.reverts_event_id = e.id)" "" "6. Angrede kasseringer telles med i svinnoppsummeringen"
mutate apps/api/src/modules/locations/repo.ts "if (inUse > 0) return 'notEmpty' as const;" "" "7. Kodesjekken for «sted med varer» fjernet. FORVENTET: alle tester passerer, fordi fremmednøkkelen
   i databasen (NO ACTION) fortsatt stopper slettingen. Viser at regelen har to lag."
echo "Uendret kode:"
npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ */    /'
rm -f "$backup"
