// auth.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private users = [
    { username: 'admin', password: 'admin', role: 'crew-leader' },
    { username: 'crew', password: 'crew123', role: 'crew-member' },
  ];

  private currentUser: any = null;

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

  logout() {
    localStorage.removeItem('user');
    this.currentUser = null;
  }

  getCurrentUser() {
    if (this.currentUser) return this.currentUser;
    const stored = localStorage.getItem('user');
    if (stored) return JSON.parse(stored);
    return null;
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentUser();
  }
}
