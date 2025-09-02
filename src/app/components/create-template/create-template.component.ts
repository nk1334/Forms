import {
  Component,
  ElementRef,
  ViewChildren,
  QueryList,
  AfterViewInit,
  AfterViewChecked,
  OnInit,
  ChangeDetectorRef,
  HostListener
} from '@angular/core';
import {
  CdkDragDrop,
  CdkDragMove,
  CdkDragEnd,
  CdkDragStart,
  moveItemInArray,
  transferArrayItem
} from '@angular/cdk/drag-drop';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormService } from 'src/app/services/form.service';
import { BRANCHES, Branch } from 'src/app/permissions.model';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/services/auth.service';
export type ColumnType = 'text' | 'number' | 'date' | 'select';
export interface DataGridColumn {
  id: string;              // key used in row objects
  label: string;           // column header
  type: ColumnType;
  required?: boolean;
  options?: string[];      // for 'select'
  width?: number;          // optional UI hint
}

export interface DataGridConfig {
  columns: DataGridColumn[];
  addRowText?: string;
  minRows?: number;
  maxRows?: number;
}

export interface FormField {
  id: string;
  label: string;
  type: string;
  placeholder?: string;
  width?: number;
  height?: number;
  options?: { label: string; value?: string; checked?: boolean }[];
  value?: any;
 isDescription?: boolean; 
  // OLD meaning (keep only if you still use docked labels somewhere)
  labelDock?: 'top' | 'left' | 'right' | 'bottom';   // 👈 renamed
  role?: 'description' | 'normal'; 
  // Data grid (unchanged)
  gridConfig?: DataGridConfig;
  rows?: Array<Record<string, any>>;

  // outer card position
  position?: { x: number; y: number };
  row?: number;
  col?: number;


  nextNo?: number;
  required: boolean;
  layout?: 'row' | 'column';
problemItems?: { no: number; text: string; _size?: { w: number; h: number } }[];
  // inline layout flags (optional)
  inline?: boolean;
  inputFirst?: boolean;
  labelWidth?: number;
  inputWidth?: number;
  inputSize?: { w: number; h: number }; 
  // NEW: inner free-drag positions (used by draggable label/input)
  labelPos?: { x: number; y: number };
  inputPos?: { x: number; y: number };
  tagPos?: { x: number; y: number };
arrange?: 'dock' | 'free'; 
useTextarea?: boolean;                 // toggle between <input> and <textarea>
textareaPos?: { x: number; y: number };
textareaSize?: { w: number; h: number };
    _lockParentDrag?: boolean; 
}


interface FormPage {
  fields: FormField[];
}

interface SavedForm {
  formId: string;
     allowedBranches?: Branch[];
  formName?: string;
  formPages: FormPage[];
   firebaseId?: string; 
    _uiSelection?: Branch[];   
}



@Component({
  selector: 'app-create-template',
  templateUrl: './create-template.component.html',
  styleUrls: ['./create-template.component.scss']
})

export class CreateTemplateComponent implements OnInit, AfterViewInit, AfterViewChecked {
  branches = BRANCHES;              // ['ALL','MKAY','YAT','NSW']
selectedBranches: Branch[] = ['ALL'];
  @ViewChildren('canvasElement') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  isRemovingField: boolean = false;
  isDrawingSignature = false;

  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  isDragging: boolean[] = [];

  lastCanvasCount = 0;
  shouldClearSignatureCanvas = false;

  dashboardVisible = false;
  formBuilderVisible = true;
  fieldConfigVisible = false;
  formListVisible = false;
    popupTop = 0;
  popupLeft = 0;
  
  

  paletteFields: FormField[] = [
  { id: 'project-title', label: 'Project Name', type: 'project-title', required: false },
  { id: 'id', label: 'ID Field', type: 'id', required: false },

  { id: 'date', label: 'Date Field', type: 'date', required: false },
  { id: 'text', label: 'Text Field', type: 'text', required: false },
  { id: 'number', label: 'Number Field', type: 'number', required: false },
{ 
  id: 'email',
  label: 'Email Field',
  type: 'email',
  required: false,
  width: 340,    // outer draggable box width
  height: 64,    // outer draggable box height
  inline: true,          // start inline
  inputFirst: false,     // label on the left by default
  labelWidth: 120,       // px
  inputWidth: 180        // px
},
  { id: 'branch', label: 'Branch Field', type: 'branch', required: false },
  { id: 'tel', label: 'Phone Field', type: 'tel', required: false },
   { id: 'description', label: 'Description Field', type: 'textarea', required: false, isDescription: true },
  {
    id: 'radio',
    label: 'Radio Field',
    type: 'radio',
    options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
    layout: 'row',
    required: false
  },
  { id: 'file', label: 'Photo', type: 'file', required: false },
  { id: 'empty', label: 'Empty Box', type: 'empty', required: false },
  { id: 'signature', label: 'Signature', type: 'signature', required: false },
  { id: 'submit', label: 'Submit Button', type: 'submit', required: false },
  { id: 'data-grid', label: 'Data Grid', type: 'data-grid', required: false },
{ id: 'checkbox', label: 'Checkbox', type: 'checkbox', required: false,
  options: [
    { label: 'Option 1', value: 'opt1', checked: false },
    { label: 'Option 2', value: 'opt2', checked: false }
  ],
  width: 200, height: 44
},
];

  newField: FormField = this.getEmptyField();
  pendingFieldToAdd: FormField | null = null;
displayedColumns: string[] = ['name', 'visibleIn', 'current', 'actions'];
  formPages: FormPage[] = [{ fields: [] }];
  currentPage = 0;
  savedForms: SavedForm[] = [];
  currentFormId: string | null = null;
currentBranch: Branch | null = null;
canManageAllBranches = false; 

  freeDragPositions: { [fieldId: string]: { x: number; y: number } } = {};

  private idCounter = 0;

  pointerPosition = { x: 0, y: 0 };
  allowedWidths = [150, 300, 400];
selectedForm: SavedForm | null = null;
isEditingMaster = false; 
isClearing = false;
  constructor(
    
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
     private formService: FormService,
    private fb: FormBuilder,
      private authService: AuthService 
  ) { }

ngOnInit(): void {
  // 1) Clean locals first (no UI changes here, just storage hygiene)
  this.cleanupLocalDuplicates();
    // a) get the user branch (prefer service getter if you add one)
  const b = (localStorage.getItem('branch') as Branch | null) ?? null;
  this.currentBranch = (b && ['MACKAY','YAT','NSW','ALL'].includes(b)) ? b as Branch : 'ALL';

  // b) who can manage all branches? (toggle this however you like)
  // Example: only 'crew-leader' can manage all branches
  const role = this.authService.getUserRole();              // 'crew-leader' | 'crew-member' | 'ops'...
  this.canManageAllBranches = role === 'crew-leader';       // tweak to your needs

  // c) force the table to the user's branch (unless manager)
  this.listBranchFilter = this.canManageAllBranches ? (this.currentBranch ?? 'ALL')
                                                    : (this.currentBranch ?? 'ALL');

  // 2) Then handle route + preload list
  this.route.queryParams.subscribe(async params => {
    try {
      const templateId = params['templateId'] as string | undefined;

      // Preload Firebase list so open-by-id works reliably
      this.savedForms = await this.formService.getFormTemplates(); // must include firebaseId=d.id
      this.savedForms = (this.savedForms || []).map(f => ({
  ...f,
  _uiSelection: (f.allowedBranches?.length ? [...f.allowedBranches] : (['ALL'] as Branch[]))
}));

      // If navigated with ?templateId=..., open it if found by formId OR firebaseId
      if (templateId) {
        const found = this.savedForms.find(
          f => f.formId === templateId || (f as any).firebaseId === templateId
        );
        if (found) {
          this.openForm(found);
        } else {
          console.warn('Template not found in Firebase list:', templateId);
        }
      }
    } catch (e) {
      console.error('Init load failed', e);
      this.snackBar.open('Failed to load templates.', 'Close', { duration: 3000 });
    }
  });
}
inputId(field: FormField, suffix = ''): string {
  return suffix ? `${field.id}-${suffix}` : field.id;
}



saveTagPos(e: CdkDragEnd, f: FormField) {
  const p = e.source.getFreeDragPosition();
  f.tagPos = { x: p.x, y: p.y };
  this.lockParentDrag(f, false);
}

// If your template calls this for the input's drag end
saveInputPos(e: CdkDragEnd, f: FormField) {
  const p = e.source.getFreeDragPosition();
  f.inputPos = { x: p.x, y: p.y };
  this.lockParentDrag(f, false);
}


// If your template has a draggable textarea
saveTextareaPos(e: CdkDragEnd, f: FormField) {
  const p = e.source.getFreeDragPosition();
  f.textareaPos = { x: p.x, y: p.y };
  this.lockParentDrag(f, false);
}
rememberProblemItemSize(ev: MouseEvent, f: FormField, idx: number) {
  const el = ev.currentTarget as HTMLElement | null;
  if (!el) return;
  // persist size per item, not per whole field
  const w = Math.round(el.offsetWidth);
  const h = Math.round(el.offsetHeight);
  if (!f.problemItems || !f.problemItems[idx]) return;
  (f.problemItems[idx] as any)._size = { w, h };
}

// If your template lets the textarea be resized by user
rememberTextareaSize(ev: MouseEvent, f: FormField) {
  const el = ev.currentTarget as HTMLElement | null;
  if (!el) return;

  // Save inner size (for restoring after rerenders)
  f.textareaSize = { w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) };

