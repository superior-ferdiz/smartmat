#!/usr/bin/env bash
# Kontroll av testene for husholdning (fase 10): slår av én regel eller beskyttelse om gangen i kildekoden, kjører
# testene og viser resultatet. Filen settes tilbake etter hver runde. En endring er «fanget» når minst én test feiler;
# skriptet viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-10/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Som i fase 8 og 9 kjøres alle enhetstestene, men bare API-testene fasen berører (households*, profile, recipes,
# mealPlan og shopping.api.test.ts).
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
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts apps/api/test/households apps/api/test/profile apps/api/test/recipes.api apps/api/test/mealPlan apps/api/test/shopping.api 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
RULES=packages/shared/src/household/rules.ts
OWNER=apps/api/src/authz/requireOwner.ts
REPO=apps/api/src/modules/households/repo.ts
SVC=apps/api/src/modules/households/service.ts
ROUTES=apps/api/src/modules/households/routes.ts
CREATOR=apps/api/src/lib/creator.ts
RECIPES=apps/api/src/modules/recipes/service.ts
PLAN=apps/api/src/modules/mealplan/service.ts
WQC=apps/web/src/app/queryClient.ts
WWATCH=apps/web/src/household/HouseholdWatcher.tsx
WFILTER=apps/web/src/recipes/filter.ts
WJOIN=apps/web/src/pages/household/JoinPage.tsx

mutate $OWNER "1. Et medlem slipper gjennom eiersjekken på ruten" \
"  if (householdOf(request).role !== 'owner') throw" "  if (householdOf(request).role === ('none' as string)) throw"
mutate $REPO "2. Rollen sjekkes ikke på nytt under låsen" \
"  if ((await roleIn(tx, householdId, userId)) !== 'owner') throw new MembershipRefused('notOwner');" ""
mutate $REPO "3. Husholdningsraden låses ikke (FOR UPDATE)" \
"    SELECT id FROM households WHERE id = \${householdId}::uuid FOR UPDATE\`;" "    SELECT id FROM households WHERE id = \${householdId}::uuid\`;"
mutate $REPO "4. Eieren kan forlate husholdningen" \
"        if (role === 'owner') throw new MembershipRefused('ownerMustTransfer');" ""
mutate $REPO "5. Den som forlater, får ingen ny husholdning" \
"        await ensureHousehold(tx, userId);
      });
    },

    async removeMember" "      });
    },

    async removeMember"
mutate $REPO "6. Den som fjernes, får ingen ny husholdning" \
"        await ensureHousehold(tx, memberId);" ""
mutate $REPO "7. Medlemmene får ingen ny husholdning når den slettes" \
"        for (const member of members) await ensureHousehold(tx, member.userId);" ""
mutate $REPO "8. Overføring gjør den nye til eier uten å gjøre den gamle til medlem" \
"        // Demote first: the partial unique index allows only one owner at any moment.
        await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId: ownerId } },
          data: { role: 'member' },
        });" ""
mutate $REPO "9. Overføring til noen som ikke er medlem" \
"        if ((await roleIn(tx, householdId, newOwnerId)) !== 'member') {" "        if ((await roleIn(tx, householdId, newOwnerId)) === ('none' as string)) {"
mutate $REPO "10. Invitasjonen kan brukes flere ganger (ingen betingelse når den merkes som brukt)" \
"          where: { id: invitation.id, ...tokenHashActive(tokenHash, now) }," "          where: { id: invitation.id },"
mutate $REPO "11. En utløpt invitasjon virker" \
"  expiresAt: { gt: now }," ""
mutate $REPO "12. En tilbaketrukket invitasjon virker" \
"  usedAt: null,
  revokedAt: null," "  usedAt: null,"
mutate $REPO "13. «Allerede medlem» sjekkes ikke før invitasjonen brukes" \
"        if (await roleIn(tx, householdId, userId)) throw new MembershipRefused('alreadyMember');" ""
mutate $REPO "14. Grensen på 10 medlemmer gjelder ikke" \
"          throw new MembershipRefused('full');" "          void 0;"
mutate $REPO "15. Grensen på 5 husholdninger per bruker gjelder ikke" \
"          throw new MembershipRefused('tooManyHouseholds');" "          void 0;"
mutate $REPO "16. Grensen på 5 aktive invitasjoner gjelder ikke" \
"        if (active >= MAX_ACTIVE_INVITATIONS) throw new MembershipRefused('tooManyInvitations');" ""
mutate $REPO "17. Tilbaketrekking slår opp invitasjonen uten husholdningen" \
"        where: { id: invitationId, householdId }," "        where: { id: invitationId },"
mutate $REPO "18. Allergier deles uten at medlemmet har valgt det" \
"          user: { memberships: { some: { householdId, shareAllergens: true } } }," "          user: { memberships: { some: { householdId } } },"
mutate $REPO "19. Aktiv husholdning kan settes uten medlemskap" \
"      if (!membership) return false;" ""
mutate $REPO "20. Ved sletting av konto får ingen andre eierskapet" \
"      await tx.householdMember.update({
        where: {
          householdId_userId: { householdId: membership.householdId, userId: successor.userId },
        },
        data: { role: 'owner' },
      });" ""
mutate $SVC "21. Tokenet lagres i stedet for hashen" \
"        tokenHash: hashInvitationToken(token)," "        tokenHash: token,"
mutate $SVC "22. Forhåndsvisning teller ikke mot grensen per bruker" \
"  async previewInvitation(userId: string, token: string): Promise<InvitationPreviewResponse> {
    this.limitAttempts(userId);" "  async previewInvitation(userId: string, token: string): Promise<InvitationPreviewResponse> {"
mutate $SVC "23. Egne allergener regnes også som husholdningens" \
"    return ALLERGENS.filter((a) => shared.includes(a) && !own.includes(a));" "    return ALLERGENS.filter((a) => shared.includes(a));"
mutate $SVC "24. Eieren kan fjerne seg selv" \
"    if (memberId === ownerId) throw new AppError(400, API_ERRORS.householdCannotRemoveSelf);" ""
mutate $ROUTES "25. Ingen grense per IP på forhåndsvisning" \
"    '/invitations/preview',
    {
      preHandler: [requireAuth],
      config: rateLimit(rateLimits.invitation)," "    '/invitations/preview',
    {
      preHandler: [requireAuth],"
mutate $RULES "26. Den valgte husholdningen brukes selv om brukeren ikke er medlem lenger" \
"  if (chosen && memberships.some((m) => m.householdId === chosen)) return chosen;" "  if (chosen) return chosen;"
mutate $RULES "27. Et medlem kan invitere (rollereglene)" \
"  return role === 'owner' && OWNER_ONLY.includes(action);" "  return OWNER_ONLY.includes(action);"
mutate $CREATOR "28. Tidligere medlemmer vises med navn" \
"      isMember: user.memberships.some((m) => m.householdId === householdId)," "      isMember: true,"
mutate $RECIPES "29. Oppskriftene tar ikke hensyn til husholdningens allergier" \
"        householdAllergenWarnings: allergenConflicts(registered, context.householdAllergens)," "        householdAllergenWarnings: [],"
mutate $PLAN "30. Måltidsplanen tar ikke hensyn til husholdningens allergier" \
"      householdAllergenWarnings: allergenConflicts(registered, context.householdAllergens)," "      householdAllergenWarnings: [],"
mutate $WFILTER "31. Nettappen skjuler ikke oppskrifter med husholdningens allergener" \
"  return recipe.allergenWarnings.length > 0 || recipe.householdAllergenWarnings.length > 0;" "  return recipe.allergenWarnings.length > 0;"
mutate $WWATCH "32. Hurtiglageret for en husholdning man har forlatt, beholdes" \
"        queryClient.removeQueries({ queryKey: ['household', old.id] });" ""
mutate $WQC "33. En 404 får ikke sesjonen til å hentes på nytt" \
"    else if (householdData && error instanceof ApiError && error.status === 404) {" "    else if (false && householdData && error instanceof ApiError && error.status === 404) {"
mutate $WJOIN "34. Tokenet blir stående i adresselinjen" \
"    if (location.hash) void navigate(JOIN_PATH, { replace: true });" ""
rm -f "$backup"
