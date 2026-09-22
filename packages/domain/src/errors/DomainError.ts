/**
 * Base class for every error the domain raises.
 *
 * Domain errors are explicit types, never bare strings, so that callers can
 * discriminate on them without parsing messages.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