  // Auto-grow the outer card height so it never clips the textarea
  const PADDING_AND_HEADER = 56;        // tweak if your header/padding differs
  const neededH = Math.round(el.offsetHeight + PADDING_AND_HEADER);
  if (!f.height || f.height < neededH) f.height = neededH;

  // Optional: widen outer if inner is now wider
  const SIDE_PADDING = 24;              // left+right paddings/borders
  const neededW = Math.round(el.offsetWidth + SIDE_PADDING);
  if (!f.width || f.width < neededW) f.width = neededW;
}
rememberInputSize(ev: MouseEvent, field: FormField) {
  const el = ev.currentTarget as HTMLElement; // the .inner-widget
  if (!el) return;
  field.inputSize = { w: el.offsetWidth, h: el.offsetHeight };
}
getBranchesModel(f: SavedForm): Branch[] {
  const sel = f?.allowedBranches ?? [];
  return sel.length ? [...sel] : ['ALL'];
}
async onTemplateBranchesChange(f: SavedForm, selection: Branch[] = []) {
  let uiSel = Array.isArray(selection) ? [...selection] : [];

  // Normalize selection: ALL is exclusive; empty -> ALL
  if (uiSel.includes('ALL') && uiSel.length > 1) uiSel = uiSel.filter(b => b !== 'ALL');
  if (uiSel.length === 0) uiSel = ['ALL'];

  // Update row state (drives "Current" chips instantly)
  f._uiSelection = [...uiSel];
  f.allowedBranches = [...uiSel];

  // If this form is open in editor, sync there too
  if (this.selectedForm && this.selectedForm.formId === f.formId) {
    this.selectedBranches = [...uiSel];
    this.selectedForm.allowedBranches = [...uiSel];
  }

  // Persist locally
  const local = this.readLocalTemplates();
  const idx = this.findRecordIndex(local, { formId: f.formId, firebaseId: f.firebaseId || null });
  if (idx >= 0) {
    local[idx] = { ...local[idx], allowedBranches: [...uiSel] };
    localStorage.setItem('savedFormPages', JSON.stringify(local));
  }

  // Persist remotely
  try {
    if (f.firebaseId) {
      await this.formService.updateFormTemplate(f.firebaseId, { allowedBranches: uiSel });
      await this.formService.updateTemplateInBranches(
        f.firebaseId,
        { formName: f.formName, formPages: f.formPages as any[], allowedBranches: uiSel },
        this.expandBranches(uiSel)
      );
    }
  } finally {
    // 🔁 Refresh array reference so MatTable re-evaluates the getter
    this.savedForms = [...this.savedForms];

    // 🚀 Auto-switch the list view so the row "moves" to that branch immediately
    this.listBranchFilter = uiSel.includes('ALL') ? 'ALL' : uiSel[0];

    // (Optional) confirmation toast
    const label = uiSel.includes('ALL') ? 'ALL' : uiSel.join(', ');
    this.snackBar.open(`Forms will load for: ${label}`, 'Close', { duration: 2000 });
  }
}
// Expands selection to concrete branches for the branch mirrors
private expandBranches(sel: Branch[]): Branch[] {
  const all: Branch[] = ['MACKAY', 'YAT', 'NSW'];
  return sel.includes('ALL') ? all : sel;
}
isDesc(f: FormField): boolean {
  // migrate old data once (role-based) without relying on label text
  if (f && f.isDescription == null && f.role === 'description') f.isDescription = true;
  return !!f?.isDescription;
}
private arraysEqual(a: Branch[] = [], b: Branch[] = []) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
toggleInline(field: FormField) {
  field.inline = !field.inline;
  // If switching to inline and widths are missing, seed them
  if (field.inline) {
    const total = field.width ?? 340;
    if (!field.labelWidth && !field.inputWidth) {
      field.labelWidth = Math.max(60, Math.min(140, Math.round(total * 0.35)));
      field.inputWidth = Math.max(100, total - field.labelWidth - 40); // minus gaps/handles
    }
  }
}

