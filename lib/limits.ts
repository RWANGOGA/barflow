/**
 * Bounds shared by the write endpoints.
 *
 * Money and quantities live in 32-bit integer columns, so a value outside this range fails
 * inside the driver as an opaque 500 instead of a clear 400. The menu already caps prices at
 * 100 million; every other numeric writer has to agree, or a "delivery" of 3 billion bottles
 * can overflow the stock column and poison every later total.
 */
export const MAX_QUANTITY = 100_000_000

/** A recipe ratio is per drink, so it does not need the headroom a stock balance does. */
export const MAX_RECIPE_UNITS = 100_000

export function isWholeInRange(value: number, max = MAX_QUANTITY, min = 0): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}
