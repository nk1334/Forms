import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';


/** What your component lists on the dashboard */
export interface SavedForm {
  formId: string;
  formName?: string;
  formPages: any[]; 
   source?: 'template' | 'filled';
  pdfUrl?: string | null;
 
}

/** Payload for saving a filled form instance with full page snapshot */
export interface FilledFormPayload {
  sourceFormId: string;     // original template id (if any)
  formName: string;         // human-friendly name shown in the dashboard
  name: string;             // user-entered instance name (alias if you want)
  data: any;                // flat values map (optional convenience)
  formPagesSnapshot: any[]; // FULL layout (pages + fields + values)
  preview?: string | null;  // base64 image preview (optional)
}

/** Collection names (centralize here if you ever rename) */
const TEMPLATES = 'formTemplates';
const FILLED    = 'formFilled';
const LEGACY    = 'formSubmissions'; // optional/legacy

@Injectable({ providedIn: 'root' })
export class FormService {
constructor(private afs: Firestore, private storage: Storage) {}
async uploadPdfBlob(
  kind: 'filled' | 'template',
  id: string,
  blob: Blob,
  filename: string
): Promise<string> {
  // a simple slug for the filename
  const safe = (filename || 'form')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const path = `${kind}/${id}/${Date.now()}_${safe || 'form'}.pdf`;
  const storageRef = ref(this.storage, path);

  await uploadBytes(storageRef, blob, { contentType: 'application/pdf',
     contentDisposition: `attachment; filename="${safe || 'form'}.pdf"`, 
  });
  return await getDownloadURL(storageRef);
}

async attachPdfUrl(
  kind: 'filled' | 'template',
  id: string,
  pdfUrl: string
): Promise<void> {
  const coll = kind === 'filled' ? 'formFilled' : 'formTemplates';
  const docRef = doc(this.afs, coll, id);
  await updateDoc(docRef, {
    pdfUrl,
    pdfUpdatedAt: serverTimestamp(),// optional
  });
}
  // ========================= TEMPLATES ===============================

  /** Create a template (layout only) */
  async saveFormTemplate(formName: string, formPages: any[]) {
    const colRef = collection(this.afs, TEMPLATES);
    return addDoc(colRef, {
      formName,
      formPages,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Update a template’s name/layout */
  async updateFormTemplate(templateId: string, data: { formName?: string; formPages?: any[] }) {
    const ref = doc(this.afs, TEMPLATES, templateId);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  /** Delete a template */
  async deleteTemplate(templateId: string) {
    const ref = doc(this.afs, TEMPLATES, templateId);
    await deleteDoc(ref);
  }

  /** Get a single template by id (normalized) */
  async getTemplateById(templateId: string): Promise<SavedForm | null> {
    const ref = doc(this.afs, TEMPLATES, templateId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data: any = snap.data();
    const formName = data.formName ?? data.templateName ?? '(Untitled)';
    const formPages = data.formPages ?? (data.fields ? [{ fields: data.fields }] : []);
    return { formId: snap.id, formName, formPages };
  }

  /** List templates (normalized) */
  async getFormTemplates(): Promise<SavedForm[]> {
    const colRef = collection(this.afs, TEMPLATES);
    const snap = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data: any = d.data();
      const formName = data.formName ?? data.templateName ?? '(Untitled)';
      const formPages =
        data.formPages ??
        (data.fields ? [{ fields: data.fields }] : []); // normalize legacy
    return { formId: d.id, formName, formPages, pdfUrl: data.pdfUrl ?? null };
    });
  }

  // ====== FILLED FORMS (FULL SNAPSHOT: LAYOUT + VALUES) ==============

  /** Create a FILLED instance (layout + values) */

  async createFilledForm(payload: {
    sourceFormId?: string;
    formName: string;
    name?: string;
    data: any;
    formPagesSnapshot: any[];
    preview?: string | null;
    updatedAt?: number; // client clock
  }) {
    const colRef = collection(this.afs, FILLED);
    return addDoc(colRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Update a FILLED instance’s name/pages/data/preview */
 async updateFilledForm(
    formId: string,
    data: Partial<{
      formName: string;
      name: string;
      data: any;
      formPagesSnapshot: any[];
      preview: string | null;
      updatedAt: number; // client clock
    }>
  ) {
    const ref = doc(this.afs, FILLED, formId);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  /** Delete a FILLED instance */
  async deleteFilledForm(formId: string) {
    const ref = doc(this.afs, FILLED, formId);
    await deleteDoc(ref);
  }

  /** Get a single FILLED instance by id (normalized) */
  async getFilledFormById(formId: string): Promise<SavedForm | null> {
    const ref = doc(this.afs, FILLED, formId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data: any = snap.data();
    return {
      formId: snap.id,
      formName: data.formName ?? data.name ?? '(Untitled)',
      formPages: data.formPagesSnapshot ?? [],
      pdfUrl: data.pdfUrl ?? null,
    };
  }

  /** List FILLED instances (normalized) */
  async getFilledForms(): Promise<SavedForm[]> {
    const colRef = collection(this.afs, FILLED);
    const snap = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data: any = d.data();
      return {
        formId: d.id, // instance id
        formName: data.formName ?? data.name ?? '(Untitled)',
        formPages: data.formPagesSnapshot ?? [],
           pdfUrl: data.pdfUrl ?? null,       
      source: 'filled',
      };
    });
  }

  // ============== SIMPLE SUBMISSIONS (legacy/optional) ===============

  /** Legacy/basic submission: saves only a values object (no layout) */
  async saveFormSubmission(templateId: string, filledData: any) {
    const colRef = collection(this.afs, LEGACY);
    return addDoc(colRef, {
      templateId,
      filledData,
      submittedAt: serverTimestamp(),
    });
  }

  // ========================= UTILITIES ===============================

  /** Convenience: merge templates + filled (if you want both in one call) */
  async getAllFormsMerged(): Promise<SavedForm[]> {
    const [templates, filled] = await Promise.all([this.getFormTemplates(), this.getFilledForms()]);
    const merged = [...templates, ...filled];

    // Stable, case-insensitive sort by name; empty names first
    merged.sort((a, b) =>
      (a.formName ?? '').localeCompare(b.formName ?? '', undefined, { sensitivity: 'base' })
    );

    return merged;
  }
}