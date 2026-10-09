/**
 * Safe calculator: a small recursive-descent parser (no eval).
 * Grammar: + − × ÷, unary ±, parentheses, % (postfix, ÷100), √ (prefix), Ans.
 */
export function calculate(input: string, ans = 0): number {
  const src = input
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/\s+/g, "");
  let i = 0;
  const peek = () => src[i];
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-")
      v = src[i++] === "+" ? v + term() : v - term();
    return v;
  }
  function term(): number {
    let v = unary();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = unary();
      if (op === "/" && r === 0) throw new Error("Can’t divide by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function unary(): number {
    if (peek() === "-") return (i++, -unary());
    if (peek() === "+") return (i++, unary());
    if (peek() === "√") {
      i++;
      const v = unary();
      if (v < 0) throw new Error("Can’t take the root of a negative");
      return Math.sqrt(v);
    }
    return postfix();
  }
  function postfix(): number {
    let v = atom();
    while (peek() === "%") {
      i++;
      v /= 100;
    }
    return v;
  }
  function atom(): number {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (src[i++] !== ")") throw new Error("Missing )");
      return v;
    }
    if (src.startsWith("Ans", i)) return ((i += 3), ans);
    const m = /^\d*\.?\d+|^\d+\./.exec(src.slice(i));
    if (!m) throw new Error("Check your expression");
    i += m[0].length;
    return Number(m[0]);
  }
  const v = expr();
  if (i < src.length) throw new Error("Check your expression");
  if (!Number.isFinite(v)) throw new Error("Too big");
  return Number(v.toPrecision(12));
}
