import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { AddNewTemplateModalComponent } from '../add-new-template-modal/add-new-template-modal.component';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AddUserComponent } from '../add-user/add-user.component';
import { AuthService } from '../../services/auth.service'; // correct path to your service
import { PlantService } from '../../services/plant.service';  // update path if needed
import { AddPlantDialogComponent } from '../../components/add-plant-dialog/add-plant-dialog.component';
import { Observable } from 'rxjs';

interface FilledFormData {
  formId: string;
  name: string;
  data: Record<string, any>;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
    plants$!: Observable<any[]>
    showForm: boolean = false; 
  dashboardVisible = true;
  showDashboardUI = false;
  userBranch: string = '';
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
  plants: any[] = [];
selectedPlants: string[] = []; // store selected plant regoNames or IDs
 
  

  paletteFields = [
    { id: 'project-title', label: 'Project Name', type: 'project-title' },
    { id: 'id', label: 'ID Field', type: 'id' },
    { id: 'description', label: 'Description Field', type: 'textarea' },
    { id: 'date', label: 'Date Field', type: 'date' },
    { id: 'text', label: 'Text Field', type: 'text' },
    { id: 'number', label: 'Number Field', type: 'number' },
    { id: 'email', label: 'Email Field', type: 'email' },
    { id: 'branch', label: 'Branch Field', type: 'branch' },
    { id: 'tel', label: 'Phone Field', type: 'tel' },
    { id: 'radio', label: 'Radio Field', type: 'radio' },
    { id: 'file', label: 'Photo', type: 'file' },
    { id: 'empty', label: 'Empty Box', type: 'empty' },
    { id: 'signature', label: 'Signature', type: 'signature' },
    { id: 'submit', label: 'Submit Button', type: 'submit' },
  ];

  filledForms: FilledFormData[] = [];
  filledDataName: string = '';
  isFillingForm = false; // ✅ This fixes the error
  welcomeMessages: { [key: string]: string } = {
    NSW: 'Welcome to NSW! Let’s make today productive and inspiring.',
    YAT: 'Welcome to YATALA! We’re here to support your success.',
    MACKAY: 'Welcome to MACKAY! Let’s create an amazing experience.',
  };

  isAdmin: boolean = false;

  constructor(private router: Router, private dialog: MatDialog,private authService: AuthService,private plantService: PlantService ) {}

