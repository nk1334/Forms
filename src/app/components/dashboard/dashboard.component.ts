import { Component, OnInit } from '@angular/core';
import {Router, NavigationEnd } from '@angular/router';
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
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChangeDetectorRef } from '@angular/core';
import { FormService, SavedForm } from 'src/app/services/form.service';
import { Branch } from 'src/app/permissions.model';       
import { Permission } from 'src/app/permissions.model';
import { MatMenuTrigger } from '@angular/material/menu';
import { environment } from 'src/environments/environment';

type BranchId = 'NSW' | 'YAT' | 'MACKAY';


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
    public Permission = Permission;
      canViewTemplates = false;
    branch: Branch = 'NSW';
  userBranch: Branch = 'NSW'; 

  templates: SavedForm[] = [];
  searchValue = '';
  tabIndex = 0; 
isAddUserOpen = false;
isAddPlantOpen = false;
    plants$!: Observable<any[]>
    showForm: boolean = false; 
  dashboardVisible = true;
  showDashboardUI = false;
  env = environment;
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
   filteredTemplates: SavedForm[] = [];   // 👈 new
  currentBranch: Branch = 'NSW'; 
  

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

  constructor(

  private router: Router,
  private dialog: MatDialog,
public  authService: AuthService,
  private plantService: PlantService,
  private snackBar: MatSnackBar,     // <-- add
  private cdr: ChangeDetectorRef,
    private formService: FormService,
     

) {}

downloading = new Set<string>();
trackByRego = (_: number, p: { regoName: string }) => p.regoName;

hasPdf(f: any): boolean {
  return !!f?.pdfUrl;
}

