// The SQL playground: a tiny café database that runs in real SQLite (inside Python, inside Bento),
// challenges from "show everything" to "the biggest spender", and a plain-words picture of how each query runs.
export const SEED = `
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT, joined TEXT);
INSERT INTO customers VALUES
 (1,'Ana','Lisbon','2024-01-12'),(2,'Bo','Oslo','2024-02-03'),(3,'Chen','Paris','2024-02-20'),(4,'Dara','Paris','2024-03-08'),
 (5,'Eli','Lisbon','2024-04-15'),(6,'Femi','Lagos','2024-05-01'),(7,'Gus','Oslo','2024-06-11'),(8,'Hana','Tokyo','2024-07-19'),
 (9,'Ivo','Paris','2024-08-02'),(10,'Jo','Lagos','2024-09-24');
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL);
INSERT INTO products VALUES
 (1,'Espresso','drink',2.5),(2,'Latte','drink',3.8),(3,'Tea','drink',2.2),(4,'Croissant','food',2.9),
 (5,'Bagel','food',3.1),(6,'Cookie','food',1.8),(7,'Mug','merch',12.0),(8,'Beans','merch',9.5);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, product_id INTEGER, qty INTEGER, day TEXT);
INSERT INTO orders VALUES
 (1,1,2,1,'2026-11-02'),(2,1,4,2,'2026-11-02'),(3,3,1,1,'2026-11-02'),(4,4,2,2,'2026-11-03'),(5,2,7,1,'2026-11-03'),
 (6,5,3,1,'2026-11-04'),(7,6,5,3,'2026-11-04'),(8,3,6,4,'2026-11-04'),(9,9,8,1,'2026-11-05'),(10,7,1,2,'2026-11-05'),
 (11,8,2,1,'2026-11-06'),(12,1,8,1,'2026-11-06'),(13,10,4,2,'2026-11-06'),(14,4,6,6,'2026-11-07'),(15,3,2,1,'2026-11-07'),
 (16,9,1,3,'2026-11-07'),(17,6,7,1,'2026-11-08'),(18,2,3,2,'2026-11-08'),(19,5,5,1,'2026-11-08'),(20,8,8,2,'2026-11-08');
`;

export const TABLES = [
  ['customers', ['id', 'name', 'city', 'joined'], 10, 'people who come to the café'],
  ['products', ['id', 'name', 'category', 'price'], 8, 'what the café sells'],
  ['orders', ['id', 'customer_id', 'product_id', 'qty', 'day'], 20, 'who bought what, and when'],
];

// [id, title, goal, reference answer, hint, idea it teaches]
export const CHALLENGES = [
  [
    'all',
    'See everything',
    'Show every customer.',
    'SELECT * FROM customers;',
    '`SELECT *` means “every column”. `FROM` says which table.',
    'SELECT … FROM',
  ],
  [
    'cols',
    'Just two columns',
    'Show only the name and city of every customer.',
    'SELECT name, city FROM customers;',
    'List the columns you want after SELECT, separated by commas.',
    'choosing columns',
  ],
  [
    'where',
    'Only Paris',
    'Show the customers who live in Paris.',
    "SELECT * FROM customers WHERE city = 'Paris';",
    "`WHERE city = 'Paris'` keeps only matching rows. Text goes in 'single quotes'.",
    'WHERE',
  ],
  [
    'order',
    'Cheapest first',
    'Show every product, cheapest first.',
    'SELECT * FROM products ORDER BY price;',
    '`ORDER BY price` sorts small to big. Add `DESC` for big to small.',
    'ORDER BY',
  ],
  [
    'count',
    'How many orders?',
    'Count the orders.',
    'SELECT COUNT(*) FROM orders;',
    '`COUNT(*)` counts rows instead of showing them.',
    'COUNT',
  ],
  [
    'group',
    'Customers per city',
    'For each city, how many customers live there?',
    'SELECT city, COUNT(*) FROM customers GROUP BY city;',
    '`GROUP BY city` makes one pile per city; `COUNT(*)` then counts each pile.',
    'GROUP BY',
  ],
  [
    'join',
    'Who ordered?',
    'Show each order’s customer name next to its quantity.',
    'SELECT customers.name, orders.qty FROM orders JOIN customers ON customers.id = orders.customer_id;',
    'Orders only store `customer_id`. `JOIN customers ON customers.id = orders.customer_id` looks up the matching customer.',
    'JOIN',
  ],
  [
    'boss',
    'Biggest spender',
    'Total money each customer spent (qty × price), biggest spender first.',
    'SELECT customers.name, SUM(orders.qty * products.price) AS spent FROM orders JOIN customers ON customers.id = orders.customer_id JOIN products ON products.id = orders.product_id GROUP BY customers.name ORDER BY spent DESC;',
    'Join orders to both customers and products, `GROUP BY customers.name`, add up `SUM(orders.qty * products.price)`, then `ORDER BY` it `DESC`.',
    'JOIN + GROUP BY + SUM',
  ],
];

