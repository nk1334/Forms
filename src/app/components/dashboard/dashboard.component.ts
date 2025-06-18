import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  user: any;
  currentTime = new Date().toLocaleString();
  displayedColumns: string[] = ['template', 'description', 'group', 'editDate'];
  dataSource = new MatTableDataSource([
    {
      template: 'Notification Of Repairs Required',
      description: '17551',
      group: 'Avante Linemarking NSW',
      editDate: new Date('2025-03-27T16:04:58')
    },
    {
      template: 'FRM-Q-326',
      description: 'INSPECTION AND TEST REPORT FORM...',
      group: 'Avante Linemarking NSW',
      editDate: new Date('2025-06-05T14:40:58')
    }
  ]);

  applyFilter(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dataSource.filter = value.trim().toLowerCase();
  }

  addNew() {
    console.log('Add new template clicked');
  }
  constructor(private router: Router) {}

  ngOnInit(): void {
    const userData = localStorage.getItem('user');
    this.user = userData ? JSON.parse(userData) : null;
  }

  logout(): void {
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}
