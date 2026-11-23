/**
 * Separate each class method from the preceding member with a blank line.
 * Place the blank line above attached comments and decorators.
 * Keep the first member against the opening brace, as required by Oxfmt.
 * @bad A method declaration or its annotation touching the preceding member.
 * @bad A separating blank line below an annotation that touches the preceding member.
 */
export class Materializer {
  #active = false;

  /** Activate this materializer. */
  activate() {
    this.#active = true;
  }

  get active() {
    return this.#active;
  }
}