swapOrder(field: FormField) {
  field.inputFirst = !field.inputFirst;
}
async deleteForm(form: SavedForm): Promise<void> {
  const confirmDelete = confirm(`Delete template "${form.formName}"?`);
  if (!confirmDelete) return;

  try {
    // Remove from Firebase (if stored remotely)
    if (form.firebaseId) {
      await this.formService.deleteFormTemplate(form.firebaseId);
    }

    // Remove locally
    this.savedForms = this.savedForms.filter(f => f !== form);
    this.writeLocalTemplates(this.savedForms);

    this.snackBar.open('Template deleted', 'Close', { duration: 2000 });
  } catch (err) {
    console.error('Delete failed', err);
    this.snackBar.open('Failed to delete template', 'Close', { duration: 3000 });
  }
}
  trackBySavedForm(index: number, f: SavedForm): string {
  return (f.firebaseId && f.firebaseId.trim()) ? `fb:${f.firebaseId}` : `id:${f.formId}`;
}
// Inline splitter drag
startInlineResize(ev: MouseEvent, field: FormField) {
  ev.stopPropagation(); // don't start dragging the outer block
  ev.preventDefault();

  const startX = ev.clientX;
  const total = field.width ?? 340;
  const gapAndSplitter = 8 /*gap*/ + 6 /*splitter*/ + 8 /*gap*/;

  const startLabel = field.labelWidth ?? 120;
  const startInput = field.inputWidth ?? Math.max(100, total - startLabel - gapAndSplitter);

  const onMove = (e: MouseEvent) => {
    const dx = e.clientX - startX;
    let newLabel = startLabel + dx;

    // clamp
    newLabel = Math.max(40, Math.min(total - gapAndSplitter - 80, newLabel));
    const newInput = Math.max(80, total - gapAndSplitter - newLabel);

    field.labelWidth = Math.round(newLabel);
    field.inputWidth = Math.round(newInput);
    this.cdr.markForCheck();
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
}
hasAnyChecked(field: { options?: { checked?: boolean }[] }): boolean {
  return Array.isArray(field.options) && field.options.some(o => !!o?.checked);
}

  private cleanupLocalDuplicates(): void {
  const local: SavedForm[] = JSON.parse(localStorage.getItem('savedFormPages') || '[]');
  const seen = new Map<string, SavedForm>();
  for (const r of local) {
    const key = r.firebaseId || r.formId;   // prefer firebaseId when present
    if (!seen.has(key)) seen.set(key, r);
  }
  const cleaned = Array.from(seen.values());
  localStorage.setItem('savedFormPages', JSON.stringify(cleaned));
  this.savedForms = cleaned;
}
// Prefer firebaseId when present; otherwise use formId.
private identityKey(s: SavedForm): string {
  return (s.firebaseId && s.firebaseId.trim()) ? `fb:${s.firebaseId}` : `id:${s.formId}`;
}

// Find index in an array by matching identity with current record (by firebaseId, else formId)
private findRecordIndex(list: SavedForm[], rec: { formId?: string | null; firebaseId?: string | null }): number {
  const fb = (rec.firebaseId && rec.firebaseId.trim()) ? `fb:${rec.firebaseId}` : null;
  const id = (rec.formId && rec.formId.trim()) ? `id:${rec.formId}` : null;
  return list.findIndex(x => {
    const key = this.identityKey(x);
    return (fb && key === fb) || (!fb && id && key === id);
  });
}
private makeDataGridField(): FormField {
  return {
    id: this.generateId(),
    label: 'Data Grid',
    type: 'data-grid',
    required: false,
    position: { x: 0, y: 0 },
    width: 420,
    height: 180,
    gridConfig: {
      columns: [],
       
      addRowText: 'Add row',
      minRows: 0
    },
    rows: []   // no rows yet
  };
}
// Deduplicate by identity key (firebaseId wins when present)
private dedupeByIdentity(list: SavedForm[]): SavedForm[] {
  const m = new Map<string, SavedForm>();
  for (const r of list) m.set(this.identityKey(r), r);
  return Array.from(m.values());
}
onBranchesChange(selected: Branch[]) {
  this.selectedBranches = selected.includes('ALL') ? ['ALL'] : selected;
}
get branchesToSave(): Branch[] {
  return this.selectedBranches.includes('ALL')
    ? ['MACKAY','YAT','NSW']   // must match BRANCHES (without ALL)
    : this.selectedBranches.filter(b => b !== 'ALL');
}
// Safe parse for localStorage
private readLocalTemplates(): SavedForm[] {
  try {
    const raw = localStorage.getItem('savedFormPages');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Safe write to localStorage and keep in-memory copy in sync
private writeLocalTemplates(list: SavedForm[]): void {
  const clean = this.dedupeByIdentity(list);
  localStorage.setItem('savedFormPages', JSON.stringify(clean));
  this.savedForms = clean;
}
private async ensureTemplateInFirebase(
  name: string,
  pages: FormPage[],
  existingFirebaseId?: string | null
): Promise<string> {
  try {
    if (existingFirebaseId && existingFirebaseId.trim()) {
      await this.formService.updateFormTemplate(existingFirebaseId, {
        formName: name,
      formPages: this.formPages as any[],
  allowedBranches: this.selectedBranches  
});
      const allowed = this.selectedBranches.includes('ALL') ? [] : this.selectedBranches;
      return existingFirebaseId;
    } else {
      const ref = await this.formService.saveFormTemplate(name, pages as any[]);
      return ref.id;
    }
  } catch (e) {
    console.error('Firebase save failed', e);
    this.snackBar.open('Saved locally. Firebase save failed.', 'Close', { duration: 3000 });
    // Return existing id if we had one; otherwise return '' and let caller keep local-only
    return existingFirebaseId?.trim() ? existingFirebaseId : '';
  }
}
async clearAllSavedForms(): Promise<void> {
  if (!this.savedForms?.length) {
    this.snackBar.open('No saved forms to clear.', 'Close', { duration: 2000 });
    return;
  }

  // First confirmation
  const confirmAll = confirm('Delete ALL saved forms? This cannot be undone.');
  if (!confirmAll) return;

  // Ask whether to also delete from Firebase (if any have firebaseId)
  const hasRemote = this.savedForms.some(f => !!f.firebaseId);
  let alsoRemote = false;

  if (hasRemote) {
    alsoRemote = confirm('Also delete templates from Firebase? (OK = yes, Cancel = local only)');
  }

  this.isClearing = true;

  try {
    // 1) If requested, delete all Firebase templates we know about
    if (alsoRemote) {
      const ids = this.savedForms
        .map(f => f.firebaseId)
        .filter((id): id is string => !!id && id.trim().length > 0);

      if (ids.length) {
        // Run in parallel but don’t blow up on one failure
        const results = await Promise.allSettled(
          ids.map(id => this.formService.deleteFormTemplate(id))
        );

        // Log any failures (optional toast)
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed) {
          console.warn(`Failed to delete ${failed} Firebase templates.`);
          this.snackBar.open(`Some Firebase deletes failed (${failed}).`, 'Close', { duration: 3000 });
        }
      }
    }

    // 2) Clear local storage list & UI
    localStorage.removeItem('savedFormPages');
    this.savedForms = [];

    // Optionally reset selection/edit state
    this.selectedForm = null;
    this.currentFormId = null;

    this.snackBar.open(
      alsoRemote ? 'All templates deleted (local + Firebase).' : 'All local templates deleted.',
      'Close',
      { duration: 2500 }
    );
  } catch (e) {
    console.error('Clear all failed', e);
    this.snackBar.open('Failed to clear some items. Check console for details.', 'Close', { duration: 3000 });
  } finally {
    this.isClearing = false;
  }
}

 addProblemItem(field: FormField): void {
  if (!field.problemItems) field.problemItems = [];
  if (!field.nextNo) field.nextNo = 1;

  field.problemItems.push({
    no: field.nextNo,
    text: "",
    _size: field.textareaSize
      ? { w: field.textareaSize.w, h: field.textareaSize.h }
      : undefined,                 // or e.g. { w: 280, h: 80 }
  });

  field.nextNo++;
  this.cdr.detectChanges();
}
lockParentDrag(field: any, lock: boolean) {
  field._lockParentDrag = lock;
}

onEmailDragEnd(event: CdkDragEnd, field: any) {
  const pos = event.source.getFreeDragPosition();
  field.inputPos = { x: pos.x, y: pos.y };   // persist position
  this.lockParentDrag(field, false);         // re-enable parent drag
}
// Update problem text (used by your (ngModelChange))
updateProblemText(field: FormField, idx: number, value: string): void {
  if (!field.problemItems ) return;
  field.problemItems[idx].text=value;
}

// Delete problem and re-number
removeProblemItem(field: FormField, idx: number): void {
  if (!field.problemItems) return;
  field.problemItems.splice(idx, 1);
  field.problemItems.forEach((item, i) => item.no = i + 1);
  field.nextNo = field.problemItems.length + 1;
  this.cdr.detectChanges();
}

  syncContainerSize(textarea: HTMLTextAreaElement, event: MouseEvent) {
  const container = textarea.parentElement as HTMLElement;
  if (container) {
    // Update container width and height to match textarea's current size
    container.style.width = textarea.offsetWidth + 'px';
    container.style.height = textarea.offsetHeight + 'px';
  }
}
openNewTemplate(): void {
  this.formBuilderVisible = true;   // show builder
  this.formListVisible = false;     // hide list
  this.dashboardVisible = false;    // hide dashboard if shown
  this.selectedForm = null;         // reset selection
  this.currentFormId = null;
  this.formPages = [{ fields: [] }]; // fresh empty page
  this.cdr.detectChanges();

  setTimeout(() => {
    this.initCanvases();
    this.initializeFreeDragPositions();
  }, 0);
}
openForm(form: SavedForm): void {
  this.selectedForm = form;
  this.currentFormId = form.formId;
this.selectedBranches = (form.allowedBranches?.length ? [...form.allowedBranches] : ['ALL']);
  // (Make sure firebaseId is preserved on selectedForm)
  // form.firebaseId may be undefined for pure-local templates – that’s fine.
  this.formPages = JSON.parse(JSON.stringify(form.formPages));
  this.fixDuplicateIds();
  this.checkDuplicateIds();

  this.currentPage = 0;
  this.dashboardVisible = false;
  this.formBuilderVisible = true;
  this.formListVisible = false;

  this.cdr.detectChanges();
  setTimeout(() => {
    this.initCanvases();
    this.initializeFreeDragPositions();
  }, 0);
}
openFieldConfig() {
  const canvas = document.getElementById('formCanvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const popupWidth = 400;  // approx popup width in px
  const popupHeight = 280; // approx popup height in px

  // Start positioning popup near bottom-right corner of canvas
  let proposedTop = rect.height - popupHeight - 20; // 20px margin
  let proposedLeft = rect.width - popupWidth - 20;

  // Get all current field DOM elements inside canvas
  const fieldElements = canvas.querySelectorAll('.form-row');

  // Check if popup overlaps any field
  const isOverlapping = () => {
    for (let i = 0; i < fieldElements.length; i++) {
      const fieldEl = fieldElements[i] as HTMLElement;
      const fRect = fieldEl.getBoundingClientRect();

      // Convert field coordinates relative to canvas
      const fTop = fRect.top - rect.top;
      const fLeft = fRect.left - rect.left;
      const fBottom = fTop + fRect.height;
      const fRight = fLeft + fRect.width;

      // Popup boundaries
      const pTop = proposedTop;
      const pLeft = proposedLeft;
      const pBottom = pTop + popupHeight;
      const pRight = pLeft + popupWidth;

      // Check for rectangle overlap
      const overlap =
        !(pRight < fLeft || pLeft > fRight || pBottom < fTop || pTop > fBottom);

      if (overlap) return true;
    }
    return false;
  };

  // If overlap, move popup up by increments until no overlap or top < 10
  while (isOverlapping() && proposedTop > 10) {
    proposedTop -= 30;
  }

  // Set the final popup positions
  this.popupTop = proposedTop < 10 ? 10 : proposedTop;
  this.popupLeft = proposedLeft < 10 ? 10 : proposedLeft;

  this.fieldConfigVisible = true;
}
  private getEmptyField(): FormField {
    return {
      id: '',
      label: '',
      type: 'text',
      placeholder: '',
      width: 150,
      value: '',
      position: { x: 0, y: 0 },
      required:false
    };
  }
sampleCheckbox = {
  type: 'checkbox',
  options: [
    { label: 'Option 1', checked: false },
    { label: 'Option 2', checked: false },
    { label: 'Option 3', checked: false },
  ]
};

  generateId(): string {
    this.idCounter++;
    return 'field-' + Date.now() + '-' + this.idCounter + '-' + Math.random().toString(36).substr(2, 5);
  }

  ngAfterViewInit(): void {
    this.initCanvases();
  }

  private canvasInitScheduled = false;

  ngAfterViewChecked(): void {
    if (this.canvasRefs.length !== this.lastCanvasCount && !this.canvasInitScheduled) {
      this.canvasInitScheduled = true;
      setTimeout(() => {
        this.initCanvases();
        this.canvasInitScheduled = false;
        this.lastCanvasCount = this.canvasRefs.length;
      }, 100);
    }

    if (this.shouldClearSignatureCanvas) {
      setTimeout(() => {
        this.clearCanvasAfterDrop();
        this.shouldClearSignatureCanvas = false;
      }, 0);
    }
  }



  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.pointerPosition = { x: event.clientX, y: event.clientY };
  }
isRequiredField(field: FormField): boolean {
  const label = (field.label || '').trim().toLowerCase();
  const legacyRequired = label === 'crew name' || label === 'date' || label === 'signature';
  return !!field.required || legacyRequired;
}
labelEditing: string | null = null;

startLabelEdit(field: FormField, ev?: Event) {
  ev?.stopPropagation();
  this.labelEditing = field.id;
  setTimeout(() => {
    const el = document.querySelector(
      `.editable-label[data-id="${field.id}"]`
    ) as HTMLElement | null;   // ⬅️ note selector order
    el?.focus();
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  });
}
updateOptionLabel(field: FormField, index: number, ev: FocusEvent) {
  const el = ev.target as HTMLElement;
  const txt = (el.innerText || '').trim();
  if (!field.options) field.options = [];
  const curr = field.options[index] || { label: '' };
  field.options[index] = { ...curr, label: txt || `Option ${index + 1}` };
}
setLabelPos(f: FormField, pos: 'top'|'left'|'right'|'bottom') {
  if (!f) return;
  f.labelDock = pos;

  this.cdr.markForCheck();
}

finishLabelEdit(field: FormField, ev: FocusEvent | KeyboardEvent) {
  const el = ev.target as HTMLElement;
  const text = (el.innerText || '').trim();
  field.label = text || this.prettyLabelForType(field.type); // ← was 'Checkbox'
  this.labelEditing = null;
}

onLabelKeydown(field: FormField, ev: KeyboardEvent) {
  if (ev.key === 'Enter' || ev.key === 'Escape') {
    ev.preventDefault();
    (ev.target as HTMLElement).blur(); // triggers finishLabelEdit via (blur)
  }
}

// Is the required field filled?
isFieldFilled(field: FormField): boolean {
  if (!this.isRequiredField(field)) return true;


  switch (field.type) {
     case 'textarea':
      return this.isDesc(field)
        ? (field.problemItems?.length ?? 0) > 0
        : (typeof field.value === 'string' ? field.value.trim().length > 0 : !!field.value);

    case 'text':
    case 'email':
    case 'tel':
    case 'number':
    case 'textarea':
    case 'project-title':
      return typeof field.value === 'string' ? field.value.trim().length > 0 : !!field.value;

    case 'date':
      return !!field.value && String(field.value).trim().length > 0;

    case 'signature':
      return !!field.value && typeof field.value === 'string' && field.value.startsWith('data:image');

    case 'checkbox': // ⬅️ add this
      if (Array.isArray(field.options) && field.options.length) {
        return field.options.some(o => !!o?.checked);
      }
      return !!field.value; // fallback if ever used as single checkbox


         case 'data-grid': {
      const rows = field.rows || [];
      if (!rows.length) return false;
      const cols = field.gridConfig?.columns || [];
      // consider a row valid if ANY required column is non-empty
      return rows.some(r =>
        cols.some(c =>
          c.required
            ? r[c.id] !== null && r[c.id] !== undefined && String(r[c.id]).trim() !== ''
            : false
              )
      );
  }
      default:
      return true;
}}
// Any required fields missing across pages?
hasRequiredMissing(): boolean {
  for (const page of this.formPages) {
    for (const f of page.fields) {
      if (this.isRequiredField(f) && !this.isFieldFilled(f)) return true;
    }
  }
  return false;
}
addCheckboxOption(field: FormField) {
  field.options = field.options || [];
  const n = field.options.length + 1;
  field.options.push({ label: `Option ${n}`, value: `opt${n}`, checked: false });
}


removeCheckboxOption(field: FormField, idx: number) {
  field.options?.splice(idx, 1);
}

onOptionLabelBlur(e: Event, oi: number, opt: { label: string; value?: string; checked?: boolean }): void {
  const el = e.target as HTMLElement | null;
  const text = (el?.innerText || '').trim();
  opt.label = text || `Option ${oi + 1}`;
  this.cdr.markForCheck();
}
onOptionKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Enter' || ev.key === 'Escape') {
    ev.preventDefault();
    (ev.target as HTMLElement).blur();
  }
}

// Build a list of missing required field labels
 missingRequiredList(): string[] {
  const out: string[] = [];
  for (const page of this.formPages) {
    for (const f of page.fields) {
      if (this.isRequiredField(f) && !this.isFieldFilled(f)) {
        out.push(f.label || f.type);
      }
    }
  }
  return out;
}
  initializeFreeDragPositions() {
    this.freeDragPositions = this.freeDragPositions || {};
    this.formPages[this.currentPage].fields.forEach(field => {
      if (!field.position) {
        field.position = { x: 0, y: 0 };
      }
      this.freeDragPositions[field.id] = field.position;
    });
  }


  onFileSelected(event: Event, field: FormField): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (!file.type.startsWith('image/')) {
        this.snackBar.open('Only image files are supported', 'Close', { duration: 3000 });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        field.value = e.target.result; // base64 image string
      };
      reader.readAsDataURL(file);
    }
  }

  onDrop(event: CdkDragDrop<FormField[]>) {
    if (!event.isPointerOverContainer) return;

    const draggedField = event.item.data;

    // Check if it's a new field or one already on the canvas
    const isExistingField = this.formPages[this.currentPage].fields.some(
      f => f.id === draggedField.id
    );

    // Get drop position
    const containerRect = event.container.element.nativeElement.getBoundingClientRect();
    const nativeEvent = event.event as MouseEvent;
    const clientX = nativeEvent?.clientX ?? 0;
    const clientY = nativeEvent?.clientY ?? 0;
    const paddingLeft = 10;
    const paddingTop = 10;
    const rawX = clientX - containerRect.left + event.container.element.nativeElement.scrollLeft;
    const rawY = clientY - containerRect.top + event.container.element.nativeElement.scrollTop;

    const gridSize = 20;
    let snappedX = Math.round((rawX - paddingLeft) / gridSize) * gridSize;
    let snappedY = Math.round((rawY - paddingTop) / gridSize) * gridSize;

    // Avoid duplicate positions
    const existingPositions = this.formPages[this.currentPage].fields
      .filter(f => f.id !== draggedField.id) // only others
      .map(f => f.position);
    while (existingPositions.some(pos => pos?.x === snappedX && pos?.y === snappedY)) {
      snappedX += gridSize;
      snappedY += gridSize;
    }

    if (isExistingField) {
      // Just update position
      const field = this.formPages[this.currentPage].fields.find(f => f.id === draggedField.id);
      if (field) field.position = { x: snappedX, y: snappedY };
    } else {
      // Prepare newField for modal config instead of adding immediately
      this.newField = {
        ...draggedField,
        id: this.generateId(),
        label: draggedField.label || 'New Field',
        value: '',
        position: { x: snappedX, y: snappedY },
        width: 150 // default width if none provided
      };
      this.pendingFieldToAdd = this.newField;
      this.fieldConfigVisible = true;
    }

    this.initializeFreeDragPositions();
    this.fixDuplicateIds();
    this.cdr.detectChanges(); // optional but helps sometimes
  }

  onFieldDragStarted(event: CdkDragStart, field: FormField): void {
    const pos = field.position || { x: 0, y: 0 };
    event.source.setFreeDragPosition(pos);
  }

  onFieldDragMoved(event: CdkDragMove, field: FormField): void {
    const position = event.source.getFreeDragPosition();
    field.position = { x: position.x, y: position.y };
    this.cdr.detectChanges();
  }

  onFieldDragEnded(event: CdkDragEnd, field: FormField): void {
    const gridSize = 20;
    const maxWidth = 1000; // Prevents endless loop
    const pos = event.source.getFreeDragPosition();
    let x = Math.round(pos.x / gridSize) * gridSize;
    let y = Math.round(pos.y / gridSize) * gridSize;

    const others = this.formPages[this.currentPage].fields.filter(f => f.id !== field.id);
    let tries = 0;
    while (others.some(f => f.position?.x === x && f.position?.y === y) && tries < 50) {
      x += gridSize;
      if (x > maxWidth) { // arbitrary max width
        x = 0;
        y += gridSize;
      }
      tries++;
    }

    field.position = { x, y };
    event.source.setFreeDragPosition({ x, y });
    this.cdr.detectChanges();
  }

  onDragMoved(event: CdkDragMove<any>) {
    this.pointerPosition = { x: event.pointerPosition.x, y: event.pointerPosition.y };
  }
  prettyLabelForType(t: string): string {
  // fallbacks if no label given
  switch ((t || '').toLowerCase()) {
    case 'project-title': return 'Project Name';
    case 'id':            return 'ID';
    case 'tel':           return 'Phone';
    case 'signature':     return 'Signature';
    case 'data-grid':     return 'Data Grid';
    default:              return (t || 'Field').replace(/-/g, ' ')
                                              .replace(/\b\w/g, m => m.toUpperCase());
  }
}
ensureTagDefaults() {
  this.formPages.forEach(p =>
    p.fields.forEach(f => {
      if (!f.tagPos) f.tagPos = { x: 10, y: 8 };
      if (!f.label || !f.label.trim()) f.label = this.prettyLabelForType(f.type);
    })
  );
}
  createField(): void {
    if (!this.pendingFieldToAdd) return;
    const f = { ...this.pendingFieldToAdd };
    f.label = (f.label || '').trim() || this.prettyLabelForType(f.type);
f.tagPos = f.tagPos || { x: 10, y: 8 };

if (!f.labelDock) f.labelDock = 'left';  
if (!f.labelPos)  f.labelPos  = { x: 12, y: 12 }; // free-drag start point
if (!f.inputPos)  f.inputPos  = { x: 160, y: 12 };
  if (f.type === 'radio') {
    f.layout = f.layout || 'row';
  }
    // No need to restrict width to literals here, just ensure it's a number
    if (typeof f.width === 'string') {
      f.width = parseInt(f.width, 10);
    }
if (f.type === 'email') {
  f.arrange      = f.arrange || 'dock';           // start inline
  f.labelDock    = f.labelDock || 'left';         // label on the left
  f.inputWidth   = f.inputWidth || 220;

  // free-drag defaults (used when arrange === 'free')
  f.tagPos       = f.tagPos       || { x: 10,  y: 8 };
  f.inputPos     = f.inputPos     || { x: 12,  y: 36 };
  f.inputSize    = f.inputSize    || { w: 220, h: 40 };
}
if (f.type === 'checkbox') {
    if (!Array.isArray(f.options) || f.options.length === 0) {
      f.options = [
        { label: 'Option 1', value: 'opt1', checked: false },
        { label: 'Option 2', value: 'opt2', checked: false }
      ];
    }
    delete f.value; // we won't use single boolean for multi
  }
f.isDescription = !!f.isDescription;
if (f.isDescription) f.role = 'description';

// Description defaults
if (f.type === 'textarea') {
  if (f.isDescription) {
    if (!Array.isArray(f.problemItems)) f.problemItems = [];
    if (!Number.isFinite(f.nextNo as any)) f.nextNo = (f.problemItems.length || 0) + 1;
  }
  if (f.useTextarea === undefined) f.useTextarea = true;
  f.textareaPos  = f.textareaPos  || { x: 12, y: 36 };
  f.textareaSize = f.textareaSize || { w: 300, h: 120 };
}
 if (f.type === 'data-grid') {
    // Replace the simple palette placeholder with a full grid config
    const grid = this.makeDataGridField();
    grid.position = f.position;    // keep drop position
    grid.label = f.label || 'Data Grid';
    this.formPages[this.currentPage].fields.push(grid);
    this.fixDuplicateIds();
    this.pendingFieldToAdd = null;
    this.cancelFieldConfig();
    setTimeout(() => {
      this.initCanvases();
      this.initializeFreeDragPositions();
    }, 50);
    return; // <-- important: stop here for data-grid
  }
  

  f.id = this.generateId();

    if (f.type === 'project-title') f.value = f.value || '';
    if (f.type === 'branch') {
      f.options = [
        { value: '0', label: 'NSW' },
        { value: '1', label: 'Branch 0 - YATALA' },
        { value: '2', label: 'Branch 3 - MACKAY' }
      ];
    }

    this.formPages[this.currentPage].fields.push(f);
    this.fixDuplicateIds();
    this.pendingFieldToAdd = null;
    this.cancelFieldConfig();
    setTimeout(() => {
      this.initCanvases();
      this.initializeFreeDragPositions();
    }, 50);
  }

  cancelFieldConfig(): void {
    this.fieldConfigVisible = false;
    this.pendingFieldToAdd = null;
    this.newField = this.getEmptyField();
  }
setArrange(f: FormField, mode: 'dock'|'free') {
  f.arrange = mode;
  // optional: when switching to dock, snap widths nicely
  if (mode === 'dock') {
    f.labelWidth = f.labelWidth ?? 120;
    f.inputWidth = f.inputWidth ?? 220;
  }
  this.cdr.markForCheck();
}
  removeField(pageIndex: number, field: FormField): void {
    this.isRemovingField = true;
    this.formPages[pageIndex].fields = this.formPages[pageIndex].fields.filter(f => f !== field);
    delete this.ctxMap[field.id];
    delete this.drawingMap[field.id];
    delete this.freeDragPositions[field.id];

    setTimeout(() => {
      this.initCanvases();
      this.isRemovingField = false;
      this.initializeFreeDragPositions();
    }, 50);
  }
labelOrder(f: any) { return (f?.labelDock === 'right' || f?.labelDock === 'bottom') ? 2 : 1; }
ctrlOrder(f: any)  { return (f?.labelDock === 'right' || f?.labelDock === 'bottom') ? 1 : 2; }
rowLayout(f: any) {
  switch (f?.labelDock) {
    case 'left': case 'right': return { display:'flex', flexDirection:'row', alignItems:'center', gap:'8px' };
    case 'bottom':             return { display:'flex', flexDirection:'column-reverse', alignItems:'stretch', gap:'6px' };
    default:                   return { display:'flex', flexDirection:'column', alignItems:'stretch', gap:'6px' };
  }
}
labelStyle(f: any) { if (f?.labelDock === 'left' || f?.labelDock === 'right') return { width:'120px', margin:0 }; return { width:'auto', marginBottom:'4px' }; }
ctrlStyle(f: any)  { if (f?.labelDock === 'left' || f?.labelDock === 'right') return { flex:'1 1 auto', minWidth:'120px' }; return { width:'100%' }; }
onEmptyLabelInput(event: Event, field: any): void {
  const target = event.target as HTMLElement;
  field.label = target.innerText.trim();
}
  private ensureGridPositions(): void {
    this.formPages.forEach(page => {
      page.fields.forEach((field, index) => {
        if (field.row == null) {
          field.row = index + 1;
        }
        if (field.col == null) {
          field.col = (index % 2) + 1;
        }
      });
    });
  }

  private assignGridPositions() {
    const fields = this.formPages[this.currentPage].fields;
    fields.forEach((field, index) => {
      field.row = Math.floor(index / 2) + 1;
      field.col = (index % 2) + 1;
    });
  }

  private ensureFieldPositions(): void {
    this.formPages.forEach(page => {
      page.fields.forEach(field => {
        if (!field.position) {
          field.position = { x: 0, y: 0 };
        }
      });
    });
  }
resizingField: any = null;
startX = 0;
startY = 0;
startWidth = 0;
startHeight = 0;
resizeEdge: 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'|null = null;
startLeft = 0;
startTop = 0;
private readonly MIN_W = 10;
private readonly MIN_H = 10;

startResize(
  event: MouseEvent,
  field: any,
  isNearRight: boolean,
  isNearBottom: boolean,
  edge?: 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'   // NEW optional arg
) {
  event.stopPropagation();
  event.preventDefault();

  this.resizingField = field;
  this.resizeEdge = edge ?? (isNearRight || isNearBottom ? 'se' : 'se'); // default to SE if old call
  this.startX = event.clientX;
  this.startY = event.clientY;
  this.startWidth = field.width || 150;
  this.startHeight = field.height || 60;
  this.startLeft = field.position?.x ?? 0;
  this.startTop = field.position?.y ?? 0;

  document.addEventListener('mousemove', this.onResizeMove, true);
  document.addEventListener('mouseup', this.stopResize, true);
}
onFieldDroppedIntoGrid(event: CdkDragDrop<any>, gridField: any) {
  const dropped = event.item?.data;
  if (!gridField || !dropped) return;

  gridField.gridConfig ??= { columns: [] };
  const cols = gridField.gridConfig.columns;

  // Build a unique column id from the field
  const base = ((dropped.id || dropped.label || 'col') + '')
    .trim().toLowerCase().replace(/\s+/g, '_');
  let id = base, i = 1;
  while (cols.some((c: any) => c.id === id)) id = `${base}_${i++}`;

  // Store a LIGHT copy of the field as fieldDef (no position/drag stuff)
  const fieldDef = {
    type: dropped.type,
    label: dropped.label,
    placeholder: dropped.placeholder,
    options: dropped.options ? dropped.options.map((o: any) => ({ ...o })) : undefined
  };

  cols.push({
    id,
    label: dropped.label || 'Column',
    fieldDef,          // 👈 the original field definition for rendering
    type: fieldDef.type === 'radio' ? 'select' : fieldDef.type  // radio behaves as a select in cells
  });

  // Ensure each row has the new key
  gridField.rows = (gridField.rows || []).map((r: any) => ({ [id]: r[id] ?? (fieldDef.type === 'checkbox' ? [] : ''), ...r }));
}

/** Convert a palette field to a grid column config */
makeGridColumnFromField(field: any, existingCols: any[] = []) {
  const base = ((field.id || field.label || 'col') + '').trim().toLowerCase().replace(/\s+/g, '_');
  let id = base, i = 1;
  while (existingCols.some(c => c.id === id)) id = `${base}_${i++}`;

  const map: Record<string, string> = {
    text: 'text', number: 'number', date: 'date',
    select: 'select', radio: 'select', checkbox: 'select',
    email: 'text', tel: 'text', textarea: 'text', id: 'text', 'project-title': 'text'
  };

  const type = map[field.type] || 'text';
  const options = (type === 'select')
    ? (field.options || []).map((o: any) => o.value ?? o.label).filter(Boolean)
    : undefined;

  return { id, label: field.label || 'Column', type, options };
}

/** Rename a column from inline contenteditable */
renameGridColumn(gridField: any, colIndex: number, newLabel: string) {
  const col = gridField?.gridConfig?.columns?.[colIndex];
  if (col) col.label = (newLabel || col.label || '').trim();
}
addGridRow(gridField: any) {
  const cols = gridField?.gridConfig?.columns || [];
  const empty = cols.reduce((acc: any, c: any) => {
    acc[c.id] = c.fieldDef?.type === 'checkbox' ? [] : '';
    return acc;
  }, {});
  gridField.rows = [...(gridField.rows || []), empty];
}


removeGridRow(gridField: any, rowIndex: number) {
  (gridField.rows || []).splice(rowIndex, 1);
  gridField.rows = [...(gridField.rows || [])];
}

updateGridCell(field: FormField, rowIndex: number, colId: string, value: any): void {
  if (field.type !== 'data-grid' || !field.rows?.[rowIndex]) return;
  field.rows[rowIndex][colId] = value;
}

addGridColumn(field: FormField): void {
  if (field.type !== 'data-grid') return;
  const id = 'col' + Math.random().toString(36).slice(2, 6);
  const col: DataGridColumn = { id, label: 'Column', type: 'text' };
  field.gridConfig = field.gridConfig || { columns: [] };
  field.gridConfig.columns = [...field.gridConfig.columns, col];
  // backfill value for existing rows
  field.rows?.forEach(r => (r[id] = null));
}

removeGridColumn(gridField: any, colIndex: number) {
  const cols = gridField?.gridConfig?.columns || [];
  const col = cols[colIndex];
  if (!col) return;
  cols.splice(colIndex, 1);
  gridField.rows = (gridField.rows || []).map((r: any) => {
    const { [col.id]: _omit, ...rest } = r || {};
    return rest;
  });
}
onResizeMove = (event: MouseEvent) => {
  if (!this.resizingField) return;

  const dx = event.clientX - this.startX;
  const dy = event.clientY - this.startY;

 const edge = this.resizeEdge ?? 'se';

  let newW = this.startWidth;
  let newH = this.startHeight;
  let newLeft = this.startLeft;
  let newTop = this.startTop;

  const fromN = edge.includes('n');
  const fromS = edge.includes('s');
  const fromW = edge.includes('w');
  const fromE = edge.includes('e');

  // Horizontal
  if (fromE) newW = this.startWidth + dx;
  if (fromW) { newW = this.startWidth - dx; newLeft = this.startLeft + dx; }

  // Vertical
  if (fromS) newH = this.startHeight + dy;
  if (fromN) { newH = this.startHeight - dy; newTop = this.startTop + dy; }

  // Clamp to small positive sizes so handles remain usable
  newW = Math.max(this.MIN_W, Math.round(newW));
  newH = Math.max(this.MIN_H, Math.round(newH));

  this.resizingField.width = newW;
  this.resizingField.height = newH;
  this.resizingField.position = { x: Math.round(newLeft), y: Math.round(newTop) };
};

stopResize = (event: MouseEvent) => {
  document.removeEventListener('mousemove', this.onResizeMove, true);
  document.removeEventListener('mouseup', this.stopResize, true);
  this.resizingField = null;
  this.resizeEdge = null;
};

  loadFormById(formId: string): void {
    const form = this.savedForms.find(f => f.formId === formId);
     if (!form) { return; }

  this.selectedForm = form; 
    this.isEditingMaster = true;                         
       
      this.formPages = JSON.parse(JSON.stringify(form.formPages));

      this.fixDuplicateIds();
      this.checkDuplicateIds();

      this.currentPage = 0;
      this.currentFormId = form.formId;
      this.dashboardVisible = false;
      this.formBuilderVisible = true;
      this.formListVisible = false;
     

      this.cdr.detectChanges();

      setTimeout(() => {
        this.initCanvases();
        this.initializeFreeDragPositions();
      }, 0);
    }
  listBranchFilter: Branch = 'ALL';

