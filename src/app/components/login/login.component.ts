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
    branch:['',Validators.required],
      role: ['', Validators.required] 
  });
  branches=[
{label:'NSW',value:'NSW'},
{label:'YATALA',value:'YAT'},
{label:'MACKAY',value:'MACKAY'}
 ];

  error = '';
  roles: string[] = [
    'Crew',
    'Crew Leader',
    'OPS Supervisor',
    'R&M Person',
    'R&M Supervisor',
    'Branch Manager',
    'Payroll Team',
    'Payroll Supervisor',
    'HO',
    'Corporate',
    'Admin',
    'Guest',
    'GM',
    'CEO',
    'Finance Manager',
    'ISO Consultant'
  ];


  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}
  ngOnInit(): void {}
  async onSubmit() {
  if (this.loginForm.invalid) {
    this.error = 'Please fill in all required fields';
    return;
  }

  const username = this.loginForm.get('username')?.value || '';
  const password = this.loginForm.get('password')?.value || '';
  const rawBranch = (this.loginForm.get('branch')?.value || '').toString();
  const rawRole   = (this.loginForm.get('role')?.value || '').toString();
try {
    const result  = this.auth.login(username, password) as any;
    const success = typeof result?.then === 'function' ? await result : !!result;
    if (!success) { this.error = 'Invalid username or password'; return; }

    // ✅ Canonicalize branch to 'NSW' | 'YAT' | 'MACKAY'
    const branch = ['NSW','YAT','MACKAY'].includes(rawBranch.toUpperCase())
      ? (rawBranch.toUpperCase() as 'NSW'|'YAT'|'MACKAY')
      : 'NSW';
    localStorage.setItem('branch', branch);

    // ✅ Store a canonical role just for permission checks
    const isAdmin = rawRole.toLowerCase() === 'admin';
    localStorage.setItem('role', isAdmin ? 'admin' : 'crew');   // used by isAdmin() checks
    // (optional) keep the pretty label too
    localStorage.setItem('roleLabel', rawRole);

    // (optional) for header display
    localStorage.setItem('user', JSON.stringify({ username }));

    this.router.navigate(['dashboard']);
  } catch (e) {
    console.error(e);
    this.error = 'Login failed. Please try again.';
  }
}}
