import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Problem {
  id: number;
  description: string;
  status: 'Pending' | 'Completed';
}

@Component({
  selector: 'app-problem-tracker',
  templateUrl: './problem-tracker.component.html',
  styleUrls: ['./problem-tracker.component.scss']
})
export class ProblemTrackerComponent implements OnInit, AfterViewInit {
  newDescription: string = '';
  nextId = 1;
  problems: Problem[] = [];

  ngOnInit() {
    this.loadProblems();
  }

  ngAfterViewInit(): void {
    const resizers = document.querySelectorAll('.resizer');
    if (!resizers || resizers.length === 0) {
      console.warn('No resizer elements found!');
      return;
    }

    let startX: number;
    let startWidth: number;
    let currentTh: HTMLElement;

    resizers.forEach(resizer => {
      resizer.addEventListener('mousedown', (e: Event) => {
        const mouseEvent = e as MouseEvent;
        currentTh = (mouseEvent.target as HTMLElement).parentElement as HTMLElement;
        startX = mouseEvent.pageX;
        startWidth = currentTh.offsetWidth;

        const onMouseMove = (event: Event) => {
          const mouseMoveEvent = event as MouseEvent;
          const newWidth = startWidth + (mouseMoveEvent.pageX - startX);
          if (newWidth > 30) { // minimum column width
            currentTh.style.width = newWidth + 'px';
          }
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  importProblems(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const json = JSON.parse(e.target.result);
        if (Array.isArray(json)) {
          this.problems = json;
          this.nextId = this.problems.length ? Math.max(...this.problems.map(p => p.id)) + 1 : 1;
          this.saveProblems();
        } else {
          alert('Invalid file format');
        }
      } catch {
        alert('Could not parse file');
      }
    };
    reader.readAsText(file);
  }

  addProblem() {
    if (this.newDescription.trim()) {
      this.problems.push({
        id: this.nextId++,
        description: this.newDescription.trim(),
        status: 'Pending'
      });
      this.newDescription = '';
      this.saveProblems();
    } else {
      alert('Please enter a problem description');
    }
  }

  drop(event: CdkDragDrop<Problem[]>) {
    moveItemInArray(this.problems, event.previousIndex, event.currentIndex);
    this.saveProblems();
  }

  updateStatus() {
    this.saveProblems();
  }
  deleteProblem(id: number) {
  const confirmDelete = confirm('Are you sure you want to delete this problem?');
  if (confirmDelete) {
    this.problems = this.problems.filter(p => p.id !== id);
    this.saveProblems();
  }
}

  saveProblems() {
    localStorage.setItem('problems', JSON.stringify(this.problems));
  }

  loadProblems() {
    const saved = localStorage.getItem('problems');
    if (saved) {
      this.problems = JSON.parse(saved);
      this.nextId = this.problems.length ? Math.max(...this.problems.map(p => p.id)) + 1 : 1;
    }
  }

  // Export to Excel
  exportToExcel(): void {
    const worksheetData = this.problems.map(problem => ({
      Id: problem.id,
      Description: problem.description,
      Status: problem.status
    }));

    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Problems');
    XLSX.writeFile(workbook, 'problem-tracker.xlsx');
  }

  // Export to PDF
  exportToPDF(): void {
    const data = document.querySelector('table') as HTMLElement;
    if (!data) {
      alert('No data to export!');
      return;
    }
    html2canvas(data).then(canvas => {
      const imgWidth = 208;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const contentDataURL = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(contentDataURL, 'PNG', 0, 10, imgWidth, imgHeight);
      pdf.save('problem-tracker.pdf');
    });
  }
}