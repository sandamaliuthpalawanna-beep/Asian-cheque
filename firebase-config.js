// Firebase initialization for Rio Enterprise Admin Panel
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit, runTransaction, serverTimestamp,
  onSnapshot, increment, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-OuU-u2SxwydsUnUzKQ-2Mro4YgDW-Jg",
  authDomain: "rio-enterprises.firebaseapp.com",
  projectId: "rio-enterprises",
  storageBucket: "rio-enterprises.firebasestorage.app",
  messagingSenderId: "620316792670",
  appId: "1:620316792670:web:435d73349f07ed22bd21cf",
  measurementId: "G-8RZSCYHJEH"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Analytics only works in a real browser with the right support — guard it
export let analytics = null;
analyticsIsSupported().then((ok) => { if (ok) analytics = getAnalytics(app); });

export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, runTransaction, serverTimestamp, onSnapshot,
  increment, writeBatch, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ref, uploadBytes, getDownloadURL
};
