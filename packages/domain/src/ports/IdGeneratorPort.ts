/**
 * The only way new identities enter the domain.
 *
 * Lint forbids `crypto` and `Math.random` here, so identifier generation is
 * injected. Tests get a counter, production gets `crypto.randomUUID`.
 */
export interface IdGeneratorPort {
  newId(): string;
}
