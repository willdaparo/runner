import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  NgZone,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { GpsTrackingService, GpsPoint, SessionState } from '../gpstraking/gps-tracking.service';
import { TerritoryService } from '../core/services/territory.service';
import { MatIconModule, MatIcon } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import {Router,RouterLink} from '@angular/router';

declare namespace google {
  namespace maps {
    class Map {
      constructor(el: Element, opts?: any);
      setCenter(position: { lat: number; lng: number }): void;
      panTo(position: { lat: number; lng: number }): void;
    }
    class Polyline {
      constructor(opts?: any);
      setPath(path: any): void;
    }
    class Polygon {
      constructor(opts?: any);
      setPath(path: any): void;
      setVisible(visible: boolean): void;
    }
    class Marker {
      constructor(opts?: any);
      setPosition(position: { lat: number; lng: number }): void;
      setMap(map: any): void;
    }
    type MapTypeStyle = any;
    const ControlPosition: any;
    const SymbolPath: any;
  }
}

@Component({
  selector: 'app-map',
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  imports: [MatIcon,RouterLink],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  // ─── Map objects ──────────────────────────────────────────────────────────
  private map!: google.maps.Map;
  private polyline!: google.maps.Polyline;
  private activePolygon!: google.maps.Polygon; // polígono del runner actual
  private startMarker!: google.maps.Marker;
  private positionMarker!: google.maps.Marker;

  // ─── UI state ─────────────────────────────────────────────────────────────
  sessionState: SessionState = 'idle';
  pointCount = 0;
  distanceKm = 0;
  elapsedTime = '00:00';
  errorMsg = '';
  conquestResult: { area_m2: number; reconquered: number } | null = null;

  private subs = new Subscription();
  private timerInterval: any;
  private startTime: number | null = null;

  private readonly MAP_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#0f0f1a' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f1a' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1f1f3a' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ];

  constructor(
    private gps: GpsTrackingService,
    private territoryService: TerritoryService,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.gps.reset();
    this.subs.add(
      this.gps.state$.subscribe((state) => {
        this.sessionState = state;
        if (state === 'running' && !this.startTime) {
          this.startTime = Date.now();
          this._startTimer();
        }
        if (state === 'finished' || state === 'idle') {
          this._stopTimer();
        }
      })
    );

    this.subs.add(
      this.gps.points$.subscribe((points) => {
        this.pointCount = points.length;
        if (points.length > 0) {
          this._updatePolyline(points);
          this._updatePositionMarker(points[points.length - 1]);
          this._updateDistance(points);
          if (points.length === 1) this._placeStartMarker(points[0]);
        }
      })
    );

    // Cuando el polígono se cierra → conquista
    this.subs.add(
      this.gps.polygonClosed$.subscribe((points) => {
        this._drawActivePolygon(points);
        this._triggerConquest();
      })
    );

    this.subs.add(
      this.gps.error$.subscribe((msg) => {
        this.errorMsg = msg;
        setTimeout(() => (this.errorMsg = ''), 5000);
      })
    );
  }

  ngAfterViewInit(): void {
    this._initMap();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this._stopTimer();
  }

  // ─── Acciones del usuario ─────────────────────────────────────────────────

  async onStart(): Promise<void> {
    this.startTime = null;
    this.conquestResult = null;
    this._clearActiveLayer();
    await this.gps.startSession();
    this._centerOnUser();
  }

  onPause(): void {
    this.gps.pauseSession();
    this._stopTimer();
  }

  onResume(): void {
    this.gps.resumeSession();
    this._startTimer();
  }

  async onFinish(): Promise<void> {
    await this.gps.finishSession();
  }

  onReset(): void {
    this.gps.reset();
    this._clearActiveLayer();
    this.distanceKm = 0;
    this.pointCount = 0;
    this.elapsedTime = '00:00';
    this.startTime = null;
    this.conquestResult = null;
  }

  // ─── Conquista ────────────────────────────────────────────────────────────

  private async _triggerConquest(): Promise<void> {
    // Use a safe access in case GpsTrackingService doesn't expose a typed getter for the session id
    const sessionId = (this.gps as any).currentSessionId; // expón este getter en GpsTrackingService
    if (!sessionId) return;

    const result = await this.territoryService.conquer(sessionId);
    if (!result) return;

    this.zone.run(() => {
      this.conquestResult = {
        area_m2: result.area_m2,
        reconquered: result.reconquered.length,
      };
      setTimeout(() => (this.conquestResult = null), 6000);
    });

    // Actualiza el mapa con los territorios reconquistados
    this.territoryService.updateAfterConquest(this.map, result.reconquered);
  }

  // ─── Map helpers ──────────────────────────────────────────────────────────

  private async _initMap(): Promise<void> {
    this.map = new google.maps.Map(this.mapContainer.nativeElement, {
      zoom: 17,
      center: { lat: 4.711, lng: -74.0721 },
      styles: this.MAP_STYLE,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM,
      },
    });

    this.polyline = new google.maps.Polyline({
      map: this.map,
      strokeColor: '#00f5a0',
      strokeOpacity: 1,
      strokeWeight: 4,
    });

    this.activePolygon = new google.maps.Polygon({
      map: this.map,
      strokeColor: '#00f5a0',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: '#00f5a0',
      fillOpacity: 0.25,
      visible: false,
    });

    // Carga y pinta todos los territorios existentes
    await this.territoryService.loadTerritories();
    this.territoryService.renderAll(this.map);
  }

  private _centerOnUser(): void {
    navigator.geolocation.getCurrentPosition((pos) => {
      this.zone.run(() => {
        this.map.setCenter({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      });
    });
  }

  private _updatePolyline(points: GpsPoint[]): void {
    const path = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    this.polyline.setPath(path);
    this.map.panTo(path[path.length - 1]);
  }

  private _updatePositionMarker(point: GpsPoint): void {
    const pos = { lat: point.lat, lng: point.lng };
    if (!this.positionMarker) {
      this.positionMarker = new google.maps.Marker({
        map: this.map,
        position: pos,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#00f5a0',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 10,
      });
    } else {
      this.positionMarker.setPosition(pos);
    }
  }

  private _placeStartMarker(point: GpsPoint): void {
    if (this.startMarker) this.startMarker.setMap(null);
    this.startMarker = new google.maps.Marker({
      map: this.map,
      position: { lat: point.lat, lng: point.lng },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#ff6b35',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      title: 'Inicio',
      zIndex: 9,
    });
  }

  private _drawActivePolygon(points: GpsPoint[]): void {
    const path = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    this.activePolygon.setPath(path);
    this.activePolygon.setVisible(true);
    this.polyline.setPath([]);
  }

  private _updateDistance(points: GpsPoint[]): void {
    if (points.length < 2) return;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this._haversine(points[i - 1], points[i]);
    }
    this.distanceKm = Math.round(total / 10) / 100;
  }

  private _haversine(a: GpsPoint, b: GpsPoint): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  private _clearActiveLayer(): void {
    this.polyline?.setPath([]);
    this.activePolygon?.setVisible(false);
    this.startMarker?.setMap(null);
    this.positionMarker?.setMap(null);
    (this.positionMarker as any) = null;
  }

  // ─── Timer ────────────────────────────────────────────────────────────────

  private _startTimer(): void {
    this._stopTimer();
    this.timerInterval = setInterval(() => {
      this.zone.run(() => {
        if (!this.startTime) return;
        const secs = Math.floor((Date.now() - this.startTime) / 1000);
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s = String(secs % 60).padStart(2, '0');
        this.elapsedTime = `${m}:${s}`;
      });
    }, 1000);
  }

  private _stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