// computed list the table will use
get filteredSavedForms(): SavedForm[] {
  // what we should filter by (but don't assign!)
  const target: Branch =
    !this.canManageAllBranches && this.currentBranch && this.currentBranch !== 'ALL'
      ? this.currentBranch
      : this.listBranchFilter;

  if (target === 'ALL') return this.savedForms ?? [];

  return (this.savedForms ?? []).filter(f => {
    const vis = f.allowedBranches?.length ? f.allowedBranches : (['ALL'] as Branch[]);
    return vis.includes('ALL') || vis.includes(target);
  });
}

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
  async loadSavedFormsList(kind: 'local' | 'firebase' | 'both' = 'both'): Promise<void> {
  try {
    // 1) Local templates (savedFormPages)
    const localRaw = localStorage.getItem('savedFormPages');
    const local: SavedForm[] = localRaw ? JSON.parse(localRaw) : [];

    const localNorm: SavedForm[] = local.map(it => ({
      formId: it.formId || this.generateId(),
      formName: it.formName || 'Untitled',
      formPages: it.formPages || [],
      firebaseId: it.firebaseId ?? undefined,
      allowedBranches: it.allowedBranches || ['ALL']  
    }));

    // If only local requested
    if (kind === 'local') {
      this.savedForms = localNorm;
      this.formListVisible = true;
      this.formBuilderVisible = false;
      return;
    }

    // 2) Firebase templates
    const remote = (kind === 'firebase' || kind === 'both')
      ? await this.formService.getFormTemplates()
      : [];

   const remoteNorm: SavedForm[] = (remote || []).map((it: any) => ({
  formId: it.formId,                  // ✅ use the service's formId
  formName: it.formName || 'Untitled',
  formPages: it.formPages || [],
  firebaseId: it.firebaseId ,
    allowedBranches: it.allowedBranches || ['ALL'],           // ✅ use the service's firebaseId
}));

    if (kind === 'firebase') {
      this.savedForms = remoteNorm;
      this.formListVisible = true;
      this.formBuilderVisible = false;
      return;
    }

    // 3) Merge (both): prefer Firebase copy when the same firebaseId exists locally
    const byFb = new Map<string, SavedForm>();
    remoteNorm.forEach(r => { if (r.firebaseId) byFb.set(r.firebaseId, r); });

    const merged: SavedForm[] = [];
    const seenLocal = new Set<string>();

    // take local, but replace with remote if same firebaseId exists
    for (const l of localNorm) {
      if (l.firebaseId && byFb.has(l.firebaseId)) {
        merged.push(byFb.get(l.firebaseId)!);
        seenLocal.add(l.firebaseId);
      } else {
        merged.push(l);
      }
    }

    // add any remote that didn’t have a local counterpart
 for (const r of remoteNorm) {
  if (r.firebaseId && seenLocal.has(r.firebaseId)) continue;
  if (merged.some(m => m.formId === r.formId)) continue;
  merged.push(r);
}

// --- build an index of remote by normalized name ---
const remoteByName = new Map<string, SavedForm>();
for (const r of remoteNorm) {
  const key = (r.formName || '').trim().toLowerCase();
  if (key) remoteByName.set(key, r);
}


// --- swap local-only items to their remote twin when names match ---
const reconciled: SavedForm[] = merged.map(item => {
  const hasFb = !!item.firebaseId && item.firebaseId.trim().length > 0;
  if (hasFb) return item;
  const key = (item.formName || '').trim().toLowerCase();
  const remoteMatch = key ? remoteByName.get(key) : undefined;
  return remoteMatch ?? item;
});

   // --- finally collapse duplicates by identity & by name (prefer remote) ---
let cleaned = this.dedupeByIdentity(reconciled);

cleaned = this.dedupeByNamePreferRemote(cleaned);

this.savedForms = cleaned;
this.formListVisible = true;
this.formBuilderVisible = false;
  } catch (e) {
    console.error('Failed to load templates', e);
    this.snackBar.open('Failed to load templates.', 'Close', { duration: 3000 });
  }
  this.savedForms = (this.savedForms || []).map(f => ({
  ...f,
  _uiSelection: (f.allowedBranches?.length ? [...f.allowedBranches] : (['ALL'] as Branch[]))
}));

}
private dedupeByNamePreferRemote(list: SavedForm[]): SavedForm[] {
  const byName = new Map<string, SavedForm>();

  for (const r of list) {
    const key = (r.formName || '').trim().toLowerCase();
    if (!key) {
      // unnamed forms: keep as-is (give them a random key so they don't collapse together)
      byName.set(Math.random().toString(), r);
      continue;
    }

    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, r);
      continue;
    }

    // prefer the one that has firebaseId
    if (!existing.firebaseId && r.firebaseId) {
      byName.set(key, r);
    }
  }

  return Array.from(byName.values());
}
private nextUntitledName(): string {
  const n = new Date();
  const pad = (x: number) => x.toString().padStart(2, '0');
  return `Untitled ${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())} ${pad(n.getHours())}${pad(n.getMinutes())}`;
}
async saveForm(): Promise<void> {
  if (!this.formPages?.[0]?.fields?.length) {
    this.snackBar.open('Cannot save an empty form', 'Close', { duration: 2500 });
    return;
  }

  // 1) Capture signatures (skip safely if canvas is not present)
  try {
    this.formPages.forEach(p =>
      p.fields.forEach(f => {
        if (f.type === 'signature') {
          const ref = this.canvasRefs?.find(r => r.nativeElement.getAttribute('data-id') === f.id);
          if (ref?.nativeElement) {
            f.value = ref.nativeElement.toDataURL();
          }
        }
      })
    );
  } catch { /* ignore capture errors to avoid blocking save */ }

  // 2) Load current local list
  const local = this.readLocalTemplates();

  // 3) Figure out name + firebaseId without prompting if editing
  const localIdxById = this.currentFormId
    ? local.findIndex(x => x.formId === this.currentFormId)
    : -1;

  let name = (this.selectedForm?.formName || local[localIdxById]?.formName || '').trim();
  let existingFirebaseId = (this.selectedForm?.firebaseId || local[localIdxById]?.firebaseId || null) || null;

  // If it's truly brand new (no selectedForm and no currentFormId), prompt once
  if (!this.currentFormId && !this.selectedForm) {
    const raw = prompt('Enter template name:', 'form') || '';
    name = raw.trim();
    if (!name) {
      this.snackBar.open('Please enter a valid name.', 'Close', { duration: 2500 });
      return;
    }
  }
  if (!name) name = 'Untitled';
  const selection = (this.selectedForm?.allowedBranches?.length
    ? [...this.selectedForm.allowedBranches!]
    : [...this.selectedBranches]);
let allowedForThis: Branch[];    // what we store on master doc
let branchesToMirror: Branch[];  // concrete copies to update/create

if (!this.canManageAllBranches) {
  // 🔒 Non-managers: lock to their branch only
  const b = (this.currentBranch ?? 'ALL');
  const concrete = (b === 'ALL') ? ['MACKAY','YAT','NSW'] as Branch[] : [b as Branch];
  allowedForThis = concrete;     // do NOT allow ALL sentinel for non-managers
  branchesToMirror = concrete;
} else {
  // Managers keep your current behavior
  allowedForThis = selection.length ? selection : (['ALL'] as Branch[]);
  branchesToMirror = selection.includes('ALL')
    ? ['MACKAY', 'YAT', 'NSW']
    : selection.filter(x => x !== 'ALL');
}


  // 4) Save to Firebase (update when firebaseId exists; else create)
  let firebaseId = '';
try {
  if (existingFirebaseId && existingFirebaseId.trim()) {
    // UPDATE master
    await this.formService.updateFormTemplate(existingFirebaseId, {
      formName: name,
        formPages: this.formPages as any[],
 allowedBranches: allowedForThis, 
    });


    // ✅ ALSO UPDATE branch copies
   await this.formService.updateTemplateInBranches(
  existingFirebaseId,
  { formName: name, formPages: this.formPages as any[], allowedBranches: allowedForThis },
    branchesToMirror
);

    firebaseId = existingFirebaseId;
  } else {
    // CREATE master + DUPLICATE into branches
    firebaseId = await this.formService.saveFormTemplateToBranches(
      name,
      this.formPages as any[],
        branchesToMirror,                                      // ✅ concrete list
        allowedForThis 
    );
  }
} catch (e) {
  console.error('Firebase save failed', e);
  this.snackBar.open('Saved locally. Firebase save failed.', 'Close', { duration: 3000 });
}
  // 5) Build final record
  const idToUse = this.currentFormId || this.selectedForm?.formId || this.generateId();
  const record: SavedForm = {
    formId: idToUse,
    formName: name,
    formPages: this.formPages,
    firebaseId: firebaseId && firebaseId.trim() ? firebaseId : undefined,
     allowedBranches: allowedForThis, 
  };

  // 6) Merge into local list by identity (prefers firebaseId)
  const idx = this.findRecordIndex(local, { formId: idToUse, firebaseId: record.firebaseId || null });
  if (idx >= 0) {
    local[idx] = record;
  } else {
    local.push(record);
  }

  // 7) Persist and sync in-memory list (dedupe by identity)
  this.writeLocalTemplates(local);

  // 8) Update component state consistently
  this.currentFormId = idToUse;
  this.selectedForm = record;
  this.selectedBranches = [...allowedForThis];
  this.snackBar.open('Template saved.', 'Close', { duration: 2000 });
}
displayBranches(f: SavedForm): string[] {
  const ab = f?.allowedBranches ?? [];
  return ab.length ? ab : ['All Branches'];
}
  saveFilledForm(): void {
      if (this.hasRequiredMissing()) {
    const missing = this.missingRequiredList().join(', ');
    this.snackBar.open(`Please fill required fields: ${missing}`, 'Close', { duration: 3000 });
    return;
  }
    const filledForms = JSON.parse(localStorage.getItem('filledForms') || '[]');

      const projectNameField = this.formPages[0].fields.find(f => f.id === 'project-title' || f.label === 'Project Name');
  const filledFormName = projectNameField?.value?.trim();

    if (!filledFormName || filledFormName.trim() === '') {
      alert('Please enter a valid name.');
      return;
    }

    filledForms.push({
      filledFormId: this.generateId(),
      templateFormId: this.currentFormId,
      formName: filledFormName,
      formPages: this.formPages,
      savedAt: new Date().toISOString()
    });

    localStorage.setItem('filledForms', JSON.stringify(filledForms));
    alert('Filled form saved successfully!');
  }

