/**
 * The `default:` arm of a `switch` that must name every member of a union.
 *
 * `assertNever(value)` only compiles when `value` has narrowed to `never`, so
 * adding a member to the union (a seventh `ItemType`, say) turns every switch
 * that forgot it into a compile error at the switch, instead of a statement
 * that silently does nothing at runtime. The throw is for the one way past the
 * type checker — a value that arrived untyped (a cast, a database row, a wire
 * payload) — and says what it was rather than falling through.
 */
export const assertNever = (value: never, what: string): never => {
  throw new Error(`unhandled ${what}: ${JSON.stringify(value)}`);
};
