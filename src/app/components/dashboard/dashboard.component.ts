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
  dashboardVisible = true;
  user: any;
  currentTime = new Date().toLocaleString();
  formListData: any[]=[];
  displayedColumns: string[] = [
    'formId',
    'template',
    'description',
    'actions',
  ];
    selectedForm: any = null;       // <-- Add here
  showFormEditor: boolean = false; // <-- Add here
  dataSource = new MatTableDataSource<any>([]);

  constructor(private router: Router, private dialog: MatDialog) {}

  ngOnInit(): void {
    
    const navigation=this.router.getCurrentNavigation();
     const state = navigation?.extras?.state;
     const userData = localStorage.getItem('user');
       this.user = userData ? JSON.parse(userData) : null;
    const savedFormPages = localStorage.getItem('savedFormPages');
    this.formListData = savedFormPages ? JSON.parse(savedFormPages) : [];
    this.dataSource.data = this.formListData;
  
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
  }
   openFormEditor(form: any) {
    this.selectedForm = JSON.parse(JSON.stringify(form));
    this.showFormEditor = true;
  }
   loadSavedForms() {
    const savedFormPages = localStorage.getItem('savedFormPages');
    this.formListData = savedFormPages ? JSON.parse(savedFormPages) : [];
    this.dataSource.data = this.formListData;
  }

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

  

  logout(): void {
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }

  editTemplate(template: any): void {
    console.log('Edit template clicked', template);
    this.router.navigate(['/template'], {
      queryParams: { templateId: template.formId }
    });
  }
saveEditedForm() {
  // Update the formListData with selectedForm changes
  const index = this.formListData.findIndex(f => f.formId === this.selectedForm.formId);
  if (index > -1) {
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
      let savedFormPages = localStorage.getItem('savedFormPages');
      if (savedFormPages) {
        let forms = JSON.parse(savedFormPages) as any[];
        forms = forms.filter(f => f.formId !== template.formId); // Remove the selected form
        localStorage.setItem('savedFormPages', JSON.stringify(forms));
        this.loadSavedForms(); // Refresh the table data
      }
  }
  }
}
