import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { AddNewTemplateModalComponent } from '../add-new-template-modal/add-new-template-modal.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  dashboardVisible = true;
  showDashboardUI = false;

  user: any;
  formListData: any[] = [];
  displayedColumns: string[] = [
    'formId',
    'template',
    'description',
    'createdAt',
    'actions',
  ];
  selectedForm: any = null;
  showFormEditor: boolean = false;
  dataSource = new MatTableDataSource<any>([]);
   paletteFields = [
    { id: 'project-title', label: 'Project Name', type: 'project-title' },
    { id: 'id',            label: 'ID Field',       type: 'id' },
    { id: 'description',   label: 'Description Field', type: 'textarea' },
    { id: 'date',          label: 'Date Field',     type: 'date' },
    { id: 'text',          label: 'Text Field',     type: 'text' },
    { id: 'number',        label: 'Number Field',   type: 'number' },
    { id: 'email',         label: 'Email Field',    type: 'email' },
    { id: 'branch',        label: 'Branch Field',   type: 'branch' },
    { id: 'tel',           label: 'Phone Field',    type: 'tel' },
    { id: 'radio',         label: 'Radio Field',    type: 'radio' },
    { id: 'file',          label: 'Photo',          type: 'file' },
    { id: 'empty',         label: 'Empty Box',      type: 'empty' },
    { id: 'signature',     label: 'Signature',      type: 'signature' },
    { id: 'submit',        label: 'Submit Button',  type: 'submit' }
  ];

  constructor(private router: Router, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.showDashboardUI = this.router.url === '/dashboard';
      }
    });

    this.loadSavedForms();

    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state;

    if (state?.['formSaved'] && state?.['formId']) {
      const savedForm = this.formListData.find(f => f.formId === state['formId']);
      if (savedForm) {
        this.openFormEditor(savedForm);
      }
    }

    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const template = data.formName ? data.formName.toLowerCase() : '';
      const description = data.description ? data.description.toLowerCase() : '';
      return template.includes(filter) || description.includes(filter);
    };

    const userData = localStorage.getItem('user');
    this.user = userData ? JSON.parse(userData) : null;
  }

  loadSavedForms() {
    const savedFormPages = localStorage.getItem('savedFormPages');
    this.formListData = savedFormPages ? JSON.parse(savedFormPages) : [];

    // Ensure each form has createdAt date
    this.formListData.forEach(form => {
      if (!form.createdAt) {
        form.createdAt = new Date().toISOString();
      }
    });

    this.dataSource.data = this.formListData;
  }

  applyFilter(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dataSource.filter = value.trim().toLowerCase();
  }

  addNew() {
    const dialogRef = this.dialog.open(AddNewTemplateModalComponent, {
      width: '400px',
      data: { message: '' },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Assuming result contains new form data
        result.formId = Date.now().toString();
        result.createdAt = new Date().toISOString();
        this.formListData.push(result);
        localStorage.setItem('savedFormPages', JSON.stringify(this.formListData));
        this.dataSource.data = this.formListData;
      }
    });
  }

  openFormEditor(form: any) {
    this.selectedForm = JSON.parse(JSON.stringify(form));
    this.showFormEditor = true;
  }

  saveEditedForm() {
    const index = this.formListData.findIndex(f => f.formId === this.selectedForm.formId);
    if (index > -1) {
      this.selectedForm.createdAt = this.selectedForm.createdAt || new Date().toISOString();
      this.formListData[index] = this.selectedForm;
      localStorage.setItem('savedFormPages', JSON.stringify(this.formListData));
      this.dataSource.data = this.formListData;
    }
    this.showFormEditor = false;
    this.selectedForm = null;
  }

  cancelEdit() {
    this.showFormEditor = false;
    this.selectedForm = null;
  }

  deleteTemplate(template: any) {
    if (confirm(`Are you sure you want to delete "${template.formName}"?`)) {
      this.formListData = this.formListData.filter(f => f.formId !== template.formId);
      localStorage.setItem('savedFormPages', JSON.stringify(this.formListData));
      this.dataSource.data = this.formListData;
    }
  }

  editTemplate(template: any): void {
    this.openFormEditor(template);
  }

  logout(): void {
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}