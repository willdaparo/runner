import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';

type GoogleMap = any;
type GooglePolygon = any;
type GoogleMapMouseEvent = any;

declare const google: any;

export interface Territory {
  id: number;
  user_id: number;
  name: string;
  color: string;
  polygon: { lat: number; lng: number }[];
  area_m2: number;
}

@Injectable({
  providedIn: 'root',
})
export class TerritoryService {
  private readonly API_URL = 'http://localhost:8000/api';

  readonly territories$ = new BehaviorSubject<Territory[]>([]);

  // Polígonos de Google Maps activos en el mapa
  private mapPolygons = new Map<number, GooglePolygon>();

  constructor(private http: HttpClient) {}

  // ─── Carga todos los territorios desde el backend ─────────────────────────

  async loadTerritories(): Promise<void> {
    try {
      const res: any = await this.http
        .get(`${this.API_URL}/territories`)
        .toPromise();
      this.territories$.next(res.territories ?? []);
    } catch {
      console.error('No se pudieron cargar los territorios.');
    }
  }

  // ─── Pinta todos los territorios en el mapa ───────────────────────────────

  renderAll(map: GoogleMap): void {
    this._clearAll();
    for (const territory of this.territories$.value) {
      this._renderOne(map, territory);
    }
  }

  // ─── Agrega un nuevo territorio al mapa (después de conquistar) ───────────

  addTerritory(map: GoogleMap, territory: Territory): void {
    const current = this.territories$.value;
    this.territories$.next([...current, territory]);
    this._renderOne(map, territory);
  }

  // ─── Elimina o actualiza un territorio rival recortado ────────────────────

  updateAfterConquest(
    map: GoogleMap,
    reconquered: { territory_id: number; action: string; remaining_points?: number }[]
  ): void {
    for (const item of reconquered) {
      if (item.action === 'deleted') {
        this._removePolygon(item.territory_id);
        const updated = this.territories$.value.filter(
          (t) => t.id !== item.territory_id
        );
        this.territories$.next(updated);
      }
    }
    // Recarga para obtener los territorios recortados actualizados
    this.loadTerritories().then(() => this.renderAll(map));
  }

  // ─── Llama al endpoint de conquista ───────────────────────────────────────

  async conquer(sessionId: string): Promise<{
    area_m2: number;
    reconquered: any[];
  } | null> {
    try {
      const res: any = await this.http
        .post(`${this.API_URL}/sessions/${sessionId}/conquer`, {})
        .toPromise();
      return { area_m2: res.area_m2, reconquered: res.reconquered };
    } catch (err) {
      console.error('Error al conquistar territorio:', err);
      return null;
    }
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  private _renderOne(map: GoogleMap, territory: Territory): void {
    const polygon = new google.maps.Polygon({
      map,
      paths: territory.polygon,
      strokeColor: territory.color,
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: territory.color,
      fillOpacity: 0.25,
      clickable: true,
    });

    // Tooltip al hacer clic en el polígono
    const infoWindow = new google.maps.InfoWindow();
    polygon.addListener('click', (event: GoogleMapMouseEvent) => {
      infoWindow.setContent(`
        <div style="font-family: sans-serif; padding: 4px 8px;">
          <strong style="color: ${territory.color}">${territory.name}</strong><br/>
          <span style="font-size: 12px; color: #666">
            ${(territory.area_m2 / 10000).toFixed(2)} ha
          </span>
        </div>
      `);
      infoWindow.setPosition(event.latLng!);
      infoWindow.open(map);
    });

    this.mapPolygons.set(territory.id, polygon);
  }

  private _removePolygon(territoryId: number): void {
    const poly = this.mapPolygons.get(territoryId);
    if (poly) {
      poly.setMap(null);
      this.mapPolygons.delete(territoryId);
    }
  }

  private _clearAll(): void {
    this.mapPolygons.forEach((poly) => poly.setMap(null));
    this.mapPolygons.clear();
  }
}
