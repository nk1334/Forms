import { Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  User
} from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private users = [
    { username: 'admin', password: 'admin', role: 'crew-leader' },
    { username: 'crew', password: 'crew123', role: 'crew-member' },
  ];

  private currentUser: any = null;

  constructor(private auth: Auth) {
    this.auth.onAuthStateChanged(user => {
      if (user) {
        this.currentUser = user;
        localStorage.setItem('firebaseUser', JSON.stringify(user));
      } else {
        localStorage.removeItem('firebaseUser');
      }
    });
  }

  // Local mock login (username/password, roles)
  login(username: string, password: string): boolean {
    const user = this.users.find(
      (u) => u.username === username && u.password === password
    );
    if (user) {
      this.currentUser = user;
      localStorage.setItem('user', JSON.stringify(user));
      return true;
    }
    return false;
  }

  signup(username: string, password: string): boolean {
    const exists = this.users.find((u) => u.username === username);
    if (exists) return false;

    const newUser = { username, password, role: 'crew-member' };
    this.users.push(newUser);
    this.currentUser = newUser;
    localStorage.setItem('user', JSON.stringify(newUser));
    return true;
  }

  isLoggedIn() {
    localStorage.removeItem('user');
    this.currentUser = null;
  }

  getCurrentUserLocal() {
    if (!this.currentUser) {
      const stored = localStorage.getItem('user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    }
    return this.currentUser;
  }

  isLoggedInLocal(): boolean {
    return !!this.getCurrentUserLocal();
  }

  // Firebase Auth login/signup methods

  async loginFirebase(email: string, password: string): Promise<boolean> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      this.currentUser = userCredential.user;
      return true;
    } catch (error) {
      console.error('Firebase login failed', error);
      return false;
    }
  }

  async signupFirebase(email: string, password: string): Promise<boolean> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      this.currentUser = userCredential.user;
      await sendEmailVerification(userCredential.user);
      return true;
    } catch (error) {
      console.error('Firebase signup failed', error);
      return false;
    }
  }

  logoutFirebase(): Promise<void> {
    return signOut(this.auth);
  }

  // etc. - you can add Firebase password reset, get current Firebase user, etc.
}