isDownloading(id?: string): boolean {
  return id ? this.downloading.has(String(id)) : false;
}
pdfTooltip(f: any): string {
  return this.isDownloading(f?.formId)
    ? 'Generating…'
    : (this.hasPdf(f) ? 'Open PDF' : 'Generate PDF');
}
private startDirectDownload(url: string, filename = 'form.pdf') {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async ngOnInit(): Promise<void> {
  // Use the consistent key 'branch' set at login
 const raw = localStorage.getItem('branch') as BranchId | null;
  this.userBranch = (raw === 'NSW' || raw === 'YAT' || raw === 'MACKAY') ? raw : 'NSW';
  this.branch = this.userBranch; // ✅ both BranchId now

const cached = this.readTplCache();
if (cached.length) {
  this.templates = cached;
  this.dataSource.data = cached;
}
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
    await this.loadTemplatesFor(this.branch);
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
  
  applyBranchFilter(): void {
  this.filteredTemplates = this.templates.filter(t =>
    t.allowedBranches?.includes('ALL') ||
    t.allowedBranches?.includes(this.currentBranch)
  );
  this.dataSource.data = this.filteredTemplates;  // update your table
}
    get canSeeTemplates(): boolean {
    return environment.bypassPerms ||
           this.authService.hasPermission(Permission.TEMPLATES_VIEW);
  }

  
clearSearch(): void {
  this.searchValue = '';
  this.dataSource.filter = '';
}


// keep your existing applyFilter but make sure it updates searchValue too:


// hook for the + button in the Templates header
createTemplate(): void {
  // reuse your existing add-new flow
  this.addNew();
}
  onSubtabChange(i: number) {
  if (i === 1) {            // Add Plant
    if (!this.isAddPlantOpen) {
      this.isAddPlantOpen = true;
      const ref = this.dialog.open(AddPlantDialogComponent, { width: '400px', disableClose: true });
      ref.afterClosed().subscribe((newPlant) => {
        this.isAddPlantOpen = false;
        if (newPlant) this.plants$ = this.plantService.getPlants();
      });
    }
    this.tabIndex = 0;      // bounce back to Select Plants (keeps UI short)
  }

  if (i === 2) {            // Add User
    if (!this.isAddUserOpen) {
      this.isAddUserOpen = true;
      const ref = this.dialog.open(AddUserComponent, { width: '900px', disableClose: true });
      ref.afterClosed().subscribe(() => this.isAddUserOpen = false);
    }
    this.tabIndex = 0;      // bounce back
  }
  }
  private readonly TPL_CACHE_KEY = 'templatesCache:v1';

private writeTplCache(list: SavedForm[]) {
  localStorage.setItem(this.TPL_CACHE_KEY, JSON.stringify(list || []));
}

private readTplCache(): SavedForm[] {
  try { return JSON.parse(localStorage.getItem(this.TPL_CACHE_KEY) || '[]'); }
  catch { return []; }
}
   private _dialogPositionNear(trigger?: HTMLElement): { top: string; left: string } | undefined {
    if (!trigger) return undefined;
    const r = trigger.getBoundingClientRect();
    const top  = r.bottom + window.scrollY + 8;
    const left = r.left   + window.scrollX;
    return { top: `${top}px`, left: `${left}px` };
  }
 private async loadTemplatesFor(b: Branch): Promise<void> {
  try {
    const admin = this.authService?.isAdmin?.() ?? false;
    const list = (admin && b === 'ALL')
      ? await this.formService.getFormTemplates()
      : await this.formService.getVisibleTemplatesForBranch(b);

    // normalize + default visibility
    const normalized: SavedForm[] = (list || []).map((d: any) => ({
      formId: d.id || d.formId,
      formName: d.formName || d.name || 'Untitled',
      allowedBranches: d.allowedBranches?.length ? d.allowedBranches : ['ALL'],
      ...d
    }));

    this.templates = normalized;
    this.dataSource.data = normalized;

    // ✅ write-through cache so next reload shows instantly
    this.writeTplCache(normalized);
  } catch (e) {
    console.error(e);
    this.snackBar.open('Failed to load templates for branch.', 'Close', { duration: 3000 });
  }
}
onViewingBranchChange(b: Branch) {
  this.branch = b;
  localStorage.setItem('branch', b);

  // show something right away from cache (in case Firestore is slow)
  const cached = this.readTplCache();
  if (cached.length) {
    // only filter client-side if you want to hide out-of-branch items immediately
    const inBranch = (t: SavedForm) =>
      b === 'ALL' ||
      (t.allowedBranches?.includes('ALL') || t.allowedBranches?.includes(b));
    const filtered = cached.filter(inBranch);
    this.templates = filtered;
    this.dataSource.data = filtered;
  }

  // then refresh from server
  this.loadTemplatesFor(b);
}

onUserCreated(user: any) {
  console.log('User created:', user);
  // do any list refresh here if needed
  this.tabIndex = 0; // optional: bounce back to Select Plants
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
  const raw = localStorage.getItem('filledForms');
  const arr: any[] = raw ? JSON.parse(raw) : [];

  // Normalize to: { id, formId (source template), name, pdfUrl }
  this.filledForms = arr.map(x => ({
    id: x.id ?? x.formId ?? '',                  // FILLED instance id
    formId: x.sourceFormId ?? x.formId ?? '',    // source template id
    name: x.formName ?? x.name ?? 'Untitled',
    pdfUrl: x.pdfUrl ?? x.formPdfPreview ?? null,
  })) as any[];
}

private reapplySearch() {
  if (!this.searchValue) { this.dataSource.filter = ''; return; }
  this.dataSource.filter = this.searchValue.trim().toLowerCase();
}

applyFilter(event: Event): void {
  this.searchValue = (event.target as HTMLInputElement).value || '';
  this.reapplySearch();
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
      this.formListData = this.formListData.filter((f) => f.formId !== template.formId);
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

async downloadFilledFormPDF(f: any) {
  const id = String(f?.formId ?? '');
  if (!id || this.isDownloading(id)) return;

  const filename = `${f?.name || f?.formName || 'form'}.pdf`;

  // If we think we have a real PDF, verify & download
  if (this.hasPdf(f)) {
    try {
      const res = await fetch(f.pdfUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('pdf') && !ct.includes('octet-stream')) {
        throw new Error(`Unexpected content-type: ${ct}`);
      }

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      this.startDirectDownload(objUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objUrl), 15000);
      this.snackBar.open('PDF download started.', 'Close', { duration: 2000 });
      return;
    } catch (e) {
      console.warn('[Dashboard] Stored pdfUrl unusable, will regenerate:', e, f?.pdfUrl);
      // fall through to regenerate
    }
  }

  // No usable PDF -> hand off to /forms to generate+upload, then bounce back
    this.downloading.add(id);
  this.cdr.markForCheck();

  this.router.navigate(['/forms'], {
    queryParams: { download: id, back: this.router.url }
  }).finally(() => {
    this.downloading.delete(id);
    this.cdr.markForCheck();
  });
}
onAvatarClick(ev: MouseEvent, trigger: MatMenuTrigger) {
  ev.preventDefault();
  ev.stopPropagation();
  // Defer to next microtask to dodge focus/overlay timing issues
  setTimeout(() => trigger.openMenu());
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
  
openAddPlantDialog(ev: MouseEvent) {
  if (this.isAddPlantOpen) return;
  this.isAddPlantOpen = true;

  const ref = this.dialog.open(AddPlantDialogComponent, {
    panelClass: 'full-screen-dialog-pane',
    width: '100vw',
    height: '100vh',
    maxWidth: '100vw',
    maxHeight: '100vh',
    disableClose: true,
    autoFocus: false,
     data: { branch: this.userBranch }
  });

  ref.afterClosed().subscribe((newPlant) => {
    this.isAddPlantOpen = false;
    if (newPlant) {
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
async logout(): Promise<void> {
  try {
    await this.authService.logout(); // unified logout in AuthService
  } finally {
    this.router.navigate(['/login']);
  }
}
  async onLogout(): Promise<void> {
  await this.authService.logout();
  this.router.navigate(['/login']);
}


  
  saveSelectedPlants(): void {
  console.log('✅ Saving Selected Plants:', this.selectedPlants);
  localStorage.setItem('selectedPlants', JSON.stringify(this.selectedPlants));
  alert('Selected plants saved successfully!');
}
openAddUserDialog(ev: MouseEvent) {
  if (this.isAddUserOpen) return;
  this.isAddUserOpen = true;

  const ref = this.dialog.open(AddUserComponent, {
    panelClass: 'full-screen-dialog-pane',
    width: '100vw',
    height: '100vh',
    maxWidth: '100vw',
    maxHeight: '100vh',
    disableClose: true,
    autoFocus: false
  });

  ref.afterClosed().subscribe(() => {
    this.isAddUserOpen = false;
  });
}

}