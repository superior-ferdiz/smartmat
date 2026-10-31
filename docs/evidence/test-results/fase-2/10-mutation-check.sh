#!/usr/bin/env bash
# Kontroll av sikkerhetstestene (fase 2): slår av én beskyttelse om gangen i kildekoden, kjører API-testene
# mot testdatabasen og sjekker at minst én test feiler. Filen settes tilbake etter hver runde.
# Kjøres fra repo-roten: bash docs/evidence/test-results/fase-2/10-mutation-check.sh
set -u
backup=$(mktemp)
mutate() { # fil, tekst som byttes ut, ny tekst, beskrivelse
  cp "$1" "$backup"
  python3 -c "import sys;p=sys.argv[1];s=open(p).read();assert sys.argv[2] in s;open(p,'w').write(s.replace(sys.argv[2],sys.argv[3]))" "$1" "$2" "$3"
  result=$(npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')
  cp "$backup" "$1"
  echo "$4"
  echo "    endret: $1"
  echo "    resultat: $result"
}
mutate apps/api/src/plugins/auth.ts "if (isChangingRequest(request.method)) {" "if (false) {" "1. CSRF-token sjekkes ikke"
mutate apps/api/src/plugins/origin.ts "if (!isChangingRequest(request.method)) return;" "return;" "2. Origin sjekkes ikke"
mutate apps/api/src/authz/household.ts "if (!membership) throw notFound();" "" "3. Medlemskap i husholdningen sjekkes ikke"
mutate apps/api/src/modules/auth/service.ts "if (failures >= LOGIN_MAX_FAILURES) {" "if (false) {" "4. Kontoen sperres aldri"
mutate apps/api/src/app.ts "trustProxy: false" "trustProxy: true" "5. X-Forwarded-For blir trodd"
mutate apps/api/src/app.ts "req: (request) => ({ method: request.method, url: request.url })," "" "6. Standard logging av forespørsler (med IP-adresse)"
echo "Uendret kode:"
npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ */    /'
rm -f "$backup"
