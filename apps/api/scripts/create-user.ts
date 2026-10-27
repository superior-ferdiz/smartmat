import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { registerSchema } from '@smartmat/shared';
import { loadConfig, loadRootEnvFile } from '../src/config';
import { createDb } from '../src/db';
import { createAuthRepo } from '../src/modules/auth/repo';
import { argon2Hasher } from '../src/modules/auth/password';
import { AuthService } from '../src/modules/auth/service';
import { defaultPwnedPasswordCheck } from '../src/providers/passwords/pwnedPasswords';

/*
 * ADR-0015: in the closed test environment registration is off, so the team's accounts are made here
 * (with the same rules as registration: household of one, argon2id). The password is read from the terminal,
 * never from the command line (it would end up in the shell history and the process list).
 *
 *   docker exec -it smartmat-staging-app npm run create-user -w @smartmat/api -- --email kari@example.no --name Kari
 */

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});

loadRootEnvFile();
const config = loadConfig();
// The prompt is shown, the typed password is not (nothing is echoed after the prompt).
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
const answer = rl.question('Passord (minst 12 tegn): ');
muted = true;
const password = await answer;
rl.close();
process.stdout.write('\n');

const parsed = registerSchema.safeParse({
  email: values.email,
  displayName: values.name,
  password,
});
if (!parsed.success) {
  // The keys only (validation.email.invalid …), never the values.
  console.error(
    'Ugyldig:',
    parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
  );
  process.exit(1);
}

const db = createDb(config.databaseUrl);
try {
  const service = new AuthService({
    repo: createAuthRepo(db),
    hasher: argon2Hasher,
    now: () => new Date(),
    pwned: defaultPwnedPasswordCheck(config),
  });
  const { user, session } = await service.register(parsed.data);
  // The session registration creates is not needed: the person logs in in the browser.
  await service.logout(session.token);
  console.log(`Kontoen er laget (bruker-id ${user.id}).`);
} catch (error) {
  console.error('Kontoen ble ikke laget:', error instanceof Error ? error.name : 'ukjent feil');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
