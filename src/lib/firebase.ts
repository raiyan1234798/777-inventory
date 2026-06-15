import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB33KC6pcPfzKz2MEPDQ6aNBu8T0lU8Y98",
  authDomain: "inventory-1390b.firebaseapp.com",
  projectId: "inventory-1390b",
  storageBucket: "inventory-1390b.firebasestorage.app",
  messagingSenderId: "287931209007",
  appId: "1:287931209007:web:40d892b6840d8a6fdbbdda",
  measurementId: "G-NN01FJM2QY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
// Force account picker every time so users can switch accounts cleanly
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
};
