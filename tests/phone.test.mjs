// Run: node tests/phone.test.mjs
import { normalizeIlPhone, displayIlPhone } from "../src/lib/phone.js";

let failures = 0;
const check = (name, cond) => { if (cond) console.log(`  ✓ ${name}`); else { console.error(`  ✗ ${name}`); failures++; } };

check("05X plain", normalizeIlPhone("0501234567") === "+972501234567");
check("with dashes", normalizeIlPhone("050-123-4567") === "+972501234567");
check("with spaces", normalizeIlPhone("050 123 4567") === "+972501234567");
check("already E.164", normalizeIlPhone("+972501234567") === "+972501234567");
check("972 without plus", normalizeIlPhone("972501234567") === "+972501234567");
check("landline rejected (02)", normalizeIlPhone("021234567") === null);
check("foreign rejected (+1)", normalizeIlPhone("+15551234567") === null);
check("too short", normalizeIlPhone("05012345") === null);
check("too long", normalizeIlPhone("05012345678") === null);
check("garbage", normalizeIlPhone("abc") === null);
check("empty", normalizeIlPhone("") === null);
check("display round-trip", displayIlPhone("+972501234567") === "050-123-4567");

if (failures) { console.error(`${failures} failures`); process.exit(1); }
console.log("all green");
