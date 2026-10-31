#!/usr/bin/env bash
# Kontroll av testene for svinnstatistikk og varsler (fase 11): slår av én regel eller beskyttelse om gangen i
# kildekoden, kjører testene og viser resultatet. Filen settes tilbake etter hver runde. En endring er «fanget» når
# minst én test feiler; skriptet viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-11/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Som i fase 8–10 kjøres alle enhetstestene, men bare API-testene fasen berører (notifications* og waste).
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
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts apps/api/test/notifications apps/api/test/waste 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
RULES=packages/shared/src/notifications/rules.ts
STATS=packages/shared/src/waste/stats.ts
WREPO=apps/api/src/modules/waste/repo.ts
WROUTES=apps/api/src/modules/waste/routes.ts
NREPO=apps/api/src/modules/notifications/repo.ts
NSVC=apps/api/src/modules/notifications/service.ts
NROUTES=apps/api/src/modules/notifications/routes.ts
BELL=apps/web/src/layout/NotificationBell.tsx
ANN=apps/web/src/layout/NotificationAnnouncer.tsx
WPAGE=apps/web/src/pages/waste/WastePage.tsx
SHOP=apps/web/src/pages/shopping/ShoppingListPage.tsx
TEXT=apps/web/src/notifications/notificationText.ts

# Varselreglene (packages/shared)
mutate $RULES "1. «Siste forbruksdag passert» varsles for alltid (ingen grense på to dager)" \
"daysLeft >= -USE_BY_PASSED_DAYS ? { kind: 'useByPassed', daysLeft } : null" "{ kind: 'useByPassed', daysLeft }"
mutate $RULES "2. Best før gir varsel etter datoen" \
"  if (!settings.bestBefore || daysLeft < 0) return null;" "  if (!settings.bestBefore) return null;
  if (daysLeft < 0) return { kind: 'bestBeforeToday', daysLeft };"
mutate $RULES "3. «Dager før» fra innstillingene brukes ikke for siste forbruksdag" \
"    return daysLeft <= settings.daysBefore ? { kind: 'useBySoon', daysLeft } : null;" "    return daysLeft <= DAYS_BEFORE_MAX ? { kind: 'useBySoon', daysLeft } : null;"
mutate $RULES "4. Bryteren for siste forbruksdag virker ikke" \
"    if (!settings.useBy) return null;" ""
mutate $RULES "5. Nøkkelen mangler datoen (rettet dato gir ikke nytt varsel)" \
'  return `${STAGE_KEY[kind]}:${batchId}:${date}`;' '  return `${STAGE_KEY[kind]}:${batchId}`;'
mutate $RULES "6. Budsjettvarselet kommer først over 80 %" \
"      : usedPercent >= BUDGET_NEARLY_PERCENT" "      : usedPercent > BUDGET_NEARLY_PERCENT"
mutate $RULES "7. Handlelisten sorteres eldst først (feil «siste linje» i nøkkelen)" \
"  const lines = [...input.shopping].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());" "  const lines = [...input.shopping].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());"

# Statistikken (packages/shared)
mutate $STATS "8. Største rest fordeler ikke de siste prosentpoengene" \
"    result[part.index] = (result[part.index] ?? 0) + 1;" ""
mutate $STATS "9. Andelen rundes vanlig i stedet for ned" \
"  return Number((BigInt(part) * 100n) / BigInt(whole));" "  return Math.round((part * 100) / whole);"
mutate $STATS "10. Faktisk og anslått verdi byttes om" \
"  const actualOre = group.basis === 'actual' ? group.valueOre : 0;
  const estimatedOre = group.basis === 'estimated' ? group.valueOre : 0;" "  const actualOre = group.basis === 'estimated' ? group.valueOre : 0;
  const estimatedOre = group.basis === 'actual' ? group.valueOre : 0;"
mutate $STATS "11. Måneder uten kasseringer mangler i utviklingen" \
"    result.push({ month, ...value });" "    if (value.count > 0) result.push({ month, ...value });"

