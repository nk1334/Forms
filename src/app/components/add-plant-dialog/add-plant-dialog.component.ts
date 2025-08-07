import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { PlantService } from '../../services/plant.service';
import { MatDialogRef } from '@angular/material/dialog';
// Import your Plant service if you have one to fetch plants
interface Plant {
  plantName: string;
  regoName: string;
}
@Component({
  selector: 'app-add-plant-dialog',
  templateUrl: './add-plant-dialog.component.html',
  styleUrls: ['./add-plant-dialog.component.scss']
})
export class AddPlantDialogComponent {

  showForm = false;
  plantName = '';
  regoName = '';
  selectedPlant: Plant | null = null;
  plants$: Observable<Plant[]>; // Replace Plant with your interface/model

 constructor(
  private plantService: PlantService,
  private dialogRef: MatDialogRef<AddPlantDialogComponent> // <-- Inject here
) {
  this.plants$ = this.plantService.getPlants();
}



   onSubmit() {
    const data = {
      plantName: this.plantName,
      regoName: this.regoName
    };

    this.plantService.addPlant(data).then(() => {
      console.log('✅ Plant added successfully');
       this.dialogRef.close(data);  // <-- Pass the added plant here!
    }).catch(error => {
      console.error('❌ Error adding plant:', error);
    });
  }
 selectPlant() {
    if (this.selectedPlant) {
      this.dialogRef.close(this.selectedPlant);
    }
  }
  onCancel() {
    this.dialogRef.close();
  }
}
