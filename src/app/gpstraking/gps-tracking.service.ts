import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface GpsPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

export type SessionState = 'idle' | 'running' | 'paused' | 'finished';

@Injectable({
  providedIn: 'root',
})
export class GpsTrackingService implements OnDestroy {
  // ─── Config ───────────────────────────────────────────────────────────────
  private readonly API_URL = 'https://runner-frontend-production.up.railway.app'; // Cambia por tu URL de Laravel
  private readonly CLOSE_THRESHOLD_METERS = 30;  // distancia para cerrar polígono
  private readonly MIN_ACCURACY_METERS = 20;     // ignora puntos con baja precisión
  private readonly SEND_INTERVAL_MS = 3000;      // cada cuánto envía puntos al back

  // ─── State ────────────────────────────────────────────────────────────────
  private watchId: number | null = null;
  private sendTimer: any = null;
  private sessionId: string | null = null;
  private pendingPoints: GpsPoint[] = [];

  readonly points$ = new BehaviorSubject<GpsPoint[]>([]);
  readonly state$ = new BehaviorSubject<SessionState>('idle');
  readonly polygonClosed$ = new Subject<GpsPoint[]>();
  readonly error$ = new Subject<string>();

  constructor(private zone: NgZone, private http: HttpClient) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Inicia una nueva sesión de carrera */
  async startSession(): Promise<void> {
    if (this.state$.value === 'running') return;

    if (!navigator.geolocation) {
      this.error$.next('Tu dispositivo no soporta geolocalización.');
      return;
    }

    try {
      // Crea la sesión en el backend
      const res: any = await this.http
        .post(`${this.API_URL}/sessions`, {})
        .toPromise();
      this.sessionId = res.session_id;
    } catch {
      this.error$.next('No se pudo crear la sesión en el servidor.');
      return;
    }

    this.points$.next([]);
    this.state$.next('running');
    this._startWatch();
    this._startSendTimer();
  }

  /** Pausa el tracking (sigue guardando la ruta) */
  pauseSession(): void {
    if (this.state$.value !== 'running') return;
    this._stopWatch();
    this._stopSendTimer();
    this.state$.next('paused');
  }

  /** Reanuda después de una pausa */
  resumeSession(): void {
    if (this.state$.value !== 'paused') return;
    this.state$.next('running');
    this._startWatch();
    this._startSendTimer();
  }

  /** Termina la sesión y envía los datos finales */
  async finishSession(): Promise<void> {
    if (this.state$.value === 'idle') return;
    this._stopWatch();
    this._stopSendTimer();
    await this._flushPendingPoints();
    await this._closeSession();
    this.state$.next('finished');
  }

  /** Resetea para empezar de nuevo */
  reset(): void {
    this._stopWatch();
    this._stopSendTimer();
    this.points$.next([]);
    this.pendingPoints = [];
    this.sessionId = null;
    this.state$.next('idle');
  }

  // ─── Google Maps helpers ──────────────────────────────────────────────────

  /** Convierte los puntos actuales a un arreglo de {lat,lng} para Polyline */
  getPolylinePath(): Array<{ lat: number; lng: number }> {
    return this.points$.value.map((p) => ({ lat: p.lat, lng: p.lng }));
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _startWatch(): void {
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.zone.run(() => this._onPosition(pos)),
      (err) => this.zone.run(() => this._onError(err)),
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );
  }

  private _stopWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private _startSendTimer(): void {
    this.sendTimer = setInterval(
      () => this._flushPendingPoints(),
      this.SEND_INTERVAL_MS
    );
  }

  private _stopSendTimer(): void {
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
  }

  private _onPosition(pos: GeolocationPosition): void {
    if (pos.coords.accuracy > this.MIN_ACCURACY_METERS) return; // descarta puntos imprecisos

    const point: GpsPoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      timestamp: pos.timestamp,
    };

    const current = this.points$.value;
    const updated = [...current, point];
    this.points$.next(updated);
    this.pendingPoints.push(point);

    // Verifica si el polígono se cerró
    if (updated.length > 10) {
      this._checkPolygonClosed(updated);
    }
  }

  private _onError(err: GeolocationPositionError): void {
    const messages: Record<number, string> = {
      1: 'Permiso de ubicación denegado.',
      2: 'Posición no disponible.',
      3: 'Tiempo de espera agotado.',
    };
    this.error$.next(messages[err.code] ?? 'Error de geolocalización.');
  }

  private _checkPolygonClosed(points: GpsPoint[]): void {
    const first = points[0];
    const last = points[points.length - 1];
    const dist = this._haversineDistance(first, last);

    if (dist <= this.CLOSE_THRESHOLD_METERS) {
      this.polygonClosed$.next([...points]);
      this.finishSession();
    }
  }

  /** Fórmula de Haversine — distancia en metros entre dos coordenadas */
  private _haversineDistance(a: GpsPoint, b: GpsPoint): number {
    const R = 6371000; // radio de la Tierra en metros
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const c =
      sinDLat * sinDLat +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
    return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  }

  /** Envía los puntos pendientes al backend */
  private async _flushPendingPoints(): Promise<void> {
    if (!this.pendingPoints.length || !this.sessionId) return;
    const batch = [...this.pendingPoints];
    this.pendingPoints = [];

    try {
      await this.http
        .post(`${this.API_URL}/sessions/${this.sessionId}/points`, {
          points: batch,
        })
        .toPromise();
    } catch {
      // Reencola los puntos si falla el envío
      this.pendingPoints = [...batch, ...this.pendingPoints];
    }
  }

  /** Cierra la sesión en el backend */
  private async _closeSession(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await this.http
        .patch(`${this.API_URL}/sessions/${this.sessionId}/finish`, {})
        .toPromise();
    } catch {
      this.error$.next('No se pudo cerrar la sesión en el servidor.');
    }
  }

  ngOnDestroy(): void {
    this._stopWatch();
    this._stopSendTimer();
  }
}
