export type JsonFormatErrorFactory = () => Error;

/**
 * Parse the shared CLI output contract. A present --format flag must have
 * exactly one value (`json`); a missing value or duplicate flag is invalid.
 */
export function readJsonFormat(
  args: readonly string[],
  onInvalid: JsonFormatErrorFactory,
): "json" | undefined {
  const indexes: number[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--format") indexes.push(index);
  }
  if (indexes.length === 0) return undefined;
  if (indexes.length !== 1 || args[indexes[0] + 1] !== "json") throw onInvalid();
  return "json";
}