export function clauses(q) {
  const s = String(q || '')
    .trim()
    .replace(/;\s*$/, '');
  if (!/^select\b/i.test(s) || /\(\s*select\b/i.test(s) || /;\s*\S/.test(s) || /\bunion\b/i.test(s))
    return null;
  /** @type {Array<[number, string, number]>} where each clause starts, its keyword, the keyword's length */
  const marks = [];
  const re = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT)\b/gi;
  let m;
  let depth = 0;
  // ignore keywords inside quotes or parentheses
  const masked = s
    .replace(/'[^']*'/g, (x) => ' '.repeat(x.length))
    .split('')
    .map((c) => {
      if (c === '(') depth++;
      if (c === ')') depth--;
      return depth > 0 && c !== '(' ? ' ' : c;
    })
    .join('');
  while ((m = re.exec(masked)))
    marks.push([m.index, m[1].toUpperCase().replace(/\s+/g, ' '), m[0].length]);
  const out = {};
  marks.forEach(([i, k, len], j) => {
    out[k] = s.slice(i + len, j + 1 < marks.length ? marks[j + 1][0] : s.length).trim();
  });
  return out.FROM ? out : null;
}

// What to count at each step, and how to say each step in plain words
export function pipeline(q) {
  const c = clauses(q);
  if (!c) return null;
  const steps = [];
  const from = c.FROM;
  const joins = [...from.matchAll(/\bjoin\s+(\w+)/gi)].map((m) => m[1]);
  const base = from
    .split(/\bjoin\b/i)[0]
    .trim()
    .split(/\s+/)[0];
  steps.push({
    k: 'FROM',
    say: `Start with every row of ${base}`,
    count: `SELECT COUNT(*) FROM ${from.split(/\bjoin\b/i)[0]}`,
  });
  if (joins.length)
    steps.push({
      k: 'JOIN',
      say: `Match each row with its ${joins.join(' and ')}`,
      count: `SELECT COUNT(*) FROM ${from}`,
    });
  if (c.WHERE)
    steps.push({
      k: 'WHERE',
      say: `Keep only rows where ${c.WHERE}`,
      count: `SELECT COUNT(*) FROM ${from} WHERE ${c.WHERE}`,
    });
  if (c['GROUP BY'])
    steps.push({
      k: 'GROUP BY',
      say: `Make one pile per ${c['GROUP BY']}`,
      count: `SELECT COUNT(*) FROM (SELECT 1 FROM ${from}${c.WHERE ? ` WHERE ${c.WHERE}` : ''} GROUP BY ${c['GROUP BY']}${c.HAVING ? ` HAVING ${c.HAVING}` : ''})`,
    });
  if (c.HAVING) steps.push({ k: 'HAVING', say: `Keep only piles where ${c.HAVING}`, count: null });
  steps.push({
    k: 'SELECT',
    say: c.SELECT === '*' ? 'Show every column' : `Show ${c.SELECT}`,
    count: null,
  });
  if (c['ORDER BY'])
    steps.push({
      k: 'ORDER BY',
      say: `Sort by ${c['ORDER BY'].replace(/\s+desc\b/i, '')}, ${/\bdesc\b/i.test(c['ORDER BY']) ? 'biggest first' : 'smallest first'}`,
      count: null,
    });
  if (c.LIMIT) steps.push({ k: 'LIMIT', say: `Keep only the first ${c.LIMIT}`, count: null });
  return steps;
}

// The Python that runs it (SQLite ships inside Python): returns the result and the count at each step
export function runnerCode(query, counts = []) {
  return `import sqlite3, json
db = sqlite3.connect(":memory:")
db.executescript(${JSON.stringify(SEED)})
q = ${JSON.stringify(String(query))}
out = {}
try:
    parts = [p for p in q.split(";") if p.strip()]
    for p in parts[:-1]: db.execute(p)
    cur = db.execute(parts[-1]) if parts else None
    if cur is not None and cur.description:
        out = {"cols": [d[0] for d in cur.description], "rows": cur.fetchmany(300)}
    else:
        out = {"cols": [], "rows": [], "changed": db.total_changes}
except Exception as e:
    out = {"error": str(e)}
c = []
for cq in json.loads(${JSON.stringify(JSON.stringify(counts))}):
    try: c.append(db.execute(cq).fetchone()[0] if cq else None)
    except Exception: c.append(None)
out["counts"] = c
print("__SQL__" + json.dumps(out, default=str))
`;
}

// Same answer? Values only (column names may differ); order matters only when the reference sorts.
export function sameResult(a, b, ordered) {
  if (!a || !b || a.error || b.error) return false;
  const key = (r) =>
    JSON.stringify(r.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  const A = a.rows.map(key),
    B = b.rows.map(key);
  if (A.length !== B.length || a.cols.length !== b.cols.length) return false;
  if (ordered) return A.every((x, i) => x === B[i]);
  return JSON.stringify([...A].sort()) === JSON.stringify([...B].sort());
}
