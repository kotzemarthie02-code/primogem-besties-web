// ============================================================
//  firebase.js  –  Firestore live sync for Primogem Besties
//  1) Paste YOUR keys in firebaseConfig below (Firebase Console →
//     Project settings → General → Your apps → Web app → SDK config)
//  2) Keep this file in the SAME folder as index.html
// ============================================================
export const firebaseConfig = {
  apiKey:            "AIzaSyBoCKHkd1FhfNeFMnJInkqqgiX0GCjAJAQ",
  authDomain:        "trinityapp-28019.firebaseapp.com",
  projectId:         "trinityapp-28019",
  storageBucket:     "trinityapp-28019.firebasestorage.app",
  messagingSenderId: "72035223407",
  appId:             "1:72035223407:web:b1a40d9ce96ae479be4a9a"
};
// ============================================================

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const configured = !String(firebaseConfig.apiKey).startsWith("PASTE");

function fbError(what, e) {
  console.error("[Primogem] Firestore " + what + " error:", e);
  window.dispatchEvent(new CustomEvent("fb-error", { detail: { what, code: e && e.code, message: e && e.message } }));
}

if (!configured) {
  console.warn("[Primogem] firebase.js has no keys yet – running in local (single-phone) mode.");
  window.FB = { ready: false };
  window.dispatchEvent(new Event("fb-ready"));
} else {
  try {
    const { initializeApp } = await import(SDK + "firebase-app.js");
    const fs = await import(SDK + "firebase-firestore.js");
    const { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
            collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
            arrayUnion, arrayRemove, query, where, writeBatch } = fs;

    const app = initializeApp(firebaseConfig);
    // persistent cache = edits survive a reload and are re-sent automatically if the phone was offline
    // long-polling auto-detect = works on slow / filtered mobile networks too
    let db;
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        experimentalForceLongPolling: true
      });
    } catch (e) {
      console.warn("[Primogem] persistent cache not available, using default:", e);
      db = getFirestore(app);
    }
    const err = (what) => (e) => fbError(what, e);

    // wait for the SERVER to confirm every write; warn if it never does
    const track = (what, p) => {
      let done = false;
      const t = setTimeout(() => { if (!done) fbError(what + " NOT confirmed by server (8s)",
        { code: "timeout", message: "Your change is NOT saved online yet. Check: Firestore Database created? Rules published? Internet ok?" }); }, 8000);
      return p.then(() => { done = true; clearTimeout(t);
        window.dispatchEvent(new CustomEvent("fb-saved", { detail: what })); })
        .catch(e => { done = true; clearTimeout(t); fbError(what, e); });
    };

    window.FB = {
      ready: true,

      // ---- live listeners (onSnapshot) ----
      listenPlans(cb) {
        let got = false;
        const t = setTimeout(() => { if (!got) fbError("plans listener",
          { code: "unavailable", message: "Cannot reach Firestore after 12s. Is the Firestore Database created (Build > Firestore Database > Create database)? Rules published? Internet ok?" }); }, 12000);
        return onSnapshot(collection(db, "plans"),
          snap => { if (!snap.metadata.fromCache) { got = true; clearTimeout(t); }
                    cb(snap.docs.map(d => ({ ...d.data(), id: d.id })), snap.metadata); },
          e => { got = true; clearTimeout(t); fbError("plans listener", e); });
      },
      listenActivity(email, cb) {
        return onSnapshot(query(collection(db, "activity"), where("to", "==", email)),
          snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))), err("activity listener"));
      },

      // ---- plans ----
      addPlan(p)            { return track("addPlan", setDoc(doc(db, "plans", p.id), p)); },
      updatePlan(id, f)     { return track("updatePlan", updateDoc(doc(db, "plans", id), f)); },
      deletePlan(id)        { return track("deletePlan", deleteDoc(doc(db, "plans", id))); },
      join(id, name, email) { return track("join", updateDoc(doc(db, "plans", id),
                                { joined: arrayUnion(name), joinedIds: arrayUnion(email) })); },
      leave(id, name, email){ return track("leave", updateDoc(doc(db, "plans", id),
                                { joined: arrayRemove(name), joinedIds: arrayRemove(email) })); },
      async batchUpdate(ids, fields) {
        for (let i = 0; i < ids.length; i += 400) {
          const b = writeBatch(db);
          ids.slice(i, i + 400).forEach(id => b.update(doc(db, "plans", id), fields));
          await track("batchUpdate", b.commit());
        }
      },

      // ---- activity ----
      addActivity(a)          { return track("addActivity", setDoc(doc(db, "activity", a.id), a)); },
      updateActivity(id, f)   { return track("updateActivity", updateDoc(doc(db, "activity", id), f)); }
    };
    console.log("[Primogem] Firebase connected: project " + firebaseConfig.projectId);
  } catch (e) {
    fbError("startup", e);
    window.FB = { ready: false };
  }
  window.dispatchEvent(new Event("fb-ready"));
}