  ngOnInit(): void {
    this.userBranch = localStorage.getItem('userBranch') || '';
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.showDashboardUI = this.router.url === '/dashboard';
            this.isAdmin = this.authService.isAdmin();
      }
    });

    this.loadPlants();
    this.loadSavedForms();
    this.loadFilledForms();
  this.plants$ = this.plantService.getPlants();
    this.plants$.subscribe(plants => {
    this.plants = plants;
  });
    // Initialize data source filter for searching templates
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const formName = data.formName ? data.formName.toLowerCase() : '';
      const description = data.description
        ? data.description.toLowerCase()
        : '';
      return formName.includes(filter) || description.includes(filter);
    };

    // Load logged-in user info
    const userData = localStorage.getItem('user');
    this.user = userData ? JSON.parse(userData) : null;
  }

  loadSavedForms(): void {
    const savedFormPages = localStorage.getItem('savedFormPages');
    this.formListData = savedFormPages ? JSON.parse(savedFormPages) : [];

    // Add createdAt date if missing
    this.formListData.forEach((form) => {
      if (!form.createdAt) {
        form.createdAt = new Date().toISOString();
      }
    });

    this.dataSource.data = this.formListData;
  }

  loadFilledForms(): void {
    const stored = localStorage.getItem('filledForms');
    this.filledForms = stored ? JSON.parse(stored) : [];
    console.log('Loaded filled forms:', this.filledForms);
  }

  applyFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dataSource.filter = value.trim().toLowerCase();
  }

  addNew(): void {
    const dialogRef = this.dialog.open(AddNewTemplateModalComponent, {
      width: '400px',
      data: { message: '' },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        result.formId = Date.now().toString();
        result.createdAt = new Date().toISOString();
        this.formListData.push(result);
        localStorage.setItem(
          'savedFormPages',
          JSON.stringify(this.formListData)
        );
        this.dataSource.data = this.formListData;
      }
    });
  }

  openFormEditor(form: any): void {
    this.selectedForm = JSON.parse(JSON.stringify(form));
    this.showFormEditor = true;
  }

  saveEditedForm(): void {
    const index = this.formListData.findIndex(
      (f) => f.formId === this.selectedForm.formId
    );
    if (index > -1) {
      this.selectedForm.createdAt =
        this.selectedForm.createdAt || new Date().toISOString();
      this.formListData[index] = this.selectedForm;
      localStorage.setItem('savedFormPages', JSON.stringify(this.formListData));
      this.dataSource.data = this.formListData;
    }
    this.showFormEditor = false;
    this.selectedForm = null;
  }

  cancelEdit(): void {
    this.showFormEditor = false;
    this.selectedForm = null;
  }

  deleteTemplate(template: any): void {
    if (confirm(`Are you sure you want to delete "${template.formName}"?`)) {
      this.formListData = this.formListData.filter(
        (f) => f.formId !== template.formId
      );
      localStorage.setItem('savedFormPages', JSON.stringify(this.formListData));
      this.dataSource.data = this.formListData;
    }
  }

  getFormNameById(formId: string): string {
    const form = this.formListData.find((f) => f.formId === formId);
    return form ? form.formName || 'Unnamed Form' : 'Unknown Form';
  }

  openFilledForm(filled: FilledFormData): void {
    const formTemplate = this.formListData.find(
      (f) => f.formId === filled.formId
    );
    if (formTemplate) {
      this.selectedForm = JSON.parse(JSON.stringify(formTemplate));
      this.selectedForm.formPages.forEach((page: any) => {
        page.fields.forEach((field: any) => {
          field.value = filled.data[field.id];
        });
      });
      this.filledDataName = filled.name;
      this.showFormEditor = true;
    }
  }

  downloadFilledFormPDF(filled: FilledFormData): void {
    const formTemplate = this.formListData.find(
      (f) => f.formId === filled.formId
    );
    if (!formTemplate) {
      alert('Form template not found.');
      return;
    }
    // console.log('filledForms:', formTemplate);
    const localFilledForms = localStorage.getItem('filledForms');
    if (!localFilledForms) {
      alert('No filled forms found.');
      return;
    }
    // console.log('localFilledForms:', localFilledForms);
    if (localFilledForms) {
      const imgDataRes = localStorage.getItem('lastPdf-preview-image');
      let parsedImgData: string | null = null;
      if (imgDataRes) {
        try {
          // Try to parse as JSON (in case it's an object with imageData property)
          const imgDataObj = JSON.parse(imgDataRes);
          parsedImgData = imgDataObj?.imageData || null;
        } catch (e) {
          // If parsing fails, treat as plain string (data URL)
          parsedImgData = imgDataRes;
        }
      }

      if (parsedImgData) {
        const doc = new jsPDF();
        // Add a title centered at the top of the page
        const pageWidth = doc.internal.pageSize.getWidth();
        const title = formTemplate.formName || 'Filled Form';
        doc.setFontSize(20);
        const titleWidth = doc.getTextWidth(title);
        doc.text(title, (pageWidth - titleWidth) / 2, 20);

        // Filled data name
        doc.setFontSize(12);
        doc.text(`Filled Data Name: ${filled.name}`, 14, 30);

        // Add the image to the PDF (assuming PNG/JPEG data URL)
        try {
          // Default: add image at (10, 40) with width 180, height auto
          doc.addImage(parsedImgData, 'PNG', 10, 40, 180, 0);
        } catch (e) {
          console.log('Failed to add image to PDF:', e);
        }
        doc.save(`${filled.name || 'filled_form'}.pdf`);
      } else {
        alert('No image data found for PDF.');
      }
    }

    // const doc = new jsPDF();

    // // Title
    // doc.setFontSize(18);
    // doc.text(formTemplate.formName || 'Filled Form', 14, 20);

    // // Filled data name
    // doc.setFontSize(12);
    // doc.text(`Filled Data Name: ${filled.name}`, 14, 30);

    // let startY = 40;

    // formTemplate.formPages.forEach(
    //   (
    //     page: { fields: Array<{ id: string; label?: string; type: string }> },
    //     pageIndex: number
    //   ) => {
    //     doc.setFontSize(14);
    //     doc.text(`Page ${pageIndex + 1}`, 14, startY);
    //     startY += 8;

    //     const rows: any[] = [];

    //     page.fields.forEach((field) => {
    //       let value = filled.data[field.id];

    //       if (field.type === 'signature' && value) {
    //         try {
    //           doc.addImage(value, 'PNG', 14, startY, 50, 30);
    //           startY += 35;
    //         } catch {
    //           // ignore image errors
    //         }
    //       } else {
    //         rows.push([field.label || field.id, value || '']);
    //       }
    //     });

    //     if (rows.length > 0) {
    //       autoTable(doc, {
    //         startY,
    //         head: [['Field', 'Value']],
    //         body: rows,
    //         theme: 'striped',
    //         styles: { fontSize: 10 },
    //         margin: { left: 14, right: 14 },
    //       });
    //       startY = (doc as any).lastAutoTable.finalY + 10;
    //     }
    //   }
    // );

    // doc.save(`${filled.name || 'filled_form'}.pdf`);
  }

  deleteFilledForm(filled: FilledFormData): void {
    if (confirm(`Delete filled form "${filled.name}"?`)) {
      this.filledForms = this.filledForms.filter(
        (f) => !(f.formId === filled.formId && f.name === filled.name)
      );
      localStorage.setItem('filledForms', JSON.stringify(this.filledForms));
    }
  }

  closeFormEditor(): void {
    this.showFormEditor = false;
    this.selectedForm = null;
    this.filledDataName = '';
    this.loadFilledForms(); // refresh filled forms list after closing form editor
  }
  
openAddPlantDialog() {
  const dialogRef = this.dialog.open(AddPlantDialogComponent, {
    width: '400px'
  });

  dialogRef.afterClosed().subscribe((newPlant) => {
    if (newPlant) {
      // Refresh the list
      this.plants$ = this.plantService.getPlants();
    }
  });
}

  loadPlants() {
    this.plants$ = this.plantService.getPlants();
    this.plants$.subscribe(plants => {
      this.plants = plants;
    });
  }
togglePlantSelection(plantRego: string) {
  const index = this.selectedPlants.indexOf(plantRego);
  if (index > -1) {
    this.selectedPlants.splice(index, 1);
  } else {
    this.selectedPlants.push(plantRego);
  }
}
  logout(): void {
    localStorage.removeItem('user');
    localStorage.removeItem('userBranch'); // clear branch on logout
    this.router.navigate(['/login']);
  }
  
  saveSelectedPlants(): void {
  console.log('✅ Saving Selected Plants:', this.selectedPlants);
  localStorage.setItem('selectedPlants', JSON.stringify(this.selectedPlants));
  alert('Selected plants saved successfully!');
}
  openAddUserDialog(): void {
    console.log('Opening Add User dialog...');
    this.dialog
      .open(AddUserComponent, {
        width: '900px',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          console.log('New user created:', result);
          // You can update your user list here if you want
        }
      });
  }
}
