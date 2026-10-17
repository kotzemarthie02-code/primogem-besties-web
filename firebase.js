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
    const { initializeFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
            arrayUnion, arrayRemove, query, where, writeBatch } = fs;

    const app = initializeApp(firebaseConfig);
    // long-polling auto-detect = works on slow / filtered mobile networks too
    const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    const err = (what) => (e) => fbError(what, e);

    window.FB = {
      ready: true,

      // ---- live listeners (onSnapshot) ----
      listenPlans(cb) {
        return onSnapshot(collection(db, "plans"),
          snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id })), snap.metadata), err("plans listener"));
      },
      listenActivity(email, cb) {
        return onSnapshot(query(collection(db, "activity"), where("to", "==", email)),
          snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))), err("activity listener"));
      },

      // ---- plans ----
      addPlan(p)            { return setDoc(doc(db, "plans", p.id), p).catch(err("addPlan")); },
      updatePlan(id, f)     { return updateDoc(doc(db, "plans", id), f).catch(err("updatePlan")); },
      deletePlan(id)        { return deleteDoc(doc(db, "plans", id)).catch(err("deletePlan")); },
      join(id, name, email) { return updateDoc(doc(db, "plans", id),
                                { joined: arrayUnion(name), joinedIds: arrayUnion(email) }).catch(err("join")); },
      leave(id, name, email){ return updateDoc(doc(db, "plans", id),
                                { joined: arrayRemove(name), joinedIds: arrayRemove(email) }).catch(err("leave")); },
      async batchUpdate(ids, fields) {
        for (let i = 0; i < ids.length; i += 400) {
          const b = writeBatch(db);
          ids.slice(i, i + 400).forEach(id => b.update(doc(db, "plans", id), fields));
          await b.commit().catch(err("batchUpdate"));
        }
      },

      // ---- activity ----
      addActivity(a)          { return setDoc(doc(db, "activity", a.id), a).catch(err("addActivity")); },
      updateActivity(id, f)   { return updateDoc(doc(db, "activity", id), f).catch(err("updateActivity")); }
    };
    console.log("[Primogem] Firebase connected: project " + firebaseConfig.projectId);
  } catch (e) {
    fbError("startup", e);
    window.FB = { ready: false };
  }
  window.dispatchEvent(new Event("fb-ready"));
}
