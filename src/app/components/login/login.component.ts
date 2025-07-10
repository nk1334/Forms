import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  error = '';

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  onSubmit() {
  if (this.loginForm.invalid) {
    this.error = 'Please enter both username and password';
    return;
  }

  const username = this.loginForm.get('username')?.value || '';
  const password = this.loginForm.get('password')?.value || '';

  const success = this.auth.login(username, password);
  console.log('Login attempt:', { username, password, success });

  if (!success) {
    this.error = 'Invalid username or password';
  } else {
    this.router.navigate(['dashboard']);
  }
}
}
