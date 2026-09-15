import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Cloud Project Credentials[cite: 1]
const firebaseConfig = {
  apiKey: "AIzaSyBh9psTUL4ThSw1TZbd7hRpBZwCZLOeRHo",
  authDomain: "eduverse-e3cd3.firebaseapp.com",
  projectId: "eduverse-e3cd3",
  storageBucket: "eduverse-e3cd3.firebasestorage.app",
  messagingSenderId: "958916861356",
  appId: "1:958916861356:web:91b7493c1957ecf793ae09",
  measurementId: "G-77087V2C8M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc };