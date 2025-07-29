import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-add-user',
  templateUrl: './add-user.component.html',
  styleUrls: ['./add-user.component.scss']
})
export class AddUserComponent {
  userForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddUserComponent>
  ) {
    this.userForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      role: ['', Validators.required],
      sendWeeklyEmail: [false]
    });
  }
  
  closeForm(): void {
    this.dialogRef.close();  // This closes the dialog
  }

  onSubmit(): void {
    if (this.userForm.valid) {
      const userData = this.userForm.value;
      const existingUsers = JSON.parse(localStorage.getItem('users') || '[]');
      existingUsers.push(userData);
      localStorage.setItem('users', JSON.stringify(existingUsers));
      alert('User Created Successfully!');
      this.userForm.reset();
       this.closeForm(); // 👈 Add this line
    } else {
      alert('Please fill all required fields.');
    }
  }
}