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
{label:'MACKAY',value:'MKAY'}
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
  onSubmit() {
  if (this.loginForm.invalid) {
    this.error = 'Please fill in all required fields';
    return;
  }

  const username = this.loginForm.get('username')?.value || '';
  const password = this.loginForm.get('password')?.value || '';
  const branch = this.loginForm.get('branch')?.value || '';
  const role = this.loginForm.get('role')?.value || '';

  const success = this.auth.login(username, password);

  console.log('Login attempt:', { username, password, branch, role, success });

  if (!success) {
    this.error = 'Invalid username or password';
  } else {
    localStorage.setItem('userBranch', branch);
    this.router.navigate(['dashboard']);
  }
}
}
