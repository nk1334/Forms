import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AddNewTemplateModalComponent } from '../add-new-template-modal/add-new-template-modal.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  user: any;
  currentTime = new Date().toLocaleString();
  formListData: any;
  displayedColumns: string[] = [
    'serialNo',
    'template',
    'description',
    'actions',
  ];
  dataSource = new MatTableDataSource<any>([]);

  applyFilter(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dataSource.filter = value.trim().toLowerCase();
  }

  addNew() {
    console.log('Add new template clicked');
    this.dialog.open(AddNewTemplateModalComponent, {
      width: '400px',
      data: { message: '' },
    });
  }

  constructor(private router: Router, private dialog: MatDialog) {}

  ngOnInit(): void {
    const userData = localStorage.getItem('user');
    const savedFormPages: any = localStorage.getItem('savedFormPages');
    this.formListData = JSON.parse(savedFormPages) || [];
    this.dataSource.data = this.formListData; // Set data for filtering
    this.user = userData ? JSON.parse(userData) : null;

    // Optional: Custom filter predicate for filtering by template or description
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const template = data.template ? data.template.toLowerCase() : '';
      const description = data.description ? data.description.toLowerCase() : '';
      return template.includes(filter) || description.includes(filter);
    };
  }

  logout(): void {
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }

  editTemplate(template: any): void {
    console.log('Edit template clicked', template);
    this.router.navigate(['/create-template'], {
      queryParams: { templateId: template.id },
    });
  }

  deleteTemplate(template: any): void {
    console.log('Delete template clicked', template);
    // Logic to delete the template
  }
}
