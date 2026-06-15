/**
 * One-time script: promote abubackerraiyan@gmail.com to admin in Firestore.
 * Run with: node scripts/promote-admin.mjs
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB33KC6pcPfzKz2MEPDQ6aNBu8T0lU8Y98",
  authDomain: "inventory-1390b.firebaseapp.com",
  projectId: "inventory-1390b",
  storageBucket: "inventory-1390b.firebasestorage.app",
  messagingSenderId: "287931209007",
  appId: "1:287931209007:web:40d892b6840d8a6fdbbdda",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const TARGET_EMAIL = 'abubackerraiyan@gmail.com';

const usersRef = collection(db, 'users');
const q = query(usersRef, where('email', '==', TARGET_EMAIL));
const snap = await getDocs(q);

if (snap.empty) {
  console.log(`⚠️  No Firestore record found for ${TARGET_EMAIL}.`);
  console.log('   They will be auto-approved as admin when they first sign in — no action needed.');
} else {
  const docData = snap.docs[0];
  await setDoc(doc(db, 'users', docData.id), { role: 'admin', status: 'Active' }, { merge: true });
  console.log(`✅  Promoted ${TARGET_EMAIL} → role: admin, status: Active (doc: ${docData.id})`);
}

process.exit(0);