exportToPDF(): void {
  const filename = prompt('Enter filename for PDF', 'form');
  if (!filename) return;

  this.ensureFieldPositions();  // Keeps your positions valid in UI (safe to leave)

  const canvas = document.querySelector('.form-canvas');
  if (!canvas) {
    alert('No canvas found!');
    return;
  }
 

  // Clone canvas to avoid modifying original
  const clone = canvas.cloneNode(true) as HTMLElement;
clone.style.position = 'relative';
  clone.style.width = '794px';   // A4 width in px at 96dpi
  clone.style.height = '1123px'; // A4 height in px at 96dpi
  clone.style.overflow = 'visible';
const formCanvas = clone.querySelector('.form-canvas') as HTMLElement;
if (formCanvas) {
  formCanvas.style.display = 'flex';
  formCanvas.style.flexWrap = 'nowrap';  // prevent wrap to keep 6 fields in one row
  formCanvas.style.justifyContent = 'flex-start';
  formCanvas.style.gap = '8px';
  formCanvas.style.width = '100%';
}

  // Reset positioning for print-friendly output
  clone.querySelectorAll('.field').forEach((field: Element) => {
    const el = field as HTMLElement;
    const originalField = document.querySelector(`.field[data-id="${el.getAttribute('data-id')}"]`) as HTMLElement;

      if (el) {
    el.style.position = 'relative';
    el.style.left = '0';
    el.style.top = '0';
    el.style.marginBottom = '10px';
  el.style.width = el.offsetWidth + 'px';         // shrink width to fit 6 fields per row (794 / 6 ≈ 132px, 120px leaves margin)
  el.style.boxSizing = 'border-box';
  el.style.display = 'inline-block';  // inline block to sit side by side
  el.style.marginRight = '8px';   
           }     // some gap between fields
});

// If you have a row container, also set flex styles to prevent wrapping (optional)
const row = clone.querySelector('.fields-row');
if (row) {
  const rowEl = row as HTMLElement;
  rowEl.style.display = 'flex';
  rowEl.style.flexWrap = 'nowrap';
  rowEl.style.justifyContent = 'flex-start'; // align left, or 'space-between' if you want gaps to spread out
}

  // Create a hidden container to hold cloned content
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '-10000px';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  // Generate PDF
  import('html2pdf.js').then((html2pdf) => {
    html2pdf.default()
      .from(clone)
      .set({
        filename: `${filename}.pdf`,
        margin: 10,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .save()
      .then(() => {
        document.body.removeChild(wrapper); // Clean up
      });
  });
}

  private initCanvases(): void {
    this.ctxMap = {};
    this.drawingMap = {};

    this.canvasRefs.forEach(ref => {
      const canvas = ref.nativeElement;
      const fieldId = canvas.getAttribute('data-id')!;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
          const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

      // Setup canvas size with devicePixelRatio for sharpness
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
       canvas.style.width = width + 'px';     // <-- important!
    canvas.style.height = height + 'px';   // <-- important!
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      this.ctxMap[fieldId] = ctx;
      this.drawingMap[fieldId] = false;

      // Attach pointer event handlers
      canvas.onpointerdown = e => this.startDrawing(e, fieldId);
      canvas.onpointermove = e => this.draw(e, fieldId);
      canvas.onpointerup = e => this.stopDrawing(e, fieldId);
      canvas.onpointerleave = e => this.stopDrawing(e, fieldId);
    });
  }

  startDrawing(e: PointerEvent, fieldId: string): void {
     console.log('startDrawing', fieldId);
    const ctx = this.ctxMap[fieldId];
    const canvas = this.getCanvasById(fieldId);
    if (!ctx || !canvas) return;
    const pos = this.getPointerPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    this.drawingMap[fieldId] = true;
  }

  draw(e: PointerEvent, fieldId: string): void {
    if (!this.drawingMap[fieldId]) return;
    const ctx = this.ctxMap[fieldId];
    const canvas = this.getCanvasById(fieldId);
    if (!ctx || !canvas) return;
    const pos = this.getPointerPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  stopDrawing(e: PointerEvent, fieldId: string): void {
    if (!this.drawingMap[fieldId]) return;
    const ctx = this.ctxMap[fieldId];
    this.drawingMap[fieldId] = false;
    ctx?.closePath();
  }

  getCanvasById(fieldId: string): HTMLCanvasElement | undefined {
    return this.canvasRefs.find(ref => ref.nativeElement.getAttribute('data-id') === fieldId)?.nativeElement;
  }

  clearCanvas(fieldId: string): void {
    const canvas = this.getCanvasById(fieldId);
    if (!canvas) return;
    const ctx = this.ctxMap[fieldId];
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawingMap[fieldId] = false;
    }
  }


clearSignatureCanvas(fieldId: string): void {
  const canvas = this.getCanvasById(fieldId);
  if (!canvas) return;
  const ctx = this.ctxMap[fieldId];
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawingMap[fieldId] = false;

    const field = this.formPages[this.currentPage].fields.find(f => f.id === fieldId);
    if (field) {
      field.value = null;
    }
  }
}
addNewPage(): void {
    this.formPages.push({ fields: [] });
    this.currentPage = this.formPages.length - 1;
    this.cdr.detectChanges();
  }

  nextPage(): void {
    if (this.currentPage < this.formPages.length - 1) {
      this.currentPage++;
    }
  }

  prevPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }
    closeConfig(): void {
    this.fieldConfigVisible = false;
  }



  clearCanvasAfterDrop(): void {
    this.canvasRefs.forEach(ref => {
      const canvas = ref.nativeElement;
      const fieldId = canvas.getAttribute('data-id')!;
      const ctx = this.ctxMap[fieldId];
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawingMap[fieldId] = false;
      }
    });
  }


  getPointerPos(e: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onCanvasMouseDown(event: MouseEvent, field: FormField): void {
    const id = field.id;
    const ctx = this.ctxMap[id];
    if (!ctx) return;

    this.drawingMap[id] = true;
    ctx.beginPath();

    const canvas = event.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    ctx.moveTo(x, y);
  }

  onCanvasMouseMove(event: MouseEvent, field: FormField): void {
    if (!this.drawingMap[field.id]) return;
    const ctx = this.ctxMap[field.id];
    if (!ctx) return;

    const canvas = event.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  }

  onCanvasMouseUp(event: MouseEvent, field: FormField): void {
    const ctx = this.ctxMap[field.id];
    if (!ctx) return;

    this.drawingMap[field.id] = false;

    const canvas = event.target as HTMLCanvasElement;
    field.value = canvas.toDataURL();

    this.cdr.detectChanges();
  }

 

  onFieldMouseDown(event: MouseEvent, field: FormField): void {
    // If click near bottom-right corner, start resizing
    const target = event.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const resizeThreshold = 10;
    const isNearRight = offsetX >= rect.width - resizeThreshold;
    const isNearBottom = offsetY >= rect.height - resizeThreshold;

    if (isNearRight || isNearBottom) {
      // Provide all parameters, though defaults will work
      this.startResize(event, field, isNearRight, isNearBottom);
    }
  }
 
  fixDuplicateIds(): void {
    const allFields = this.formPages.flatMap(page => page.fields);
    const idCount: Record<string, number> = {};

    allFields.forEach(field => {
      if (!field.id) {
        field.id = this.generateId();
      }
      idCount[field.id] = (idCount[field.id] || 0) + 1;
    });

    allFields.forEach(field => {
      if (idCount[field.id] > 1) {
        field.id = this.generateId();
      }
    });
  }

  checkDuplicateIds(): void {
    const allFields = this.formPages.flatMap(page => page.fields);
    const ids = allFields.map(f => f.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      alert('Duplicate field IDs found! Please fix.');
    }
  }

  // New helper method for *ngFor trackBy to improve rendering
  trackByFieldId(index: number, field: FormField): string {
    return field.id;
  }

  // Needed if you want to handle mousemove on fields (optional)
  onFieldMouseMove(event: MouseEvent, field: FormField) {
    // Can be empty or do something if needed
  }

  // For handling contenteditable input changes, if any field uses it (optional)
  onContentEditableInput(event: Event, field: FormField) {
    const target = event.target as HTMLElement;
    field.value = target.innerText;
  }

  // Sample onSubmit handler for submit button (adjust to your needs)
  onSubmit() {
     if (this.hasRequiredMissing()) {
    const missing = this.missingRequiredList().join(', ');
    this.snackBar.open(`Please fill required fields: ${missing}`, 'Close', { duration: 3000 });
    return;
  }
    alert('Form submitted! You can extend this logic.');
  }
onDragStart(event: DragEvent, index: number): void {
    this.isDragging[index] = true;
  }

  onDragEnd(event: DragEvent, index: number): void {
    this.isDragging[index] = false;
  }
}