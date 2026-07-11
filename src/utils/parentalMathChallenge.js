/** Simple multiplication challenge for parent PIN recovery / unlock. */
export function createParentalMathChallenge() {
  const a = 3 + Math.floor(Math.random() * 9);
  const b = 3 + Math.floor(Math.random() * 9);
  return { a, b, answer: a * b };
}
