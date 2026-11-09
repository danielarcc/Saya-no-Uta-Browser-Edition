// Small numeric expression parser. Never evaluates JavaScript or property access.
export type Variables = Record<string, number>;
export function evaluate(input: string, vars: Variables): number {
    const s = input.replace(/^\$/, '').trim();
    if (!s)
        return 0;
    const rx = /\s*(\d+(?:\.\d+)?|[\p{L}_][\p{L}\p{N}_]*|==|!=|<=|>=|&&|\|\||[()+\-*/%!<>=])/uy;
    const tokens: string[] = [];
    let offset = 0;
    while (offset < s.length) {
        rx.lastIndex = offset;
        const m = rx.exec(s);
        if (!m)
            throw new Error(`Unsupported expression: ${input}`);
        tokens.push(m[1]);
        offset = rx.lastIndex;
    }
    let i = 0;
    const prec: Record<string, number> = { '||': 1, '&&': 2, '=': 3, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
    function primary(): number { const t = tokens[i++]; if (t === undefined)
        throw new Error('Incomplete expression'); if (t === '(') {
        const v = expr(0);
        if (tokens[i++] !== ')')
            throw new Error('Unclosed parenthesis');
        return v;
    } if (t === '!')
        return +!primary(); if (t === '-')
        return -primary(); if (t === '+')
        return primary(); if (/^\d/.test(t))
        return Number(t); if (/^[\p{L}_]/u.test(t))
        return Object.hasOwn(vars, t) ? vars[t] : 0; throw new Error(`Invalid operand: ${t}`); }
    function expr(min: number): number {
        let a = primary();
        while (i < tokens.length && Object.hasOwn(prec, tokens[i]) && prec[tokens[i]] >= min) {
            const op = tokens[i++];
            const b = expr(prec[op] + 1);
            switch (op) {
                case '+':
                    a += b;
                    break;
                case '-':
                    a -= b;
                    break;
                case '*':
                    a *= b;
                    break;
                case '/':
                    if (!b)
                        throw new Error('Division by zero');
                    a /= b;
                    break;
                case '%':
                    if (!b)
                        throw new Error('Division by zero');
                    a %= b;
                    break;
                case '=':
                case '==':
                    a = +(a === b);
                    break;
                case '!=':
                    a = +(a !== b);
                    break;
                case '<':
                    a = +(a < b);
                    break;
                case '>':
                    a = +(a > b);
                    break;
                case '<=':
                    a = +(a <= b);
                    break;
                case '>=':
                    a = +(a >= b);
                    break;
                case '&&':
                    a = +(!!a && !!b);
                    break;
                case '||': a = +(!!a || !!b);
            }
        }
        return a;
    }
    const v = expr(0);
    if (i !== tokens.length || !Number.isFinite(v))
        throw new Error(`Invalid expression: ${input}`);
    return v;
}

