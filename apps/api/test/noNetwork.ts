/*
 * Spec 07: tests never call Open Food Facts (or anything else on the internet). The global fetch is replaced
 * for every test file; the provider tests inject their own fake fetch instead.
 */
globalThis.fetch = (input: string | URL | Request) => {
  const url = input instanceof Request ? input.url : String(input);
  return Promise.reject(
    new Error(`Tests must not use the network (tried ${new URL(url).hostname})`),
  );
};