# Svinn-API-et
mutate $WREPO "12. Angrede kasseringer telles i statistikken" \
"          AND NOT EXISTS (SELECT 1 FROM inventory_events u WHERE u.reverts_event_id = e.id)
          AND e.created_at >= (\${start}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
          AND e.created_at < (\${next}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
        GROUP BY 1, 2, 3, 4, 5" "          AND e.created_at >= (\${start}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
          AND e.created_at < (\${next}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
        GROUP BY 1, 2, 3, 4, 5"
mutate $WREPO "13. Måneden regnes i UTC, ikke norsk tid" \
"        SELECT to_char(e.created_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM') AS month," "        SELECT to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,"
mutate $WREPO "14. Statistikken filtrerer ikke på husholdning" \
"               sum(-e.delta_base) AS quantity
        FROM inventory_events e
        JOIN inventory_items i ON i.id = e.item_id AND i.household_id = e.household_id
        WHERE e.household_id = \${householdId}::uuid
          AND e.type = 'discard'" "               sum(-e.delta_base) AS quantity
        FROM inventory_events e
        JOIN inventory_items i ON i.id = e.item_id AND i.household_id = e.household_id
        WHERE \${householdId}::uuid IS NOT NULL
          AND e.type = 'discard'"
mutate $WREPO "15. «Mest kastet» filtrerer ikke på husholdning" \
"               (count(*) FILTER (WHERE e.waste_value_basis = 'unknown'))::int AS unknown
        FROM inventory_events e
        JOIN inventory_items i ON i.id = e.item_id AND i.household_id = e.household_id
        WHERE e.household_id = \${householdId}::uuid" "               (count(*) FILTER (WHERE e.waste_value_basis = 'unknown'))::int AS unknown
        FROM inventory_events e
        JOIN inventory_items i ON i.id = e.item_id AND i.household_id = e.household_id
        WHERE \${householdId}::uuid IS NOT NULL"
mutate $WROUTES "16. Svinnruten sjekker ikke medlemskap" \
"      preHandler: [requireAuth, householdAccess]," "      preHandler: [requireAuth, async (r: { household: unknown; params: unknown }) => { r.household = { id: (r.params as { householdId: string }).householdId, role: 'member' }; }],"

# Varsel-API-et
mutate $NSVC "17. Avvisning godtar nøkler som ikke er aktive" \
"    if (!active.some((n) => n.key === key)) throw notFound();" ""
mutate $NSVC "18. «Sett» godtar nøkler som ikke er aktive" \
"    const known = [...new Set(keys)].filter((key) => active.has(key));" "    const known = [...new Set(keys)];"
mutate $NSVC "19. Avviste varsler vises fortsatt" \
"      .filter((n) => !states.get(n.key)?.dismissed)" ""
mutate $NSVC "20. Avvisning av handlelisten flytter merket til «nå»" \
"    await this.deps.repo.shoppingSeen(householdId, userId, new Date(shownAt));" "    await this.deps.repo.shoppingSeen(householdId, userId, this.deps.now());"
mutate $NREPO "21. Egne handlelistelinjer gir varsel" \
"          OR: [{ createdById: null }, { createdById: { not: userId } }]," ""
mutate $NREPO "22. «Sett handlelisten» kan flytte merket bakover" \
"        where: { householdId, userId, shoppingSeenAt: { lt: at } }," "        where: { householdId, userId },"
mutate $NREPO "23. Gamle tilstander ryddes ikke" \
"        await prune(householdId, userId, now);
        return count;" "        return count;"
mutate $NROUTES "24. Varselrutene sjekker ikke medlemskap" \
"  const preHandler = [requireAuth, householdAccess];" "  const preHandler = [requireAuth, async (r: { household: unknown; params: unknown }) => { r.household = { id: (r.params as { householdId: string }).householdId, role: 'member' }; }];"

# Nettappen
mutate $BELL "25. Bjella sier ikke antallet til skjermlesere" \
"        unseen > 0 ? t('nav.notificationsUnseen', { count: unseen }) : t('nav.notifications')" "        t('nav.notifications')"
mutate $ANN "26. Live-regionen leser opp ved første innlasting" \
"    if (!before || before.householdId !== user.householdId) return;" "    if (!before) { setMessage(t('notifications.announce', { count: unseen })); return; }"
mutate $WPAGE "27. «Under 1 %» vises som «0 %»" \
"          {isBelowOnePercent(stats.estimatedOre, stats.knownOre)" "          {false"
mutate $SHOP "28. Handlelisten sier ikke fra om at den er sett" \
"    if (loadedAt > 0) markShoppingSeen();" "    if (loadedAt < 0) markShoppingSeen();"
mutate $TEXT "29. Siste forbruksdag i dag får rådet for best før" \
"          advice: t('notifications.advice.useByToday')," "          advice: t('notifications.advice.bestBefore'),"
rm -f "$backup"
