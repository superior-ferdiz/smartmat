#!/usr/bin/env bash
# Kontroll av testene for kvitterings-OCR (fase 8): slår av én regel eller beskyttelse om gangen i kildekoden, kjører
# testene og viser resultatet. Filen settes tilbake etter hver runde. En endring er «fanget» når minst én test feiler;
# skriptet viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-8/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Avvik fra fase 7: for å holde tiden nede kjøres alle enhetstestene, men bare API-testene for kvitteringer og kjøp
# (receipts*.api.test.ts, receiptQueue.api.test.ts og purchases*.api.test.ts), som er de fase 8 berører.
set -u
backup=$(mktemp)
mutate() {
  local file=$1 desc=$2
  shift 2
  cp "$file" "$backup"
  if ! python3 - "$file" "$@" <<'PY'
import sys
p, pairs = sys.argv[1], sys.argv[2:]
s = open(p).read()
for old, new in zip(pairs[::2], pairs[1::2]):
    assert s.count(old) == 1, f'not found exactly once: {old[:70]}'
    s = s.replace(old, new, 1)
open(p, 'w').write(s)
PY
  then
    echo "$desc"; echo "    FEIL I SKRIPTET: endringen fantes ikke"; cp "$backup" "$file"; return
  fi
  if [ "${DRY:-0}" = 1 ]; then cp "$backup" "$file"; echo "ok: $desc"; return; fi
  local unit_out api_out
  unit_out=$(npx vitest run 2>&1)
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts apps/api/test/receipts apps/api/test/receiptQueue apps/api/test/purchases 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
RR=apps/api/src/modules/receipts/routes.ts
RP=apps/api/src/modules/receipts/repo.ts
RS=apps/api/src/modules/receipts/service.ts
PROC=apps/api/src/modules/receipts/processor.ts
PRP=apps/api/src/modules/purchases/repo.ts
IMG=apps/api/src/providers/ocr/image.ts
TES=apps/api/src/providers/ocr/tesseract.ts
TSV=apps/api/src/providers/ocr/tesseractTsv.ts
PARSE=packages/shared/src/receipts/parse.ts
CH=packages/shared/src/receipts/chains.ts
RED=packages/shared/src/receipts/redact.ts
WRF=apps/web/src/receipts/receiptForm.ts
RPG=apps/web/src/pages/receipts/ReceiptPage.tsx

mutate $RR "1. Kvitteringsrutene uten householdAccess (bare innlogging)" \
"  const preHandler = [requireAuth, householdAccess];" "  const preHandler = [requireAuth];"
mutate $RP "2. En kvittering hentes uten å filtrere på husholdning" \
"        where: { id: receiptId, householdId, ...notExpired(now) }," "        where: { id: receiptId, ...notExpired(now) },"
mutate $RP "3. Bildet hentes uten å filtrere på husholdning" \
"        where: { receiptId, householdId, receipt: { deleteAfter: { gt: now } } }," "        where: { receiptId, receipt: { deleteAfter: { gt: now } } },"
mutate $RP "4. Forkasting uten å filtrere på husholdning" \
"        where: { id: receiptId, householdId, status: { not: 'confirmed' } }," "        where: { id: receiptId, status: { not: 'confirmed' } },"
mutate $RP "5. Nytt forsøk uten å filtrere på husholdning" \
"        where: { id: receiptId, householdId, status: 'failed', deleteAfter: { gt: now } }," "        where: { id: receiptId, status: 'failed', deleteAfter: { gt: now } },"
mutate $RP "6. «Samme bilde finnes» ser i alle husholdninger" \
"        where: { householdId, imageSha256: sha256, status: { in: OPEN }, deleteAfter: { gt: now } }," "        where: { imageSha256: sha256, status: { in: OPEN }, deleteAfter: { gt: now } },"
mutate $RP "7. Utløpte kvitteringer kan fortsatt leses" \
"  OR: [{ status: 'confirmed' }, { deleteAfter: { gt: now } }]," "  OR: [{ status: 'confirmed' }, { deleteAfter: { gt: new Date(0) } }],"
mutate $RP "8. Oppryddingen sletter også bekreftede kvitteringer" \
"        where: { status: { not: 'confirmed' }, deleteAfter: { lte: now } }," "        where: { deleteAfter: { lte: now } },"
mutate $RS "9. Ingen grense per bruker på opplasting" \
"    if (!this.deps.uploadLimiter.take(userId)) throw" "    if (false) throw"
mutate $RS "10. Ingen grense for køen" \
"    if ((await repo.countWaiting()) >= config.maxQueued)" "    if (false)"
mutate $RS "11. Samme bilde kan lastes opp flere ganger" \
"    if (existing) throw new AppError(409, API_ERRORS.receiptAlreadyUploaded, undefined, existing);" ""
mutate $RS "12. Linjeforslag vises selv om de er slått av (ADR-0017)" \
"        lines: linesShown ? parse.lines : []," "        lines: parse.lines,"
mutate $RS "13. Slettefristen er 30 dager i stedet for 7" \
"export const RECEIPT_RETENTION_DAYS = 7;" "export const RECEIPT_RETENTION_DAYS = 30;"
mutate $RS "14. Den sterke duplikatnøkkelen brukes ikke" \
"    const strongKey = receiptDedupeKey(readParse(row), body.purchasedOn, totalOre);" "    const strongKey = null as string | null;"
mutate $RS "15. Advarselen om mulig duplikat gis aldri" \
"    } else if (!body.allowPossibleDuplicate) {" "    } else if (false) {"
mutate $RS "16. Kvitteringen trenger ikke være ferdig lest for å bekreftes" \
"    if (row.status !== 'review') throw new AppError(409, API_ERRORS.receiptNotReady);" ""
mutate $PRP "17. Bildet slettes ikke ved bekreftelse" \
"  await tx.receiptImage.deleteMany({ where: { receiptId: receipt.id, householdId } });" ""
mutate $PRP "18. Kjøp fra kvittering lagres som manuelle" \
"              source: receipt ? 'receipt' : 'manual'," "              source: 'manual',"
mutate $PRP "19. Kvitteringen lukkes ikke i samme transaksjon" \
"          if (receipt) await confirmReceipt(tx, householdId, receipt, created.id);" ""
mutate $PROC "20. Betalingslinjene fjernes ikke før lagring" \
"    const lines = withoutPaymentLines(result.text.lines);" "    const lines = result.text.lines;"
mutate $PROC "21. En provider som kaster, fanges ikke" \
"      result = { ok: false as const, failure: 'unavailable' as const };" "      throw new Error('provider failed');"
mutate $IMG "22. Metadata (EXIF/GPS) beholdes i det lagrede bildet" \
"      .jpeg({ quality: 90 })" "      .jpeg({ quality: 90 }).keepMetadata()"
mutate $IMG "23. Filtypen avgjøres ikke av innholdet (alt sharp kan lese, godtas)" \
"  if (!type) return { ok: false, reason: 'unsupportedType' };" "" \
"  if (format !== type) return { ok: false, reason: 'unsupportedType' };" ""
mutate $IMG "24. Ingen grense for antall piksler" \
"  const options = { limitInputPixels: RECEIPT_IMAGE_MAX_PIXELS, failOn: 'error' } as const;" "  const options = { limitInputPixels: false, failOn: 'error' } as const;"
mutate $IMG "25. Bildet rettes ikke opp etter EXIF-retningen" \
"      .rotate()
      .flatten" "      .flatten"
mutate $TES "26. Tesseract stoppes ikke ved tidsavbrudd" \
"      child.kill('SIGKILL');
      finish({ ok: false, reason: 'timeout' });" "      void 0;"
mutate $TES "27. Ingen grense for hvor mye Tesseract kan skrive" \
"      if (size > MAX_OUTPUT_BYTES) {" "      if (false) {"
mutate $TES "28. De andre retningene prøves aldri når lesingen er usikker" \
"    if (variant !== 'raw' && unsure(best)) {" "    if (false) {"
mutate $TES "29. Retning velges etter alle ord, ikke sikre ord" \
"      const weight = parsed.confidentWords * 100 + parsed.meanConfidence;" "      const weight = parsed.words * parsed.meanConfidence;"
mutate $TSV "30. Svaret fra Tesseract kontrolleres ikke" \
"  if (!header || header.length !== HEADER.length || header.some((name, i) => name !== HEADER[i])) {" "  if (!header) {"
mutate $PARSE "31. Kjeden letes etter i hele kvitteringen, ikke bare toppen" \
"  const chain = detectChain(texts.slice(0, start));" "  const chain = detectChain(texts);"
mutate $PARSE "32. En rabatt større enn linjen trekkes likevel fra" \
"      if (last && last.amountOre !== null && last.amountOre >= discount && discount > 0) {" "      if (last && last.amountOre !== null && discount > 0) {"
mutate $PARSE "33. Antall × pris vinner ikke over et feillest beløp" \
"  line.amountOre = computed;
  line.flags.push('quantityMismatch');" "  line.flags.push('quantityMismatch');"
mutate $PARSE "34. Kantstøy foran linjene fjernes ikke" \
"    if (!first || !/^[^\d+\s]{1,2}\$/u.test(first) || letters(remaining) < 3) break;" "    break;"
mutate $RED "35. Maskerte kortnumre gjenkjennes ikke" \
"  /[x*]{4,}\s*-?\s*\d{2,4}/i, // masked card number: xxxxxxxxxxxx1234-01" ""
mutate $WRF "36. Linjene fylles inn selv om linjeforslag er av (ADR-0017)" \
"  if (!suggestion.linesShown || suggestion.lines.length === 0) {" "  if (suggestion.lines.length === 0) {"
mutate $RPG "37. «Lagre likevel» sendes aldri" \
"                allowPossibleDuplicate: allowDuplicate," "                allowPossibleDuplicate: false,"
echo "38. Uendret kode (kontroll: ingen tester skal feile)"
if [ "${DRY:-0}" != 1 ]; then
  unit_out=$(npx vitest run 2>&1)
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts apps/api/test/receipts apps/api/test/receiptQueue apps/api/test/purchases 2>&1)
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
fi
rm -f "$backup"
echo "exit 0"
