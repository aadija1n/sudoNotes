/* Phase 4: admin authentication (all in the browser, no server).

   auth.json (committed to the repo) holds:
     - a verifier hash of "username + password" (so the login can say yes/no)
     - your GitHub token, encrypted with AES-GCM using a key derived from the same password
   Key derivation: PBKDF2-SHA256, 600,000 iterations, one derivation gives 64 bytes:
   the first 32 are the public verifier, the last 32 are the encryption key.
   The decrypted token lives only in memory and disappears when you leave write mode. */

(function (global) {
  const ITERATIONS = 600000;
  const te = new TextEncoder();
  const td = new TextDecoder();
  const session = { token: null };
  let recordPromise = null;

  function fail(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }

  const b64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const normUser = (u) => String(u).trim().toLowerCase();

  function sameString(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function derive(username, password, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", te.encode(`${normUser(username)}\n${password}`), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 512);
    return {
      verifier: hex(bits.slice(0, 32)),
      key: await crypto.subtle.importKey("raw", bits.slice(32), "AES-GCM", false, ["encrypt", "decrypt"]),
    };
  }

  /* Builds the object that goes into auth.json. Used by setup.html. */
  async function createRecord(username, password, token) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const { verifier, key } = await derive(username, password, salt, ITERATIONS);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(token));
    return { v: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: b64(salt), verifier, iv: b64(iv), token: b64(cipher) };
  }

  function validRecord(r) {
    return r && r.v === 1 && ["salt", "verifier", "iv", "token"].every((k) => typeof r[k] === "string") &&
      Number.isInteger(r.iterations) && r.iterations >= 100000 && r.iterations <= 2000000;
  }

  /* Checks the credentials and, if they match, keeps the decrypted token in memory. */
  async function unlock(record, username, password) {
    if (!validRecord(record)) throw fail("bad-record", "The admin file is not valid.");
    let derived;
    try {
      derived = await derive(username, password, unb64(record.salt), record.iterations);
    } catch {
      throw fail("bad-record", "The admin file is not valid.");
    }
    if (!sameString(derived.verifier, record.verifier)) throw fail("bad-credentials", "Incorrect username or password.");
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(record.iv) }, derived.key, unb64(record.token));
      session.token = td.decode(plain);
    } catch {
      throw fail("bad-record", "The admin file is damaged.");
    }
    return session.token;
  }

  /* Fetches auth.json from the site (cached for the page session). */
  function loadRecord() {
    if (!recordPromise) {
      recordPromise = (async () => {
        let res;
        try {
          res = await fetch("auth.json", { cache: "no-cache" });
        } catch {
          throw fail("network", "Could not reach the site. Check your internet connection.");
        }
        if (res.status === 404) throw fail("not-setup", "Admin login has not been set up yet.");
        if (!res.ok) throw fail("http", `The admin file could not be loaded (${res.status}).`);
        try {
          const json = await res.json();
          if (!validRecord(json)) throw new Error("invalid");
          return json;
        } catch {
          throw fail("bad-record", "The admin file is not valid. Generate it again with setup.html.");
        }
      })();
      recordPromise.catch(() => { recordPromise = null; });
    }
    return recordPromise;
  }

  /* Advisory check that the token can see the repo and is allowed to write. */
  async function checkWriteAccess(token, repo) {
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
      });
    } catch {
      return { ok: null, reason: "Could not reach GitHub to check the token." };
    }
    if (res.status === 401) return { ok: false, reason: "GitHub rejected the token. It may have expired." };
    if (res.status === 404) return { ok: false, reason: "The token cannot see this repository." };
    if (!res.ok) return { ok: null, reason: `GitHub returned ${res.status}.` };
    const info = await res.json();
    if (info.permissions && info.permissions.push === false) return { ok: false, reason: "The token is read-only. It needs Contents: Read and write." };
    return { ok: true };
  }

  global.Auth = {
    createRecord,
    unlock,
    loadRecord,
    checkWriteAccess,
    getToken: () => session.token,
    isUnlocked: () => !!session.token,
    lock: () => { session.token = null; },
  };
})(typeof window !== "undefined" ? window : globalThis);
