import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCents, balances, settleUp, parseAmount, eventShares, type LedgerEvent } from "../lib/ledger.ts";

const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

test("splitCents distributes remainder and always sums to total", () => {
  for (const amt of [1, 100, 1001, 4999, 7]) {
    for (const n of [1, 2, 3, 7, 9]) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const m = splitCents(amt, ids, amt);
      assert.equal(sum(m), amt);
      const vals = [...m.values()];
      assert.ok(Math.max(...vals) - Math.min(...vals) <= 1);
    }
  }
});

test("splitCents rotates the extra cent by seed", () => {
  assert.deepEqual([...splitCents(100, [1, 2, 3], 0)], [[1, 34], [2, 33], [3, 33]]);
  assert.deepEqual([...splitCents(100, [1, 2, 3], 1)], [[1, 33], [2, 34], [3, 33]]);
});

test("splitCents with nobody returns empty", () => {
  assert.equal(splitCents(100, []).size, 0);
});

test("court split among attendees, paddles among selected", () => {
  const ev: LedgerEvent = {
    id: 1,
    attendees: [1, 2, 3, 4],
    expenses: [
      { id: 10, amountCents: 4000, paidBy: 1, splitMode: "attendees", sharers: [] },
      { id: 11, amountCents: 1000, paidBy: 2, splitMode: "selected", sharers: [3, 4] },
    ],
  };
  assert.deepEqual(Object.fromEntries(eventShares(ev)), { 1: 1000, 2: 1000, 3: 1500, 4: 1500 });
  const net = balances([ev], []);
  assert.deepEqual(Object.fromEntries(net), { 1: 3000, 2: 0, 3: -1500, 4: -1500 });
  assert.equal(sum(net), 0);
});

test("payments reduce balances and settleUp clears everything", () => {
  const ev: LedgerEvent = {
    id: 1,
    attendees: [1, 2, 3],
    expenses: [{ id: 1, amountCents: 3000, paidBy: 1, splitMode: "attendees", sharers: [] }],
  };
  let net = balances([ev], [{ from: 2, to: 1, amountCents: 1000 }]);
  assert.deepEqual(Object.fromEntries(net), { 1: 1000, 2: 0, 3: -1000 });
  const t = settleUp(net);
  assert.deepEqual(t, [{ from: 3, to: 1, amountCents: 1000 }]);
  net = balances([ev], [{ from: 2, to: 1, amountCents: 1000 }, ...t]);
  assert.ok([...net.values()].every((c) => c === 0));
});

test("settleUp uses at most n-1 transfers", () => {
  const net = new Map([[1, 5000], [2, -1234], [3, -2766], [4, 1500], [5, -2500]]);
  const t = settleUp(net);
  assert.ok(t.length <= 4);
  const after = new Map(net);
  for (const x of t) {
    after.set(x.from, after.get(x.from)! + x.amountCents);
    after.set(x.to, after.get(x.to)! - x.amountCents);
  }
  assert.ok([...after.values()].every((c) => c === 0));
});

test("parseAmount", () => {
  assert.equal(parseAmount("12"), 1200);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount("$12.05"), 1205);
  assert.equal(parseAmount("1,200.00"), 120000);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("-5"), null);
  assert.equal(parseAmount("1.234"), null);
  assert.equal(parseAmount("abc"), null);
});
