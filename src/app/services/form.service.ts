import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, Timestamp, getDocs } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class FormService {
  constructor(private firestore: Firestore) {}

  // 🔹 Save the form layout/template
  saveFormTemplate(templateName: string, formFields: any[]) {
    const templatesRef = collection(this.firestore, 'formTemplates');
    return addDoc(templatesRef, {
      templateName,
      fields: formFields,
      createdAt: Timestamp.now()
    });
  }

  // 🔹 Save filled form submission
  saveFormSubmission(templateId: string, filledData: any) {
    const submissionsRef = collection(this.firestore, 'formSubmissions');
    return addDoc(submissionsRef, {
      templateId,
      filledData,
      submittedAt: Timestamp.now()
    });
  }

  // 🔹 Load all templates from Firestore
  getFormTemplates(): Promise<any[]> {
    const templatesRef = collection(this.firestore, 'formTemplates');
    return getDocs(templatesRef).then((snapshot) =>
      snapshot.docs.map((doc) => ({
        formId: doc.id,
        ...doc.data()
      }))
    );
  }
}