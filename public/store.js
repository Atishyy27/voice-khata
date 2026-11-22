const DB_NAME = "voice-khata";
const STORE = "entries";
let dbPromise = null;

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function pad(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// [name, amount, direction, daysAgo]
const SEED = [
  ["Ramesh Sharma", 340, "credit", 4],
  ["Ramesh Sharma", 100, "payment", 3],
  ["Ramesh Sharma", 520, "credit", 1],
  ["Ramesh Doodhwala", 180, "credit", 4],
  ["Ramesh Doodhwala", 180, "payment", 2],
  ["Ramesh Doodhwala", 90, "credit", 0],
  ["Sita", 260, "credit", 3],
  ["Sita", 150, "payment", 1],
  ["Mohan", 700, "credit", 4],
  ["Mohan", 300, "payment", 2],
  ["Mohan", 125, "credit", 1],
  ["Pinky", 75, "credit", 2],
  ["Pinky", 210, "credit", 0],
  ["Anil", 430, "credit", 3],
  ["Anil", 200, "payment", 1],
];

function seedEntries() {
  const now = new Date();
  return SEED.map(([name, amount, direction, ago], i) => {
    const at = new Date(now.getTime() - ago * 86400000 - i * 60000);
    return {
      id: `seed-${i + 1}`,
      book: "khata",
      name,
      nameKey: name.toLowerCase(),
      amount,
      direction,
      date: ymd(at),
      at: at.toISOString(),
    };
  });
}

async function seedIfEmpty(db) {
  const count = await wrap(db.transaction(STORE).objectStore(STORE).count());
  if (count > 0) return;
  const tx = db.transaction(STORE, "readwrite");
  const os = tx.objectStore(STORE);
  for (const e of seedEntries()) os.put(e);
  await done(tx);
}

// book: "khata" (shop credit) or "kharcha" (household). An entry without a book is khata.
// No argument returns every entry.
export async function allEntries(book) {
  const db = await openDb();
  await seedIfEmpty(db);
  const all = await wrap(db.transaction(STORE).objectStore(STORE).getAll());
  return book ? all.filter((e) => (e.book || "khata") === book) : all;
}

export async function applyOps(ops) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const os = tx.objectStore(STORE);
  for (const op of ops || []) {
    if (op.op === "add") {
      os.put(op.entry);
    } else if (op.op === "update") {
      const req = os.get(op.id);
      req.onsuccess = () => {
        if (req.result) os.put({ ...req.result, ...op.patch });
      };
    }
  }
  await done(tx);
}

export async function resetDemo() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const os = tx.objectStore(STORE);
  os.clear();
  for (const e of seedEntries()) os.put(e);
  await done(tx);
}
