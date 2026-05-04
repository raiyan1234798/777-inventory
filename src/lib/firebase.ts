import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCCmkNhkx9FbUtV4m2IQM-LzvM0AdV4IVo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "zwashdemo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "zwashdemo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "zwashdemo.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "233891684120",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:233891684120:web:266e0ffcc84a164da0886d",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-MLP7E4JGEJ"
};

console.log("Firebase Init Project ID:", firebaseConfig.projectId);
// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };
