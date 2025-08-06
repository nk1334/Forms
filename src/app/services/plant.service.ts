import { Injectable } from '@angular/core';
import { Firestore, collection,collectionData, addDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Plant {
  plantName: string;
  regoName: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlantService {


  constructor(private firestore: Firestore, private auth: Auth) {}

  getPlants(): Observable<Plant[]> {
    const plantsCollection = collection(this.firestore, 'plants');
    return collectionData(plantsCollection, { idField: 'id' }).pipe(
      map((plants: any[]) =>
        plants.map(plant => ({
          plantName: plant.plantName,
      regoName: plant.regoName
        }))
      )
    );
  }
 addPlant(data: { plantName: string; regoName: string }) {
  const plantRef = collection(this.firestore, 'plants');
  return addDoc(plantRef, data);
}
}
